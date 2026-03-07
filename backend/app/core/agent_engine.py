"""
Agent 引擎：Tool Calling 主循环，处理用户对话并调用 Docker 工具。
"""
import json
import re
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm_client import llm_client
from app.core.docker_manager import docker_manager
from app.core.memory import memory_manager
from app.core.webfetch import web_fetcher
from app.core.rollback_manager import rollback_manager
from app.core.app_dependency import (
    APP_DESCRIPTIONS,
    normalize_name,
    describe_relations_for_deployment,
    get_dependencies_for,
)
from app.mcp.docker_mcp import DOCKER_TOOLS

SYSTEM_PROMPT = """你是一个专业的 Docker 管理助手，名叫 DockerAgent。

你的职责：
1. 帮助用户用自然语言管理 Docker 容器、镜像、网络和数据卷
2. 智能感知应用之间的联动关系（如 Ollama 和 Open WebUI 需要共享网络）
3. 在执行任何部署操作前，自动做好回滚准备
4. 记住用户的偏好和重要配置

回复风格：
- 始终用中文回复，语气友好自然，像一个熟悉 Docker 的朋友
- 把技术信息转化为通俗易懂的表达
- 避免直接输出 JSON，将信息整理成有条理的文字
- 在执行危险操作（删除、停止等）时，先向用户确认
- 主动提示相关的注意事项和优化建议

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【部署工作流 - 非常重要，必须严格遵守】

当用户提供 GitHub URL / 项目名称，要求部署某个项目时，你必须按以下步骤操作：

步骤1：调用 analyze_project_requirements 工具分析项目
  - 获取项目的 README、docker-compose.yml、.env.example
  - 了解项目的用途和配置需求

步骤2：向用户介绍项目并逐一询问必填配置
  - 用通俗语言解释每个必填项是什么、有什么用
  - 对于 API Key，解释如何获取（官网链接、注册方法等）
  - 对于可选项，给出推荐的默认值
  - 不要一次列出所有问题，可以按功能分组询问
  - 例如："这个项目需要 Telegram Bot Token 才能发送通知，
    你需要在 Telegram 里找 @BotFather 创建一个 Bot 获取 Token，
    请把 Token 发给我，或者如果你暂时不需要 Telegram 通知，我们可以先跳过这个"

步骤3：用户确认所有配置后，调用 deploy_with_compose 工具
  - 把用户提供的所有值填入 env_vars
  - 执行实际部署

⚠️ 绝对不允许：在没有收集必填配置的情况下直接部署
⚠️ 对于有 .env.example 的项目，至少要询问标记为 required 的变量
⚠️ 如果用户说"帮我直接部署"，也要先分析是否有必填配置

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{memory_context}
{reflections_context}"""


class AgentEngine:

    async def _build_system_prompt(self, db: AsyncSession) -> str:
        memory_ctx = await memory_manager.build_memory_context(db)
        reflections = await memory_manager.get_latest_reflections(db, limit=2)
        reflections_ctx = ""
        if reflections:
            reflections_ctx = "\n【历史操作反思】\n" + "\n".join(f"- {r}" for r in reflections)
        return SYSTEM_PROMPT.format(
            memory_context=memory_ctx or "",
            reflections_context=reflections_ctx,
        )

    async def _execute_tool(
        self,
        tool_name: str,
        tool_input: Dict[str, Any],
        db: AsyncSession,
        session_id: str,
    ) -> str:
        """执行工具调用，返回结果字符串。"""
        try:
            if tool_name == "list_containers":
                result = await docker_manager.list_containers(all=tool_input.get("all", True))
                # 丰富容器描述
                enriched = []
                for c in result:
                    desc = APP_DESCRIPTIONS.get(normalize_name(c["name"]), "")
                    c["description"] = desc
                    enriched.append(c)
                return json.dumps(enriched, ensure_ascii=False, default=str)

            elif tool_name == "get_container":
                result = await docker_manager.get_container(tool_input["container_id"])
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "start_container":
                await docker_manager.start_container(tool_input["container_id"])
                return f"容器 {tool_input['container_id']} 已启动"

            elif tool_name == "stop_container":
                await docker_manager.stop_container(tool_input["container_id"])
                return f"容器 {tool_input['container_id']} 已停止"

            elif tool_name == "restart_container":
                await docker_manager.restart_container(tool_input["container_id"])
                return f"容器 {tool_input['container_id']} 已重启"

            elif tool_name == "remove_container":
                await docker_manager.remove_container(
                    tool_input["container_id"],
                    force=tool_input.get("force", False),
                )
                return f"容器 {tool_input['container_id']} 已删除"

            elif tool_name == "get_container_logs":
                logs = await docker_manager.get_container_logs(
                    tool_input["container_id"],
                    tail=tool_input.get("tail", 100),
                )
                return logs

            elif tool_name == "run_container":
                # 部署前先快照
                try:
                    await rollback_manager.take_snapshot(
                        db,
                        name=f"auto_before_run_{tool_input.get('name', tool_input['image'])}",
                        description=f"部署 {tool_input['image']} 前的自动快照",
                        is_auto=True,
                    )
                except Exception:
                    pass

                result = await docker_manager.run_container(
                    image=tool_input["image"],
                    name=tool_input.get("name"),
                    ports=tool_input.get("ports"),
                    env=tool_input.get("env"),
                    volumes=tool_input.get("volumes"),
                    network=tool_input.get("network"),
                    command=tool_input.get("command"),
                    restart_policy=tool_input.get("restart_policy", "unless-stopped"),
                )
                return json.dumps(result, ensure_ascii=False)

            elif tool_name == "pull_image":
                result = await docker_manager.pull_image(
                    tool_input["image"],
                    tag=tool_input.get("tag", "latest"),
                )
                return json.dumps(result, ensure_ascii=False)

            elif tool_name == "list_images":
                result = await docker_manager.list_images()
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "remove_image":
                await docker_manager.remove_image(
                    tool_input["image_id"],
                    force=tool_input.get("force", False),
                )
                return f"镜像 {tool_input['image_id']} 已删除"

            elif tool_name == "list_networks":
                result = await docker_manager.list_networks()
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "create_network":
                result = await docker_manager.create_network(
                    tool_input["name"],
                    driver=tool_input.get("driver", "bridge"),
                )
                return json.dumps(result, ensure_ascii=False)

            elif tool_name == "remove_network":
                await docker_manager.remove_network(tool_input["network_id"])
                return f"网络 {tool_input['network_id']} 已删除"

            elif tool_name == "connect_to_network":
                await docker_manager.connect_container_to_network(
                    tool_input["network_id"],
                    tool_input["container_id"],
                )
                return f"容器 {tool_input['container_id']} 已连接到网络 {tool_input['network_id']}"

            elif tool_name == "list_volumes":
                result = await docker_manager.list_volumes()
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "create_volume":
                result = await docker_manager.create_volume(
                    tool_input["name"],
                    driver=tool_input.get("driver", "local"),
                )
                return json.dumps(result, ensure_ascii=False)

            elif tool_name == "get_system_info":
                result = await docker_manager.get_system_info()
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "fetch_deployment_info":
                result = await web_fetcher.resolve_source(tool_input["source"])
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "analyze_project_requirements":
                github_url = tool_input["github_url"].strip()
                # 从 URL 中提取 owner/repo
                match = re.match(r"https?://github\.com/([^/]+)/([^/\s?#]+)", github_url)
                if not match:
                    return "无法解析 GitHub URL，请提供格式如 https://github.com/owner/repo 的地址"
                owner, repo = match.group(1), match.group(2).rstrip(".git")
                analysis = await web_fetcher.analyze_github_project(owner, repo)

                # 构建友好的文本摘要，便于 LLM 理解
                lines = [
                    f"# 项目分析结果：{owner}/{repo}",
                    f"仓库地址：{analysis['repo_url']}",
                    "",
                ]
                if analysis.get("readme_summary"):
                    lines += ["## README 摘要（前3000字）", analysis["readme_summary"][:2000], ""]

                if analysis.get("has_compose"):
                    lines += ["## docker-compose.yml 内容", "```yaml", analysis["compose_content"], "```", ""]
                else:
                    lines += ["## 注意", "该仓库没有找到 docker-compose.yml，需要手动构建部署方式", ""]

                env_cfg = analysis.get("env_config", {})
                required_vars = env_cfg.get("required", [])
                optional_vars = env_cfg.get("optional", [])

                if required_vars:
                    lines += [f"## 必填配置项（共 {len(required_vars)} 个）- 部署前必须收集"]
                    for v in required_vars:
                        desc = v.get("description", "")
                        example = v.get("example", "")
                        line = f"- **{v['key']}**"
                        if desc:
                            line += f"：{desc}"
                        if example:
                            line += f"（示例：{example}）"
                        lines.append(line)
                    lines.append("")
                else:
                    lines += ["## 配置项", "该项目没有检测到必填环境变量，可以直接部署。", ""]

                if optional_vars:
                    lines += [f"## 可选配置项（共 {len(optional_vars)} 个，有默认值）"]
                    for v in optional_vars[:15]:  # 最多展示15个可选项
                        desc = v.get("description", "")
                        default = v.get("default", "")
                        line = f"- {v['key']}"
                        if desc:
                            line += f"：{desc}"
                        if default:
                            line += f"（默认：{default}）"
                        lines.append(line)
                    if len(optional_vars) > 15:
                        lines.append(f"  ...以及另外 {len(optional_vars) - 15} 个可选项")
                    lines.append("")

                return "\n".join(lines)

            elif tool_name == "deploy_with_compose":
                import os
                import subprocess
                import tempfile

                project_name = re.sub(r"[^a-z0-9_-]", "-", tool_input["project_name"].lower())
                compose_content = tool_input["compose_content"]
                env_vars: Dict[str, str] = tool_input.get("env_vars") or {}

                # 在 /opt/docker-projects/<project_name> 下创建工作目录
                work_dir = f"/opt/docker-projects/{project_name}"
                os.makedirs(work_dir, exist_ok=True)

                # 写 docker-compose.yml
                compose_path = os.path.join(work_dir, "docker-compose.yml")
                with open(compose_path, "w", encoding="utf-8") as f:
                    f.write(compose_content)

                # 写 .env 文件
                if env_vars:
                    env_path = os.path.join(work_dir, ".env")
                    with open(env_path, "w", encoding="utf-8") as f:
                        for k, v in env_vars.items():
                            f.write(f'{k}={v}\n')

                # 执行 docker-compose up -d
                try:
                    proc = subprocess.run(
                        ["docker", "compose", "-p", project_name, "up", "-d", "--pull", "always"],
                        cwd=work_dir,
                        capture_output=True,
                        text=True,
                        timeout=300,
                    )
                    output = (proc.stdout + proc.stderr).strip()
                    if proc.returncode == 0:
                        return (
                            f"部署成功！项目 `{project_name}` 已启动。\n"
                            f"工作目录：{work_dir}\n"
                            f"输出：\n{output[-2000:] if len(output) > 2000 else output}"
                        )
                    else:
                        return (
                            f"部署失败（退出码 {proc.returncode}）。\n"
                            f"工作目录：{work_dir}\n"
                            f"错误输出：\n{output[-3000:] if len(output) > 3000 else output}"
                        )
                except subprocess.TimeoutExpired:
                    return "部署超时（5分钟），请检查网络连接或镜像拉取情况，可以手动运行 `docker compose logs` 查看详情。"

            elif tool_name == "save_memory":
                await memory_manager.set_memory(
                    db,
                    key=tool_input["key"],
                    value=tool_input["value"],
                    category=tool_input.get("category", "general"),
                )
                return f"已记住：{tool_input['key']} = {tool_input['value']}"

            else:
                return f"未知工具: {tool_name}"

        except Exception as e:
            return f"工具执行出错: {str(e)}"

    async def chat(
        self,
        db: AsyncSession,
        session_id: str,
        user_message: str,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        处理一次用户消息，通过 Tool Calling 循环执行操作。
        yield 结构化事件 dict：
          {"type": "think",       "content": "..."}        # 思考过程
          {"type": "tool_start",  "id": ..., "name": ..., "display_name": ..., "input": ...}
          {"type": "tool_result", "id": ..., "result": ..., "is_error": False}
          {"type": "chunk",       "content": "..."}        # 最终回复流式片段
        """
        enriched_message = await self._enrich_with_dependency_hints(
            db, user_message, session_id
        )
        await memory_manager.save_message(db, session_id, "user", enriched_message)

        history = await memory_manager.get_session_history(db, session_id, limit=30)
        system = await self._build_system_prompt(db)
        is_anthropic = llm_client.provider == "anthropic"
        messages = (
            self._build_anthropic_messages(history)
            if is_anthropic
            else self._build_openai_messages(history)
        )

        max_iterations = 8

        for _ in range(max_iterations):
            response = await llm_client.chat(
                messages=messages,
                tools=DOCKER_TOOLS,
                system=system,
            )

            if not response["tool_calls"]:
                # 没有工具调用 → 解析 <think> 后流式返回最终回复
                content = response["content"] or ""

                if content.strip():
                    # 有内容 → 解析 think 标签后分块发送
                    clean_content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
                    await memory_manager.save_message(db, session_id, "assistant", clean_content or content)
                    async for event in self._parse_think_events(content):
                        yield event
                else:
                    # 内容为空 → 用真流式 API 获取回复（兜底）
                    full_text = ""
                    async for event in llm_client.chat_stream_events(messages, system=system):
                        full_text += event["content"]
                        yield event
                    clean_text = re.sub(r'<think>.*?</think>', '', full_text, flags=re.DOTALL).strip()
                    await memory_manager.save_message(db, session_id, "assistant", clean_text or full_text)

                await self._maybe_reflect(db, session_id)
                return

            # ── 有工具调用 → 执行工具并发送结构化事件 ──────────────────
            tool_result_map: Dict[str, str] = {}

            for tc in response["tool_calls"]:
                tool_id = tc["id"]
                tool_name = tc["name"]

                yield {
                    "type": "tool_start",
                    "id": tool_id,
                    "name": tool_name,
                    "display_name": self._tool_display_name(tool_name),
                    "input": tc["input"],
                }

                result_str = await self._execute_tool(tool_name, tc["input"], db, session_id)
                is_error = result_str.startswith("工具执行出错")
                tool_result_map[tool_id] = result_str

                yield {
                    "type": "tool_result",
                    "id": tool_id,
                    "result": result_str,
                    "is_error": is_error,
                }

            # 保存到 DB
            await memory_manager.save_message(
                db, session_id, "assistant",
                response["content"],
                tool_calls=response["tool_calls"],
            )
            for tc in response["tool_calls"]:
                await memory_manager.save_message(
                    db, session_id, "tool",
                    tool_result_map[tc["id"]],
                    tool_call_id=tc["id"],
                )

            # ── 按 provider 格式追加消息，让下一轮 LLM 能看到工具结果 ──
            if is_anthropic:
                assistant_content: List[Dict[str, Any]] = []
                if response["content"]:
                    assistant_content.append({"type": "text", "text": response["content"]})
                for tc in response["tool_calls"]:
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc["input"],
                    })
                tool_results_block = [
                    {"type": "tool_result", "tool_use_id": tc["id"], "content": tool_result_map[tc["id"]]}
                    for tc in response["tool_calls"]
                ]
                messages.append({"role": "assistant", "content": assistant_content})
                messages.append({"role": "user", "content": tool_results_block})
            else:
                # OpenAI / custom 格式
                messages.append({
                    "role": "assistant",
                    "content": response["content"] or None,
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": json.dumps(tc["input"], ensure_ascii=False),
                            },
                        }
                        for tc in response["tool_calls"]
                    ],
                })
                for tc in response["tool_calls"]:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": tool_result_map[tc["id"]],
                    })

        yield {"type": "chunk", "content": "\n（操作已完成，如有问题请继续提问）\n"}

    async def _parse_think_events(self, text: str) -> AsyncIterator[Dict[str, Any]]:
        """将已有文本按 <think> 标签拆分为结构化事件（用于非流式场景）。"""
        import re
        parts = re.split(r'(<think>.*?</think>)', text, flags=re.DOTALL)
        for part in parts:
            if part.startswith('<think>') and part.endswith('</think>'):
                content = part[7:-8]
                if content:
                    yield {"type": "think", "content": content}
            elif part:
                # 分小块模拟流式
                chunk_size = 40
                for i in range(0, len(part), chunk_size):
                    yield {"type": "chunk", "content": part[i:i+chunk_size]}

    def _build_openai_messages(
        self, history: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """将数据库历史转换为 OpenAI / custom 兼容的 messages 格式。"""
        messages = []
        for h in history:
            role = h.get("role")
            if role == "user":
                messages.append({"role": "user", "content": h["content"]})
            elif role == "assistant":
                if h.get("tool_calls"):
                    messages.append({
                        "role": "assistant",
                        "content": h.get("content") or None,
                        "tool_calls": [
                            {
                                "id": tc["id"],
                                "type": "function",
                                "function": {
                                    "name": tc["name"],
                                    "arguments": json.dumps(tc["input"], ensure_ascii=False),
                                },
                            }
                            for tc in h["tool_calls"]
                        ],
                    })
                else:
                    messages.append({"role": "assistant", "content": h["content"]})
            elif role == "tool":
                messages.append({
                    "role": "tool",
                    "tool_call_id": h.get("tool_call_id", ""),
                    "content": h["content"],
                })
        return messages

    def _build_anthropic_messages(
        self, history: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """将数据库中的历史转换为 Anthropic messages 格式。"""
        messages = []
        for h in history:
            role = h.get("role")
            if role == "user":
                messages.append({"role": "user", "content": h["content"]})
            elif role == "assistant":
                if h.get("tool_calls"):
                    content = []
                    if h.get("content"):
                        content.append({"type": "text", "text": h["content"]})
                    for tc in h["tool_calls"]:
                        content.append({
                            "type": "tool_use",
                            "id": tc["id"],
                            "name": tc["name"],
                            "input": tc["input"],
                        })
                    messages.append({"role": "assistant", "content": content})
                else:
                    messages.append({"role": "assistant", "content": h["content"]})
            elif role == "tool":
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": h.get("tool_call_id", ""),
                        "content": h["content"],
                    }]
                })
        return messages

    def _tool_display_name(self, tool_name: str) -> str:
        names = {
            "list_containers": "查询容器列表",
            "get_container": "获取容器详情",
            "start_container": "启动容器",
            "stop_container": "停止容器",
            "restart_container": "重启容器",
            "remove_container": "删除容器",
            "get_container_logs": "获取容器日志",
            "run_container": "运行新容器",
            "pull_image": "拉取镜像",
            "list_images": "查询镜像列表",
            "remove_image": "删除镜像",
            "list_networks": "查询网络列表",
            "create_network": "创建网络",
            "remove_network": "删除网络",
            "connect_to_network": "连接容器到网络",
            "list_volumes": "查询数据卷",
            "create_volume": "创建数据卷",
            "get_system_info": "获取系统信息",
            "fetch_deployment_info": "获取部署信息",
            "analyze_project_requirements": "分析项目配置需求",
            "deploy_with_compose": "使用 Compose 部署项目",
            "save_memory": "保存记忆",
        }
        return names.get(tool_name, tool_name)

    async def _enrich_with_dependency_hints(
        self,
        db: AsyncSession,
        message: str,
        session_id: str,
    ) -> str:
        """检查用户消息是否包含部署意图，注入联动提示信息。"""
        deploy_keywords = ["部署", "安装", "运行", "启动", "跑"]
        if not any(kw in message for kw in deploy_keywords):
            return message

        # 获取当前运行的容器名称
        try:
            containers = await docker_manager.list_containers(all=False)
            existing_names = [c["name"] for c in containers]
        except Exception:
            return message

        # 尝试从消息中识别应用名
        from app.core.app_dependency import ALIASES
        detected_app = None
        msg_lower = message.lower()
        for alias, canonical in ALIASES.items():
            if alias in msg_lower:
                detected_app = canonical
                break

        if detected_app:
            hint = describe_relations_for_deployment(existing_names, detected_app)
            if hint:
                return f"{message}\n\n[系统提示：{hint}]"

        return message

    async def _maybe_reflect(self, db: AsyncSession, session_id: str) -> None:
        """满足条件时触发 LLM 反思，总结历史操作经验。"""
        if not await memory_manager.should_reflect(db, session_id):
            return
        try:
            history = await memory_manager.get_sessions_for_reflection(db, session_id)
            if not history:
                return
            history_text = "\n".join(
                f"{h['role']}: {h['content'][:200]}" for h in history
            )
            reflection_prompt = (
                f"请对以下 Docker 管理对话进行反思总结，"
                f"提炼出有价值的经验、常见问题和最佳实践（100字以内）：\n{history_text}"
            )
            resp = await llm_client.chat(
                messages=[{"role": "user", "content": reflection_prompt}],
                max_tokens=256,
            )
            summary = resp.get("content", "").strip()
            if summary:
                await memory_manager.save_reflection(db, summary, session_ids=[session_id])
        except Exception:
            pass


agent_engine = AgentEngine()
