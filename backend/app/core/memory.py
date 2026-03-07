"""
记忆系统：对话历史持久化、语义记忆条目、LLM 定期反思总结。
"""
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import Conversation, Memory, Reflection


class MemoryManager:

    # ── 对话历史 ──────────────────────────────────────────────

    async def save_message(
        self,
        db: AsyncSession,
        session_id: str,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict]] = None,
        tool_call_id: Optional[str] = None,
    ) -> Conversation:
        msg = Conversation(
            session_id=session_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg

    async def get_session_history(
        self,
        db: AsyncSession,
        session_id: str,
        limit: int = 40,
    ) -> List[Dict[str, Any]]:
        result = await db.execute(
            select(Conversation)
            .where(Conversation.session_id == session_id)
            .order_by(Conversation.created_at.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        rows = list(reversed(rows))

        messages = []
        for r in rows:
            if r.role == "tool":
                messages.append({
                    "role": "tool",
                    "tool_call_id": r.tool_call_id,
                    "content": r.content,
                })
            elif r.tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": r.content,
                    "tool_calls": r.tool_calls,
                })
            else:
                messages.append({"role": r.role, "content": r.content})
        return messages

    async def clear_session(self, db: AsyncSession, session_id: str) -> None:
        await db.execute(
            delete(Conversation).where(Conversation.session_id == session_id)
        )
        await db.commit()

    # ── 记忆条目 ──────────────────────────────────────────────

    async def set_memory(
        self,
        db: AsyncSession,
        key: str,
        value: str,
        category: str = "general",
        importance: float = 1.0,
    ) -> Memory:
        result = await db.execute(select(Memory).where(Memory.key == key))
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
            existing.category = category
            existing.importance = importance
            existing.updated_at = datetime.now(timezone.utc)
            await db.commit()
            return existing
        mem = Memory(key=key, value=value, category=category, importance=importance)
        db.add(mem)
        await db.commit()
        await db.refresh(mem)
        return mem

    async def get_memory(self, db: AsyncSession, key: str) -> Optional[str]:
        result = await db.execute(select(Memory).where(Memory.key == key))
        mem = result.scalar_one_or_none()
        return mem.value if mem else None

    async def list_memories(
        self,
        db: AsyncSession,
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        q = select(Memory).order_by(Memory.importance.desc()).limit(limit)
        if category:
            q = q.where(Memory.category == category)
        result = await db.execute(q)
        rows = result.scalars().all()
        return [
            {
                "key": r.key,
                "value": r.value,
                "category": r.category,
                "importance": r.importance,
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            }
            for r in rows
        ]

    async def build_memory_context(self, db: AsyncSession) -> str:
        """将高重要性记忆拼成系统 prompt 上下文片段。"""
        memories = await self.list_memories(db, limit=15)
        if not memories:
            return ""
        lines = ["【用户偏好与背景记忆】"]
        for m in memories:
            lines.append(f"- {m['key']}: {m['value']}")
        return "\n".join(lines)

    # ── 反思 ──────────────────────────────────────────────

    async def save_reflection(
        self,
        db: AsyncSession,
        summary: str,
        session_ids: Optional[List[str]] = None,
    ) -> Reflection:
        ref = Reflection(summary=summary, session_ids=session_ids or [])
        db.add(ref)
        await db.commit()
        await db.refresh(ref)
        return ref

    async def get_latest_reflections(
        self,
        db: AsyncSession,
        limit: int = 3,
    ) -> List[str]:
        result = await db.execute(
            select(Reflection).order_by(Reflection.created_at.desc()).limit(limit)
        )
        rows = result.scalars().all()
        return [r.summary for r in rows]

    async def should_reflect(self, db: AsyncSession, session_id: str) -> bool:
        """对话满 20 条时触发一次反思。"""
        result = await db.execute(
            select(Conversation)
            .where(Conversation.session_id == session_id)
        )
        count = len(result.scalars().all())
        return count > 0 and count % 20 == 0

    async def get_sessions_for_reflection(
        self,
        db: AsyncSession,
        session_id: str,
    ) -> List[Dict[str, Any]]:
        """获取当前 session 最近的对话用于生成反思。"""
        return await self.get_session_history(db, session_id, limit=20)


memory_manager = MemoryManager()
