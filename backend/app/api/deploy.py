import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.webfetch import web_fetcher
from app.core.compose_preflight import analyze_compose
from app.core.rollback_manager import rollback_manager
from app.core.deploy_plan import build_deployment_plan
from app.core.deployment_tasks import get_deployment_task, list_deployment_tasks
from app.core.docker_manager import docker_manager
from app.models.schemas import DeployRequest, DeployResult

router = APIRouter(prefix="/deploy", tags=["deploy"])


@router.get("/tasks")
async def list_tasks(db: AsyncSession = Depends(get_db)):
    return await list_deployment_tasks(db)


@router.get("/tasks/{task_id}")
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await get_deployment_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="部署任务不存在")
    return task


@router.post("/analyze")
async def analyze_source(req: DeployRequest, db: AsyncSession = Depends(get_db)):
    """
    分析部署来源（URL、GitHub 仓库、镜像名称），返回解析结果。
    不实际执行部署。
    """
    try:
        result = await web_fetcher.resolve_source(req.source)
        occupied_ports = await _get_occupied_host_ports()
        compose_content = result.get("compose_content")
        if isinstance(compose_content, str) and compose_content.strip():
            result["preflight"] = analyze_compose(
                compose_content,
                env_vars=req.env_vars or {},
                occupied_ports=occupied_ports,
            )
        page_info = result.get("page_info")
        if isinstance(page_info, dict) and page_info.get("compose_blocks"):
            blocks = page_info.get("compose_blocks")
            if isinstance(blocks, list) and blocks:
                result["preflight"] = analyze_compose(
                    str(blocks[0]),
                    env_vars=req.env_vars or {},
                    occupied_ports=occupied_ports,
                )
        result["deployment_plan"] = build_deployment_plan(
            source=req.source,
            description=req.description,
            analysis=result,
            env_vars=req.env_vars or {},
            occupied_ports=occupied_ports,
        )
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
    if req.env_vars:
        message += (
            "\n\n用户已经在部署页填写了这些环境变量，请在部署时使用：\n"
            f"{json.dumps(req.env_vars, ensure_ascii=False, indent=2)}"
        )

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


async def _get_occupied_host_ports() -> set[int]:
    ports: set[int] = set()
    try:
        containers = await docker_manager.list_containers(all=True)
    except Exception:
        return ports

    for container in containers:
        bindings = container.get("ports") or {}
        if not isinstance(bindings, dict):
            continue
        for value in bindings.values():
            if not isinstance(value, list):
                continue
            for item in value:
                if not isinstance(item, dict):
                    continue
                host_port = item.get("HostPort")
                try:
                    if host_port:
                        ports.add(int(host_port))
                except ValueError:
                    continue
    return ports
