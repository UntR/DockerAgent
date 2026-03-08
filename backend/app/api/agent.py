import json
import uuid
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.agent_engine import agent_engine
from app.core.memory import memory_manager
from app.models.schemas import AgentChatRequest

router = APIRouter(prefix="/agent", tags=["agent"])


@router.websocket("/chat/ws/{session_id}")
async def chat_websocket(websocket: WebSocket, session_id: str):
    """WebSocket 流式对话接口。
    
    鉴权由 main.py 中间件统一处理（从 ?token= 查询参数校验 ACCESS_TOKEN）。
    """
    await websocket.accept()
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            while True:
                data = await websocket.receive_text()
                payload = json.loads(data)
                user_message = payload.get("message", "")

                if not user_message.strip():
                    continue

                # agent_engine.chat() 现在直接 yield 结构化事件 dict，透传给前端
                async for event in agent_engine.chat(db, session_id, user_message):
                    await websocket.send_text(json.dumps(event, ensure_ascii=False, default=str))

                await websocket.send_text(json.dumps({"type": "done"}))

        except WebSocketDisconnect:
            pass
        except Exception as e:
            try:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "content": f"发生错误：{str(e)}",
                }))
            except Exception:
                pass


@router.post("/chat")
async def chat_http(req: AgentChatRequest, db: AsyncSession = Depends(get_db)):
    """HTTP 非流式对话接口（用于测试）。"""
    try:
        full_reply = ""
        async for chunk in agent_engine.chat(db, req.session_id, req.message):
            full_reply += chunk
        return {
            "session_id": req.session_id,
            "reply": full_reply,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/history")
async def get_history(session_id: str, db: AsyncSession = Depends(get_db)):
    """获取会话历史。"""
    try:
        history = await memory_manager.get_session_history(db, session_id, limit=50)
        return {"session_id": session_id, "messages": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
async def clear_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """清除会话历史。"""
    try:
        await memory_manager.clear_session(db, session_id)
        return {"success": True, "message": f"会话 {session_id} 已清除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memories")
async def list_memories(category: str = None, db: AsyncSession = Depends(get_db)):
    """查看 Agent 记忆库。"""
    try:
        return await memory_manager.list_memories(db, category=category)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reflections")
async def list_reflections(db: AsyncSession = Depends(get_db)):
    """查看 Agent 反思记录。"""
    try:
        reflections = await memory_manager.get_latest_reflections(db, limit=10)
        return {"reflections": reflections}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/new")
async def new_session():
    """创建新会话 ID。"""
    return {"session_id": str(uuid.uuid4())}
