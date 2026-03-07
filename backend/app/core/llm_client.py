import os
from typing import Any, AsyncIterator, Dict, List, Optional
import anthropic
import openai


class LLMClient:
    def __init__(self):
        # 初始值从环境变量读取，之后可通过 reload() 动态切换
        self.provider: str = os.environ.get("LLM_PROVIDER", "anthropic")
        self.model: str = ""
        self._anthropic: Optional[anthropic.AsyncAnthropic] = None
        self._openai: Optional[openai.AsyncOpenAI] = None
        self._init_from_env()

    def _init_from_env(self):
        if self.provider == "anthropic":
            self.model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
            self._anthropic = anthropic.AsyncAnthropic(
                api_key=os.environ.get("ANTHROPIC_API_KEY", "")
            )
        else:
            self.model = os.environ.get("OPENAI_MODEL", "gpt-4o")
            self._openai = openai.AsyncOpenAI(
                api_key=os.environ.get("OPENAI_API_KEY", ""),
                base_url=os.environ.get("OPENAI_BASE_URL") or None,
            )

    def reload(
        self,
        provider_type: str,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
    ) -> None:
        """热重载配置，切换激活提供商后调用。"""
        self.provider = provider_type
        self.model = model

        if provider_type == "anthropic":
            builtin = "https://api.anthropic.com"
            self._anthropic = anthropic.AsyncAnthropic(
                api_key=api_key,
                base_url=base_url if base_url and base_url != builtin else None,
            )
        else:
            # openai / custom 都走 openai SDK
            self._openai = openai.AsyncOpenAI(
                api_key=api_key,
                base_url=base_url or "https://api.openai.com/v1",
            )

    # ── 公共接口 ──────────────────────────────────────────────

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        system: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        """非流式对话，返回完整响应。"""
        if self.provider == "anthropic":
            return await self._anthropic_chat(messages, tools, system, max_tokens)
        return await self._openai_chat(messages, tools, system, max_tokens)

    async def chat_stream(
        self,
        messages: List[Dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        """流式对话，yield 原始文本片段。"""
        if self.provider == "anthropic":
            async for chunk in self._anthropic_stream(messages, system, max_tokens):
                yield chunk
        else:
            async for chunk in self._openai_stream(messages, system, max_tokens):
                yield chunk

    async def chat_stream_events(
        self,
        messages: List[Dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: int = 2048,
    ) -> AsyncIterator[Dict[str, Any]]:
        """流式对话，yield 结构化事件 dict。
        支持解析 <think>...</think> 块，分离 thinking 和正文内容。
        事件类型：{"type": "think"/"chunk", "content": "..."}
        """
        TAG_OPEN = "<think>"
        TAG_CLOSE = "</think>"
        buffer = ""
        in_think = False

        async for text in self.chat_stream(messages, system, max_tokens):
            buffer += text
            while True:
                if in_think:
                    idx = buffer.find(TAG_CLOSE)
                    if idx >= 0:
                        if idx > 0:
                            yield {"type": "think", "content": buffer[:idx]}
                        buffer = buffer[idx + len(TAG_CLOSE):]
                        in_think = False
                    else:
                        safe_len = max(0, len(buffer) - len(TAG_CLOSE) + 1)
                        if safe_len > 0:
                            yield {"type": "think", "content": buffer[:safe_len]}
                            buffer = buffer[safe_len:]
                        break
                else:
                    idx = buffer.find(TAG_OPEN)
                    if idx >= 0:
                        if idx > 0:
                            yield {"type": "chunk", "content": buffer[:idx]}
                        buffer = buffer[idx + len(TAG_OPEN):]
                        in_think = True
                    else:
                        safe_len = max(0, len(buffer) - len(TAG_OPEN) + 1)
                        if safe_len > 0:
                            yield {"type": "chunk", "content": buffer[:safe_len]}
                            buffer = buffer[safe_len:]
                        break

        if buffer:
            yield {"type": "think" if in_think else "chunk", "content": buffer}

    # ── Anthropic ──────────────────────────────────────────────

    async def _anthropic_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]],
        system: Optional[str],
        max_tokens: int,
    ) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        resp = await self._anthropic.messages.create(**kwargs)
        result: Dict[str, Any] = {"role": "assistant", "content": "", "tool_calls": []}

        for block in resp.content:
            if block.type == "text":
                result["content"] += block.text
            elif block.type == "tool_use":
                result["tool_calls"].append({
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

        result["stop_reason"] = resp.stop_reason
        return result

    async def _anthropic_stream(
        self,
        messages: List[Dict[str, Any]],
        system: Optional[str],
        max_tokens: int,
    ) -> AsyncIterator[str]:
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        async with self._anthropic.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    # ── OpenAI / Custom ──────────────────────────────────────────────

    def _to_openai_tools(self, tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """将 Anthropic 格式的 tools 转换为 OpenAI 格式。"""
        result = []
        for t in tools:
            result.append({
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {}),
                }
            })
        return result

    async def _openai_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]],
        system: Optional[str],
        max_tokens: int,
    ) -> Dict[str, Any]:
        oai_messages = []
        if system:
            oai_messages.append({"role": "system", "content": system})
        oai_messages.extend(messages)

        kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": oai_messages,
        }
        if tools:
            kwargs["tools"] = self._to_openai_tools(tools)
            kwargs["tool_choice"] = "auto"

        resp = await self._openai.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        result: Dict[str, Any] = {
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [],
        }
        if msg.tool_calls:
            import json
            for tc in msg.tool_calls:
                try:
                    input_data = json.loads(tc.function.arguments or "{}")
                except (json.JSONDecodeError, TypeError):
                    input_data = {}
                result["tool_calls"].append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": input_data,
                })
        result["stop_reason"] = resp.choices[0].finish_reason
        return result

    async def _openai_stream(
        self,
        messages: List[Dict[str, Any]],
        system: Optional[str],
        max_tokens: int,
    ) -> AsyncIterator[str]:
        oai_messages = []
        if system:
            oai_messages.append({"role": "system", "content": system})
        oai_messages.extend(messages)

        stream = await self._openai.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=oai_messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


llm_client = LLMClient()
