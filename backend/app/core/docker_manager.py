import os
import docker
import asyncio
from typing import Any, Dict, List, Optional
from functools import wraps


def run_sync(func):
    """在线程池中运行同步的 docker SDK 调用，避免阻塞事件循环。"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: func(*args, **kwargs))
    return wrapper


# 常见 Docker socket 路径，按优先级依次尝试
_SOCKET_CANDIDATES = [
    os.environ.get("DOCKER_SOCKET", ""),           # 优先用环境变量
    "unix:///var/run/docker.sock",                  # 标准 Linux
    "unix:///run/docker.sock",                      # 部分发行版
    os.path.expanduser("unix://~/.docker/desktop/docker.sock"),  # Docker Desktop Mac
    "npipe:////./pipe/docker_engine",               # Docker Desktop Windows
]


def _make_client() -> docker.DockerClient:
    """尝试各种 socket 路径，返回第一个可用的 DockerClient。"""
    last_err: Exception = RuntimeError("未找到可用的 Docker socket")
    for base_url in _SOCKET_CANDIDATES:
        if not base_url:
            continue
        try:
            client = docker.DockerClient(base_url=base_url, timeout=5)
            client.ping()          # 验证连接
            return client
        except Exception as e:
            last_err = e
    # 最后尝试 from_env（读取 DOCKER_HOST 环境变量）
    try:
        client = docker.from_env(timeout=5)
        client.ping()
        return client
    except Exception as e:
        last_err = e
    raise RuntimeError(
        f"无法连接到 Docker 守护进程。\n"
        f"请确保：\n"
        f"  1. 已挂载 Docker socket：-v /var/run/docker.sock:/var/run/docker.sock\n"
        f"  2. 或设置 DOCKER_SOCKET 环境变量指向正确路径\n"
        f"原始错误：{last_err}"
    )


class DockerManager:
    def __init__(self):
        self._client: Optional[docker.DockerClient] = None

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = _make_client()
        else:
            # 检测连接是否还活着，断了就重连
            try:
                self._client.ping()
            except Exception:
                self._client = _make_client()
        return self._client

    # ── 容器 ──────────────────────────────────────────────

    async def list_containers(self, all: bool = True) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        containers = await loop.run_in_executor(None, lambda: self.client.containers.list(all=all))
        result = []
        for c in containers:
            attrs = c.attrs if c.attrs is not None else {}
            ports = {}
            if c.ports:
                for k, v in c.ports.items():
                    if v:
                        ports[k] = [{"HostIp": p.get("HostIp", ""), "HostPort": p.get("HostPort", "")} for p in v]
                    else:
                        ports[k] = None
            result.append({
                "id": c.short_id,
                "full_id": c.id,
                "name": c.name,
                "image": c.image.tags[0] if c.image.tags else c.image.short_id,
                "status": c.status,
                "state": attrs.get("State") or {},
                "ports": ports,
                "created": attrs.get("Created") or "",
                "networks": list((attrs.get("NetworkSettings") or {}).get("Networks") or {}).keys()),
                "labels": c.labels or {},
            })
        return result

    async def get_container(self, container_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        attrs = c.attrs if c.attrs is not None else {}
        return {
            "id": c.short_id,
            "full_id": c.id,
            "name": c.name,
            "image": c.image.tags[0] if c.image.tags else c.image.short_id,
            "status": c.status,
            "state": attrs.get("State") or {},
            "ports": c.ports or {},
            "created": attrs.get("Created") or "",
            "config": attrs.get("Config") or {},
            "host_config": attrs.get("HostConfig") or {},
            "networks": (attrs.get("NetworkSettings") or {}).get("Networks") or {},
            "mounts": attrs.get("Mounts") or [],
        }

    async def start_container(self, container_id: str) -> bool:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        await loop.run_in_executor(None, c.start)
        return True

    async def stop_container(self, container_id: str) -> bool:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        await loop.run_in_executor(None, c.stop)
        return True

    async def restart_container(self, container_id: str) -> bool:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        await loop.run_in_executor(None, c.restart)
        return True

    async def remove_container(self, container_id: str, force: bool = False) -> bool:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        await loop.run_in_executor(None, lambda: c.remove(force=force))
        return True

    async def run_container(
        self,
        image: str,
        name: Optional[str] = None,
        ports: Optional[Dict] = None,
        env: Optional[Dict] = None,
        volumes: Optional[Dict] = None,
        network: Optional[str] = None,
        command: Optional[str] = None,
        restart_policy: Optional[str] = "unless-stopped",
        detach: bool = True,
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        kwargs: Dict[str, Any] = {
            "image": image,
            "detach": detach,
        }
        if name:
            kwargs["name"] = name
        if ports:
            kwargs["ports"] = ports
        if env:
            kwargs["environment"] = env
        if volumes:
            kwargs["volumes"] = volumes
        if network:
            kwargs["network"] = network
        if command:
            kwargs["command"] = command
        if restart_policy:
            kwargs["restart_policy"] = {"Name": restart_policy}

        c = await loop.run_in_executor(None, lambda: self.client.containers.run(**kwargs))
        return {"id": c.short_id, "name": c.name, "status": c.status}

    async def get_container_logs(self, container_id: str, tail: int = 100) -> str:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        logs = await loop.run_in_executor(None, lambda: c.logs(tail=tail, timestamps=True))
        return logs.decode("utf-8", errors="replace")

    async def get_container_stats(self, container_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        c = await loop.run_in_executor(None, lambda: self.client.containers.get(container_id))
        stats = await loop.run_in_executor(None, lambda: c.stats(stream=False))
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"].get("system_cpu_usage", 0) - stats["precpu_stats"].get("system_cpu_usage", 0)
        num_cpus = len(stats["cpu_stats"]["cpu_usage"].get("percpu_usage") or [1])
        cpu_pct = (cpu_delta / system_delta) * num_cpus * 100.0 if system_delta > 0 else 0.0
        mem_usage = stats["memory_stats"].get("usage", 0)
        mem_limit = stats["memory_stats"].get("limit", 1)
        return {
            "cpu_percent": round(cpu_pct, 2),
            "memory_usage": mem_usage,
            "memory_limit": mem_limit,
            "memory_percent": round(mem_usage / mem_limit * 100, 2) if mem_limit else 0,
        }

    # ── 镜像 ──────────────────────────────────────────────

    async def list_images(self) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        images = await loop.run_in_executor(None, self.client.images.list)
        return [
            {
                "id": img.short_id,
                "full_id": img.id,
                "tags": img.tags,
                "size": img.attrs.get("Size", 0),
                "created": img.attrs.get("Created", ""),
            }
            for img in images
        ]

    async def pull_image(self, image: str, tag: str = "latest") -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        img = await loop.run_in_executor(None, lambda: self.client.images.pull(image, tag=tag))
        return {"id": img.short_id, "tags": img.tags}

    async def remove_image(self, image_id: str, force: bool = False) -> bool:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: self.client.images.remove(image_id, force=force))
        return True

    # ── 网络 ──────────────────────────────────────────────

    async def list_networks(self) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        networks = await loop.run_in_executor(None, self.client.networks.list)
        result = []
        for n in networks:
            attrs = n.attrs if n.attrs is not None else {}
            result.append({
                "id": getattr(n, "short_id", "") or "",
                "full_id": getattr(n, "id", "") or "",
                "name": getattr(n, "name", "") or "",
                "driver": attrs.get("Driver") or "",
                "scope": attrs.get("Scope") or "",
                "created": attrs.get("Created") or "",
                "containers": list((attrs.get("Containers") or {}).keys()),
            })
        return result

    async def create_network(self, name: str, driver: str = "bridge") -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        n = await loop.run_in_executor(None, lambda: self.client.networks.create(name, driver=driver))
        return {"id": n.short_id, "name": n.name}

    async def remove_network(self, network_id: str) -> bool:
        loop = asyncio.get_event_loop()
        n = await loop.run_in_executor(None, lambda: self.client.networks.get(network_id))
        await loop.run_in_executor(None, n.remove)
        return True

    async def connect_container_to_network(self, network_id: str, container_id: str) -> bool:
        loop = asyncio.get_event_loop()
        n = await loop.run_in_executor(None, lambda: self.client.networks.get(network_id))
        await loop.run_in_executor(None, lambda: n.connect(container_id))
        return True

    # ── 卷 ──────────────────────────────────────────────

    async def list_volumes(self) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        vols = await loop.run_in_executor(None, self.client.volumes.list)
        return [
            {
                "name": v.name,
                "driver": v.attrs.get("Driver", ""),
                "mountpoint": v.attrs.get("Mountpoint", ""),
                "created": v.attrs.get("CreatedAt", ""),
                "labels": v.attrs.get("Labels") or {},
            }
            for v in vols
        ]

    async def create_volume(self, name: str, driver: str = "local") -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        v = await loop.run_in_executor(None, lambda: self.client.volumes.create(name, driver=driver))
        return {"name": v.name, "driver": v.attrs.get("Driver", "")}

    async def remove_volume(self, name: str) -> bool:
        loop = asyncio.get_event_loop()
        v = await loop.run_in_executor(None, lambda: self.client.volumes.get(name))
        await loop.run_in_executor(None, v.remove)
        return True

    # ── 系统信息 ──────────────────────────────────────────────

    async def get_system_info(self) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, self.client.info)
        version = await loop.run_in_executor(None, self.client.version)
        return {
            "containers": info.get("Containers", 0),
            "containers_running": info.get("ContainersRunning", 0),
            "containers_paused": info.get("ContainersPaused", 0),
            "containers_stopped": info.get("ContainersStopped", 0),
            "images": info.get("Images", 0),
            "docker_version": version.get("Version", ""),
            "os": info.get("OperatingSystem", ""),
            "architecture": info.get("Architecture", ""),
            "total_memory": info.get("MemTotal", 0),
            "cpus": info.get("NCPU", 0),
        }


docker_manager = DockerManager()
