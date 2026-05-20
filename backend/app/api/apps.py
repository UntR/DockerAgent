from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_files import read_app_file
from app.core.app_registry import managed_app_to_dict
from app.core.docker_manager import docker_manager
from app.core.snapshot_utils import snapshot_to_dict
from app.db.database import ManagedApp, get_db
from app.db.database import Snapshot

router = APIRouter(prefix="/apps", tags=["apps"])


async def _compose_project_containers(compose_project: str) -> List[Dict[str, Any]]:
    try:
        containers = await docker_manager.list_containers(all=True)
    except Exception:
        return []

    result: List[Dict[str, Any]] = []
    for container in containers:
        labels = container.get("labels") or {}
        if labels.get("com.docker.compose.project") != compose_project:
            continue
        result.append({
            "id": container.get("id", ""),
            "full_id": container.get("full_id", ""),
            "name": container.get("name", ""),
            "service": labels.get("com.docker.compose.service") or container.get("name", ""),
            "image": container.get("image", ""),
            "status": container.get("status", ""),
            "ports": container.get("ports") or {},
        })
    return result


@router.get("")
async def list_apps(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ManagedApp).order_by(ManagedApp.updated_at.desc(), ManagedApp.id.desc())
    )
    return [managed_app_to_dict(app) for app in result.scalars().all()]


@router.get("/{app_id}")
async def get_app(app_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ManagedApp).where(ManagedApp.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="应用不存在")
    data = managed_app_to_dict(app)
    data["containers"] = await _compose_project_containers(app.compose_project)
    snapshots = await db.execute(
        select(Snapshot)
        .where(Snapshot.compose_project == app.compose_project)
        .order_by(Snapshot.created_at.desc(), Snapshot.id.desc())
    )
    data["snapshots"] = [snapshot_to_dict(s) for s in snapshots.scalars().all()]
    return data


@router.get("/{app_id}/files/{file_kind}")
async def get_app_file(app_id: int, file_kind: str, db: AsyncSession = Depends(get_db)):
    if file_kind not in {"compose", "env"}:
        raise HTTPException(status_code=404, detail="文件类型不存在")

    result = await db.execute(select(ManagedApp).where(ManagedApp.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="应用不存在")

    path = app.compose_path if file_kind == "compose" else app.env_path
    if not path:
        raise HTTPException(status_code=404, detail="文件不存在")

    try:
        return read_app_file(path, file_kind, work_dir=app.work_dir)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在")
    except ValueError:
        raise HTTPException(status_code=403, detail="文件路径不在应用工作目录内")
