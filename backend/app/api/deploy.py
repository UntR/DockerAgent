import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.webfetch import web_fetcher
from app.core.agent_engine import agent_engine
from app.core.rollback_manager import rollback_manager
from app.models.schemas import DeployRequest, DeployResult

router = APIRouter(prefix="/deploy", tags=["deploy"])


@router.post("/analyze")
async def analyze_source(req: DeployRequest, db: AsyncSession = Depends(get_db)):
    """
    分析部署来源（URL、GitHub 仓库、镜像名称），返回解析结果。
    不实际执行部署。
    """
    try:
        result = await web_fetcher.resolve_source(req.source)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败：{str(e)}")


@router.post("/smart")
async def smart_deploy(req: DeployRequest, db: AsyncSession = Depends(get_db)):
    """
    智能部署：将用户输入交给 Agent 处理，Agent 会：
    1. 分析来源
    2. 生成部署配置
    3. 自动快照
    4. 执行部署
    返回流式 session_id，前端通过 WebSocket 跟踪进度。
    """
    session_id = str(uuid.uuid4())
    source_desc = req.description or req.source
    message = f"请帮我部署：{source_desc}（来源：{req.source}）"

    try:
        # 部署前快照
        await rollback_manager.take_snapshot(
            db,
            name=f"pre_deploy_{req.source[:30]}",
            description=f"部署 {req.source} 前的自动快照",
        )
    except Exception:
        pass

    # 返回 session_id，客户端通过 WS 跟踪
    return {
        "session_id": session_id,
        "message": f"部署任务已创建，请通过 WebSocket 连接 /agent/chat/ws/{session_id} 跟踪进度",
        "ws_url": f"/agent/chat/ws/{session_id}",
        "init_message": message,
    }
