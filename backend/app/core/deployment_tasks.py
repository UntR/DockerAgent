from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def deployment_task_to_dict(task: Any) -> Dict[str, Any]:
    return {
        "id": task.id,
        "session_id": task.session_id,
        "source_url": task.source_url or "",
        "app_name": task.app_name,
        "compose_project": task.compose_project,
        "work_dir": task.work_dir,
        "compose_path": task.compose_path,
        "env_path": task.env_path or "",
        "status": task.status,
        "message": task.message or "",
        "compose_output": task.compose_output or "",
        "error_output": task.error_output or "",
        "access_urls": task.access_urls or [],
        "app_id": task.app_id,
        "created_at": task.created_at.isoformat() if task.created_at else "",
        "updated_at": task.updated_at.isoformat() if task.updated_at else "",
    }


async def create_deployment_task(
    db: AsyncSession,
    *,
    session_id: str,
    source_url: str,
    app_name: str,
    compose_project: str,
    work_dir: str,
    compose_path: str,
    env_path: str = "",
    status: str = "running",
    message: str = "",
    access_urls: Optional[List[Dict[str, Any]]] = None,
):
    from app.db.database import DeploymentTask

    task = DeploymentTask(
        session_id=session_id,
        source_url=source_url,
        app_name=app_name,
        compose_project=compose_project,
        work_dir=work_dir,
        compose_path=compose_path,
        env_path=env_path,
        status=status,
        message=message,
        access_urls=access_urls or [],
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def update_deployment_task(
    db: AsyncSession,
    task: Any,
    *,
    status: str,
    message: str,
    compose_output: str = "",
    error_output: str = "",
    access_urls: Optional[List[Dict[str, Any]]] = None,
    app_id: Optional[int] = None,
):
    task.status = status
    task.message = message
    task.compose_output = compose_output
    task.error_output = error_output
    if access_urls is not None:
        task.access_urls = access_urls
    if app_id is not None:
        task.app_id = app_id
    await db.commit()
    await db.refresh(task)
    return task


async def list_deployment_tasks(db: AsyncSession) -> List[Dict[str, Any]]:
    from app.db.database import DeploymentTask

    result = await db.execute(
        select(DeploymentTask).order_by(DeploymentTask.updated_at.desc(), DeploymentTask.id.desc())
    )
    return [deployment_task_to_dict(task) for task in result.scalars().all()]


async def get_deployment_task(db: AsyncSession, task_id: int) -> Optional[Dict[str, Any]]:
    from app.db.database import DeploymentTask

    result = await db.execute(select(DeploymentTask).where(DeploymentTask.id == task_id))
    task = result.scalar_one_or_none()
    return deployment_task_to_dict(task) if task else None
