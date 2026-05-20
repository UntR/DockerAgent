import os
import re
from typing import Any, Dict, List, Optional


WEB_PORTS = {80, 443, 3000, 5000, 8000, 8080, 8081, 8443, 9000}
ENV_REF_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}")


def analyze_compose(
    compose_content: str,
    env_vars: Optional[Dict[str, str]] = None,
    work_dir: Optional[str] = None,
    occupied_ports: Optional[set[int]] = None,
) -> Dict[str, Any]:
    env_vars = env_vars or {}
    occupied_ports = occupied_ports or set()
    compose = _load_compose(compose_content)
    services = compose.get("services") if isinstance(compose, dict) else {}
    if not isinstance(services, dict):
        services = {}

    warnings: List[Dict[str, str]] = []
    access_urls: List[Dict[str, Any]] = []

    _check_missing_env_refs(compose_content, env_vars, warnings)
    if work_dir:
        _check_overwrite(work_dir, env_vars, warnings)

    for service_name, raw_service in services.items():
        service = raw_service if isinstance(raw_service, dict) else {}
        _check_ports(str(service_name), service.get("ports") or [], warnings, access_urls, occupied_ports)
        _check_volumes(str(service_name), service.get("volumes") or [], warnings)
        _check_inline_environment(str(service_name), service.get("environment"), warnings)

    return {
        "warnings": warnings,
        "access_urls": access_urls,
    }


def _load_compose(compose_content: str) -> Dict[str, Any]:
    try:
        import yaml

        loaded = yaml.safe_load(compose_content)
        return loaded if isinstance(loaded, dict) else {}
    except Exception:
        return _parse_compose_subset(compose_content)


def _parse_compose_subset(compose_content: str) -> Dict[str, Any]:
    services: Dict[str, Dict[str, Any]] = {}
    current_service: Optional[str] = None
    current_key: Optional[str] = None

    for raw_line in compose_content.splitlines():
        if not raw_line.strip() or raw_line.strip().startswith("#"):
            continue

        stripped = raw_line.strip()
        indent = len(raw_line) - len(raw_line.lstrip(" "))

        if indent == 2 and stripped.endswith(":"):
            current_service = stripped[:-1]
            services[current_service] = {}
            current_key = None
            continue

        if current_service and indent == 4 and stripped.endswith(":"):
            current_key = stripped[:-1]
            services[current_service].setdefault(current_key, [])
            continue

        if current_service and current_key and indent >= 6 and stripped.startswith("- "):
            value = stripped[2:].strip().strip('"').strip("'")
            services[current_service].setdefault(current_key, []).append(value)

    return {"services": services}


def _check_missing_env_refs(
    compose_content: str,
    env_vars: Dict[str, str],
    warnings: List[Dict[str, str]],
) -> None:
    seen = set()
    for match in ENV_REF_RE.finditer(compose_content):
        key = match.group(1)
        expr = match.group(0)
        if ":-" in expr or "-" in expr:
            continue
        if key in seen:
            continue
        seen.add(key)
        if not str(env_vars.get(key, "")).strip():
            warnings.append({
                "level": "warning",
                "code": "missing_env_value",
                "message": f"compose 引用了环境变量 {key}，但当前部署参数没有提供值。",
            })


def _check_overwrite(
    work_dir: str,
    env_vars: Dict[str, str],
    warnings: List[Dict[str, str]],
) -> None:
    compose_path = os.path.join(work_dir, "docker-compose.yml")
    env_path = os.path.join(work_dir, ".env")
    if os.path.exists(compose_path):
        warnings.append({
            "level": "warning",
            "code": "overwrite_compose",
            "message": f"将覆盖已有 compose 文件：{compose_path}",
        })
    if env_vars and os.path.exists(env_path):
        warnings.append({
            "level": "warning",
            "code": "overwrite_env",
            "message": f"将覆盖已有环境变量文件：{env_path}",
        })


def _check_ports(
    service_name: str,
    ports: Any,
    warnings: List[Dict[str, str]],
    access_urls: List[Dict[str, Any]],
    occupied_ports: set[int],
) -> None:
    if not isinstance(ports, list):
        return

    for item in ports:
        parsed = _parse_port(item)
        if not parsed:
            continue

        host_ip, host_port, container_port = parsed
        if host_port in occupied_ports:
            warnings.append({
                "level": "danger",
                "code": "port_conflict",
                "service": service_name,
                "message": f"服务 {service_name} 要使用宿主机端口 {host_port}，但该端口已被占用。",
            })
        if host_port and not host_ip:
            warnings.append({
                "level": "warning",
                "code": "public_port_binding",
                "service": service_name,
                "message": f"服务 {service_name} 的端口 {host_port}:{container_port} 会默认绑定所有网卡。",
            })
        if host_ip == "0.0.0.0":
            warnings.append({
                "level": "warning",
                "code": "public_port_binding",
                "service": service_name,
                "message": f"服务 {service_name} 的端口 {host_port}:{container_port} 明确绑定到 0.0.0.0。",
            })

        if host_port and _is_web_port(container_port):
            scheme = "https" if container_port == 443 else "http"
            access_urls.append({
                "service": service_name,
                "url": f"{scheme}://localhost:{host_port}",
                "host_port": host_port,
                "container_port": container_port,
            })


def _parse_port(item: Any) -> Optional[tuple[str, int, int]]:
    if isinstance(item, int):
        return None

    if isinstance(item, dict):
        published = item.get("published")
        target = item.get("target")
        host_ip = str(item.get("host_ip") or item.get("host_ip") or "")
        if published and target:
            return host_ip, int(published), int(target)
        return None

    text = str(item).strip().strip('"').strip("'")
    if not text or ":" not in text:
        return None

    parts = text.split(":")
    try:
        if len(parts) == 2:
            return "", int(parts[0]), int(parts[1].split("/")[0])
        if len(parts) == 3:
            return parts[0], int(parts[1]), int(parts[2].split("/")[0])
    except ValueError:
        return None
    return None


def _check_volumes(
    service_name: str,
    volumes: Any,
    warnings: List[Dict[str, str]],
) -> None:
    if not isinstance(volumes, list):
        return

    for item in volumes:
        source = _volume_source(item)
        if not source:
            continue
        if source == "/var/run/docker.sock":
            warnings.append({
                "level": "danger",
                "code": "docker_socket_mount",
                "service": service_name,
                "message": f"服务 {service_name} 挂载了 /var/run/docker.sock，等同获得宿主机 Docker 控制权。",
            })
        elif source == "/":
            warnings.append({
                "level": "danger",
                "code": "host_root_mount",
                "service": service_name,
                "message": f"服务 {service_name} 挂载了宿主机根目录 /，风险很高。",
            })


def _volume_source(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("source") or "")
    text = str(item)
    if ":" not in text:
        return ""
    return text.split(":", 1)[0].strip().strip('"').strip("'")


def _check_inline_environment(
    service_name: str,
    environment: Any,
    warnings: List[Dict[str, str]],
) -> None:
    if isinstance(environment, list):
        for item in environment:
            text = str(item)
            if text.endswith("="):
                warnings.append({
                    "level": "warning",
                    "code": "empty_inline_env",
                    "service": service_name,
                    "message": f"服务 {service_name} 的环境变量 {text[:-1]} 为空。",
                })
    elif isinstance(environment, dict):
        for key, value in environment.items():
            if value in ("", None):
                warnings.append({
                    "level": "warning",
                    "code": "empty_inline_env",
                    "service": service_name,
                    "message": f"服务 {service_name} 的环境变量 {key} 为空。",
                })


def _is_web_port(port: int) -> bool:
    return port in WEB_PORTS
