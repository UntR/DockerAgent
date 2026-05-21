"""
回滚管理器：在每次部署操作前自动快照当前 Docker 状态，支持一键回滚。
"""
import asyncio
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import Snapshot
from app.core.docker_manager import docker_manager
from app.core.snapshot_utils import snapshot_to_dict


class RollbackManager:

    async def take_snapshot(
        self,
        db: AsyncSession,
        name: str,
        description: Optional[str] = None,
        is_auto: bool = True,
        compose_project: Optional[str] = None,
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
                if c.get("labels") and not detail.get("labels"):
                    detail["labels"] = c["labels"]
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
            compose_project=compose_project,
        )
        db.add(snapshot)
        await db.commit()
        await db.refresh(snapshot)
        return snapshot

    async def list_snapshots(
        self,
        db: AsyncSession,
        compose_project: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = select(Snapshot)
        if compose_project:
            query = query.where(Snapshot.compose_project == compose_project)
        result = await db.execute(query.order_by(Snapshot.created_at.desc()))
        rows = result.scalars().all()
        return [snapshot_to_dict(r) for r in rows]

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

        compose_project = snap.compose_project or ""
        snapped_containers = self._filter_containers_by_compose_project(
            snap.containers or [],
            compose_project,
            keep_unlabeled=True,
        )

        # 1. 获取快照时的容器 ID 集合
        snapped_ids = {c.get("full_id") or c.get("id") for c in snapped_containers}
        snapped_names = {c.get("name") for c in snapped_containers}

        # 2. 获取当前所有容器
        current_containers = await docker_manager.list_containers(all=True)
        current_containers = self._filter_containers_by_compose_project(
            current_containers,
            compose_project,
            keep_unlabeled=False,
        )

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
        current_after = self._filter_containers_by_compose_project(
            current_after,
            compose_project,
            keep_unlabeled=False,
        )
        current_names = {c["name"]: c for c in current_after}

        for sc in snapped_containers:
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
            snapped_volumes = self._filter_volumes_by_compose_project(
                snap.volumes or [],
                compose_project,
                keep_unlabeled=True,
            )
            snapped_vol_names = {v["name"] for v in snapped_volumes}
            current_volumes = await docker_manager.list_volumes()
            current_volumes = self._filter_volumes_by_compose_project(
                current_volumes,
                compose_project,
                keep_unlabeled=False,
            )
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

    def _filter_containers_by_compose_project(
        self,
        containers: List[Dict[str, Any]],
        compose_project: str,
        keep_unlabeled: bool,
    ) -> List[Dict[str, Any]]:
        if not compose_project:
            return containers
        return [
            c for c in containers
            if self._matches_compose_project(c, compose_project, keep_unlabeled)
        ]

    def _filter_volumes_by_compose_project(
        self,
        volumes: List[Dict[str, Any]],
        compose_project: str,
        keep_unlabeled: bool,
    ) -> List[Dict[str, Any]]:
        if not compose_project:
            return volumes
        return [
            v for v in volumes
            if self._matches_compose_project(v, compose_project, keep_unlabeled)
        ]

    def _matches_compose_project(
        self,
        item: Dict[str, Any],
        compose_project: str,
        keep_unlabeled: bool,
    ) -> bool:
        labels = item.get("labels")
        if labels is None:
            labels = (item.get("config") or {}).get("Labels")
        labels = labels or {}
        item_project = labels.get("com.docker.compose.project")
        if item_project:
            return item_project == compose_project
        return keep_unlabeled


rollback_manager = RollbackManager()
