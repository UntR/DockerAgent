from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List

from app.db.database import get_db
from app.core.docker_manager import docker_manager
from app.models.schemas import (
    ContainerAction,
    RunContainerRequest,
    PullImageRequest,
    CreateNetworkRequest,
    CreateVolumeRequest,
)

router = APIRouter(prefix="/docker", tags=["docker"])


# ── 系统信息 ──────────────────────────────────────────────

@router.get("/info")
async def get_docker_info():
    try:
        return await docker_manager.get_system_info()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/host-stats")
async def get_host_stats(show_all_disks: bool = False):
    """获取主机 CPU / 内存 / 磁盘实时状态（使用 psutil）。
    show_all_disks=false 时过滤掉 snap/tmpfs/loop 等虚拟设备。
    """
    try:
        import psutil, asyncio
        loop = asyncio.get_event_loop()

        # 需要过滤的文件系统类型和设备前缀
        SKIP_FSTYPES = {"squashfs", "tmpfs", "devtmpfs", "sysfs", "proc",
                        "cgroup", "cgroup2", "overlay", "nsfs", "hugetlbfs",
                        "mqueue", "debugfs", "tracefs", "pstore", "bpf",
                        "configfs", "securityfs", "fusectl", "efivarfs"}

        def _collect():
            cpu_pct = psutil.cpu_percent(interval=0.3)
            mem = psutil.virtual_memory()
            all_disks = []
            seen_device = set()
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                except (PermissionError, OSError):
                    continue

                # 过滤虚拟/只读文件系统
                if not show_all_disks:
                    if part.fstype in SKIP_FSTYPES:
                        continue
                    # loop 设备（snap 挂载用 /dev/loop*）
                    if part.device.startswith("/dev/loop"):
                        continue
                    # 容量为 0 或极小的虚拟盘
                    if usage.total < 10 * 1024 * 1024:  # < 10 MB
                        continue

                # 去重（同一物理设备可能多个挂载点，这里只保留第一个）
                if part.device in seen_device:
                    continue
                seen_device.add(part.device)

                all_disks.append({
                    "mountpoint": part.mountpoint,
                    "device": part.device,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                })

            return {
                "cpu_percent": cpu_pct,
                "cpu_count": psutil.cpu_count(logical=True),
                "memory_total": mem.total,
                "memory_used": mem.used,
                "memory_available": mem.available,
                "memory_percent": mem.percent,
                "disks": all_disks,
            }

        stats = await loop.run_in_executor(None, _collect)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 容器 ──────────────────────────────────────────────

@router.get("/containers")
async def list_containers(all: bool = True):
    try:
        return await docker_manager.list_containers(all=all)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}")
async def get_container(container_id: str):
    try:
        return await docker_manager.get_container(container_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/containers/{container_id}/start")
async def start_container(container_id: str):
    try:
        await docker_manager.start_container(container_id)
        return {"success": True, "message": f"容器 {container_id} 已启动"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/{container_id}/stop")
async def stop_container(container_id: str):
    try:
        await docker_manager.stop_container(container_id)
        return {"success": True, "message": f"容器 {container_id} 已停止"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/{container_id}/restart")
async def restart_container(container_id: str):
    try:
        await docker_manager.restart_container(container_id)
        return {"success": True, "message": f"容器 {container_id} 已重启"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/containers/{container_id}")
async def remove_container(container_id: str, force: bool = False):
    try:
        await docker_manager.remove_container(container_id, force=force)
        return {"success": True, "message": f"容器 {container_id} 已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}/logs")
async def get_container_logs(container_id: str, tail: int = 100):
    try:
        logs = await docker_manager.get_container_logs(container_id, tail=tail)
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}/stats")
async def get_container_stats(container_id: str):
    try:
        return await docker_manager.get_container_stats(container_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/run")
async def run_container(req: RunContainerRequest):
    try:
        return await docker_manager.run_container(
            image=req.image,
            name=req.name,
            ports=req.ports,
            env=req.env,
            volumes=req.volumes,
            network=req.network,
            command=req.command,
            restart_policy=req.restart_policy,
            detach=req.detach,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 镜像 ──────────────────────────────────────────────

@router.get("/images")
async def list_images():
    try:
        return await docker_manager.list_images()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/images/pull")
async def pull_image(req: PullImageRequest):
    try:
        return await docker_manager.pull_image(req.image, req.tag)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/images/{image_id}")
async def remove_image(image_id: str, force: bool = False):
    try:
        await docker_manager.remove_image(image_id, force=force)
        return {"success": True, "message": f"镜像 {image_id} 已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 网络 ──────────────────────────────────────────────

@router.get("/networks")
async def list_networks():
    try:
        return await docker_manager.list_networks()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/networks")
async def create_network(req: CreateNetworkRequest):
    try:
        return await docker_manager.create_network(req.name, req.driver)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/networks/{network_id}")
async def remove_network(network_id: str):
    try:
        await docker_manager.remove_network(network_id)
        return {"success": True, "message": f"网络 {network_id} 已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/networks/{network_id}/connect/{container_id}")
async def connect_to_network(network_id: str, container_id: str):
    try:
        await docker_manager.connect_container_to_network(network_id, container_id)
        return {"success": True, "message": f"容器 {container_id} 已连接到网络 {network_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 卷 ──────────────────────────────────────────────

@router.get("/volumes")
async def list_volumes():
    try:
        return await docker_manager.list_volumes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/volumes")
async def create_volume(req: CreateVolumeRequest):
    try:
        return await docker_manager.create_volume(req.name, req.driver)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/volumes/{name}")
async def remove_volume(name: str):
    try:
        await docker_manager.remove_volume(name)
        return {"success": True, "message": f"数据卷 {name} 已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
