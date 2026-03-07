# DockerAgent — AI 驱动的 Docker 管理平台

> 用自然语言管理你的 Docker，告别命令行恐惧。

一个将可视化 Docker 管理面板与 AI Agent 深度整合的开源项目。支持 Claude、DeepSeek、MiniMax、Kimi 等主流 LLM，通过对话完成容器管理、应用部署、日志排查等一切操作。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🖥️ **可视化仪表盘** | 容器/镜像/网络/数据卷管理，实时 CPU/内存/磁盘监控，Compose 项目分组展示 |
| 🤖 **AI 自然语言助手** | 用中文对话管理 Docker，支持 think 过程展示、工具调用可视化、Markdown 渲染 |
| 📦 **智能部署向导** | 输入 GitHub URL，AI 自动分析项目配置需求，引导填写必填项后一键部署 |
| 🔗 **应用依赖感知** | 自动识别 Ollama+Open WebUI 等应用间的网络依赖，部署时智能联通 |
| ↩️ **一键回滚** | 每次部署前自动快照，支持保留/清除数据卷的安全回滚 |
| 🧠 **记忆与反思** | 记住用户偏好，定期总结操作经验，多会话历史持久化 |
| ⚙️ **可视化 LLM 配置** | 在设置页面管理 API Key，支持自定义 Provider，一键测试连通性 |

## 🚀 快速开始

### 方式一：Docker Compose（推荐，单容器）

```bash
# 1. 下载配置文件
curl -O https://raw.githubusercontent.com/你的用户名/docker-agent/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/你的用户名/docker-agent/main/.env.example

# 2. 配置环境变量（至少填入一个 LLM API Key）
cp .env.example .env

# 3. 启动（自动拉取镜像）
docker compose up -d

# 访问 http://localhost:3000
```

或者直接一行命令体验（临时运行）：

```bash
docker run -d \
  -p 3000:8088 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v docker-agent-data:/data \
  -e ANTHROPIC_API_KEY=你的key \
  --name docker-agent \
  你的用户名/docker-agent:latest
```

### 方式二：本地开发

```bash
# 确保已安装：Python 3.10+、Node.js 18+、Docker

cp .env.example .env
# 编辑 .env 填入 API Key

bash dev.sh
# 自动安装依赖并启动前后端，访问 http://localhost:3000
```

## ⚙️ 环境变量说明

复制 `.env.example` 为 `.env`，按需填写：

| 变量 | 说明 | 是否必填 |
|------|------|----------|
| `LLM_PROVIDER` | 默认提供商：`anthropic` / `openai` / `custom` | 否（默认 anthropic）|
| `ANTHROPIC_API_KEY` | Claude API Key | 二选一 |
| `OPENAI_API_KEY` | OpenAI / 兼容接口 Key（DeepSeek、MiniMax 等）| 二选一 |
| `OPENAI_BASE_URL` | 自定义 API 地址，如 `https://api.deepseek.com/v1` | 否 |
| `GITHUB_TOKEN` | GitHub Token，提高抓取 compose/env 文件的速率限制 | 否 |
| `BACKEND_PORT` | 后端端口（本地开发用）| 否（默认 8088）|

> 💡 也可以在启动后通过 **设置页面** 可视化管理 LLM 配置，支持热切换无需重启。

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + Vite + TailwindCSS + Framer Motion + Recharts |
| 后端 | Python + FastAPI + WebSocket + SQLAlchemy + SQLite |
| AI | Anthropic Claude / OpenAI 兼容接口（可配置多 Provider）|
| Docker | Python docker SDK（挂载 `/var/run/docker.sock`）|
| 部署 | Docker Compose + GitHub Actions 自动构建 |

## 📁 项目结构

```
docker-agent/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── api/          # REST API 路由（docker, agent, settings...）
│   │   ├── core/         # 核心逻辑（agent_engine, llm_client, webfetch...）
│   │   ├── db/           # 数据库模型
│   │   └── mcp/          # 工具定义（Docker MCP Tools）
│   └── main.py
├── frontend/             # React 前端
│   └── src/
│       ├── pages/        # 页面（Dashboard, Chat, Settings...）
│       ├── hooks/        # useAgent（WebSocket 通信）
│       └── lib/          # store, api, utils
├── .env.example          # 环境变量模板
├── docker-compose.yml    # 一键部署
└── dev.sh                # 本地开发启动脚本
```

## 🔌 API 文档

启动后访问 `http://localhost:8088/docs` 查看完整的交互式 API 文档。

## 🤝 贡献

欢迎 PR 和 Issue！

## 📄 License

MIT
