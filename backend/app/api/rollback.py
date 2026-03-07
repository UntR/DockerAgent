from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db.database import get_db
from app.core.rollback_manager import rollback_manager
from app.models.schemas import SnapshotCreate, RollbackRequest

router = APIRouter(prefix="/rollback", tags=["rollback"])


@router.get("/snapshots")
async def list_snapshots(db: AsyncSession = Depends(get_db)):
    """列出所有快照。"""
    try:
        return await rollback_manager.list_snapshots(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/snapshots")
async def create_snapshot(req: SnapshotCreate, db: AsyncSession = Depends(get_db)):
    """手动创建快照。"""
    try:
        snap = await rollback_manager.take_snapshot(
            db,
            name=req.name,
            description=req.description,
            is_auto=False,
        )
        return {
            "id": snap.id,
            "name": snap.name,
            "description": snap.description,
            "created_at": snap.created_at.isoformat() if snap.created_at else "",
            "container_count": len(snap.containers) if snap.containers else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: int, db: AsyncSession = Depends(get_db)):
    """删除快照。"""
    try:
        success = await rollback_manager.delete_snapshot(db, snapshot_id)
        if not success:
            raise HTTPException(status_code=404, detail="快照不存在")
        return {"success": True, "message": f"快照 {snapshot_id} 已删除"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_rollback(req: RollbackRequest, db: AsyncSession = Depends(get_db)):
    """执行回滚。"""
    try:
        result = await rollback_manager.rollback_to(
            db,
            snapshot_id=req.snapshot_id,
            keep_volumes=req.keep_volumes,
        )
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("message", "回滚失败"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
