"""
回滚管理器：在每次部署操作前自动快照当前 Docker 状态，支持一键回滚。
"""
import asyncio
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import Snapshot
from app.core.docker_manager import docker_manager


class RollbackManager:

    async def take_snapshot(
        self,
        db: AsyncSession,
        name: str,
        description: Optional[str] = None,
        is_auto: bool = True,
    ) -> Snapshot:
        """快照当前所有容器、网络、卷的配置。"""
        containers = await docker_manager.list_containers(all=True)
        networks = await docker_manager.list_networks()
        volumes = await docker_manager.list_volumes()

        # 保存容器完整配置（含 HostConfig 等）用于恢复
        detailed_containers = []
        for c in containers:
            try:
                detail = await docker_manager.get_container(c["full_id"])
                detailed_containers.append(detail)
            except Exception:
                detailed_containers.append(c)

        snapshot = Snapshot(
            name=name,
            description=description,
            containers=detailed_containers,
            networks=networks,
            volumes=volumes,
            is_auto=is_auto,
        )
        db.add(snapshot)
        await db.commit()
        await db.refresh(snapshot)
        return snapshot

    async def list_snapshots(self, db: AsyncSession) -> List[Dict[str, Any]]:
        result = await db.execute(
            select(Snapshot).order_by(Snapshot.created_at.desc())
        )
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "is_auto": r.is_auto,
                "container_count": len(r.containers) if r.containers else 0,
            }
            for r in rows
        ]

    async def get_snapshot(self, db: AsyncSession, snapshot_id: int) -> Optional[Snapshot]:
        result = await db.execute(select(Snapshot).where(Snapshot.id == snapshot_id))
        return result.scalar_one_or_none()

    async def delete_snapshot(self, db: AsyncSession, snapshot_id: int) -> bool:
        snap = await self.get_snapshot(db, snapshot_id)
        if not snap:
            return False
        await db.delete(snap)
        await db.commit()
        return True

    async def rollback_to(
        self,
        db: AsyncSession,
        snapshot_id: int,
        keep_volumes: bool = True,
    ) -> Dict[str, Any]:
        """
        回滚到指定快照状态。
        keep_volumes=True：保留所有数据卷（推荐，避免数据丢失）
        keep_volumes=False：删除新增的数据卷（完全回滚）
        """
        snap = await self.get_snapshot(db, snapshot_id)
        if not snap:
            return {"success": False, "message": f"快照 {snapshot_id} 不存在"}

        report: Dict[str, Any] = {
            "success": True,
            "stopped": [],
            "removed": [],
            "restored": [],
            "errors": [],
        }

        # 1. 获取快照时的容器 ID 集合
        snapped_ids = {c.get("full_id") or c.get("id") for c in snap.containers}
        snapped_names = {c.get("name") for c in snap.containers}

        # 2. 获取当前所有容器
        current_containers = await docker_manager.list_containers(all=True)

        # 3. 停止并删除快照中没有的容器（新增的容器）
        for cc in current_containers:
            cid = cc.get("full_id") or cc.get("id")
            cname = cc.get("name")
            if cid not in snapped_ids and cname not in snapped_names:
                try:
                    await docker_manager.stop_container(cid)
                    await docker_manager.remove_container(cid, force=True)
                    report["removed"].append(cname)
                except Exception as e:
                    report["errors"].append(f"删除容器 {cname} 失败: {str(e)}")

        # 4. 恢复快照中存在、但当前已停止或不存在的容器
        current_after = await docker_manager.list_containers(all=True)
        current_names = {c["name"]: c for c in current_after}

        for sc in snap.containers:
            name = sc.get("name", "")
            status_was = sc.get("status", "")
            if name in current_names:
                current_status = current_names[name].get("status", "")
                # 如果之前是 running 但现在不是，则重新启动
                if status_was == "running" and current_status != "running":
                    try:
                        await docker_manager.start_container(current_names[name].get("full_id"))
                        report["restored"].append(name)
                    except Exception as e:
                        report["errors"].append(f"启动容器 {name} 失败: {str(e)}")

        # 5. 如果不保留卷，删除快照后新增的卷
        if not keep_volumes:
            snapped_vol_names = {v["name"] for v in snap.volumes}
            current_volumes = await docker_manager.list_volumes()
            for v in current_volumes:
                if v["name"] not in snapped_vol_names:
                    try:
                        await docker_manager.remove_volume(v["name"])
                    except Exception as e:
                        report["errors"].append(f"删除卷 {v['name']} 失败: {str(e)}")

        report["message"] = (
            f"回滚完成。删除了 {len(report['removed'])} 个新增容器，"
            f"恢复了 {len(report['restored'])} 个容器，"
            f"{'保留了所有数据卷' if keep_volumes else '清除了新增数据卷'}。"
        )
        if report["errors"]:
            report["message"] += f" 有 {len(report['errors'])} 个错误。"

        return report


rollback_manager = RollbackManager()
