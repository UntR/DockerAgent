from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def build_app_record(
    name: str,
    compose_project: str,
    work_dir: str,
    compose_path: str,
    env_path: Optional[str] = None,
    source_url: Optional[str] = None,
    access_urls: Optional[List[Dict[str, Any]]] = None,
    status: str = "running",
) -> Dict[str, Any]:
    return {
        "name": name,
        "compose_project": compose_project,
        "work_dir": work_dir,
        "compose_path": compose_path,
        "env_path": env_path or "",
        "source_url": source_url or "",
        "access_urls": access_urls or [],
        "status": status,
    }


async def upsert_managed_app(
    db: AsyncSession,
    record: Dict[str, Any],
):
    from app.db.database import ManagedApp

    result = await db.execute(
        select(ManagedApp).where(ManagedApp.compose_project == record["compose_project"])
    )
    app = result.scalar_one_or_none()
    if not app:
        app = ManagedApp(compose_project=record["compose_project"])
        db.add(app)

    app.name = record["name"]
    app.work_dir = record["work_dir"]
    app.compose_path = record["compose_path"]
    app.env_path = record["env_path"]
    app.source_url = record["source_url"]
    app.access_urls = record["access_urls"]
    app.status = record["status"]

    await db.commit()
    await db.refresh(app)
    return app


def managed_app_to_dict(app: Any) -> Dict[str, Any]:
    return {
        "id": app.id,
        "name": app.name,
        "compose_project": app.compose_project,
        "work_dir": app.work_dir,
        "compose_path": app.compose_path,
        "env_path": app.env_path,
        "source_url": app.source_url,
        "access_urls": app.access_urls or [],
        "status": app.status,
        "created_at": app.created_at.isoformat() if app.created_at else "",
        "updated_at": app.updated_at.isoformat() if app.updated_at else "",
    }
