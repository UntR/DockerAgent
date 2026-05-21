import posixpath
import re
from typing import Any, Dict, Optional, Set
from urllib.parse import urlparse

from app.core.compose_preflight import analyze_compose


def build_deployment_plan(
    source: str,
    description: Optional[str],
    analysis: Dict[str, Any],
    env_vars: Optional[Dict[str, str]] = None,
    projects_base_dir: str = "/opt/docker-projects",
    occupied_ports: Optional[Set[int]] = None,
) -> Dict[str, Any]:
    env_vars = env_vars or {}
    occupied_ports = occupied_ports or set()
    compose_content = _extract_compose_content(analysis)
    app_name = _infer_app_name(source, analysis)
    compose_project = _slugify(app_name)
    work_dir = posixpath.join(projects_base_dir.rstrip("/"), compose_project)
    env_config = analysis.get("env_config") if isinstance(analysis.get("env_config"), dict) else {}

    warnings = []
    access_urls = []
    if compose_content:
        preflight = analyze_compose(
            compose_content,
            env_vars=env_vars,
            work_dir=work_dir,
            occupied_ports=occupied_ports,
        )
        warnings = preflight.get("warnings") or []
        access_urls = preflight.get("access_urls") or []
    else:
        warnings.append({
            "level": "danger",
            "code": "missing_compose",
            "message": "未找到可直接部署的 docker-compose.yml，请先补充 Compose 配置。",
        })

    files = [{
        "kind": "compose",
        "path": posixpath.join(work_dir, "docker-compose.yml"),
        "action": "write",
    }]
    if env_vars or _env_entries(env_config):
        files.append({
            "kind": "env",
            "path": posixpath.join(work_dir, ".env"),
            "action": "write",
        })

    missing_required = [
        item.get("key", "")
        for item in _env_entries(env_config, "required")
        if item.get("key") and not str(env_vars.get(item.get("key"), "")).strip()
    ]

    return {
        "source": source,
        "description": description or "",
        "app_name": app_name,
        "compose_project": compose_project,
        "work_dir": work_dir,
        "files": files,
        "env": {
            "required": _env_entries(env_config, "required"),
            "optional": _env_entries(env_config, "optional"),
            "provided_keys": sorted(env_vars.keys()),
            "missing_required_keys": missing_required,
        },
        "warnings": warnings,
        "access_urls": access_urls,
        "deployable": bool(compose_content) and not any(w.get("code") == "port_conflict" for w in warnings),
    }


def _extract_compose_content(analysis: Dict[str, Any]) -> str:
    compose_content = analysis.get("compose_content")
    if isinstance(compose_content, str) and compose_content.strip():
        return compose_content

    page_info = analysis.get("page_info")
    if isinstance(page_info, dict):
        compose_blocks = page_info.get("compose_blocks")
        if isinstance(compose_blocks, list) and compose_blocks:
            return str(compose_blocks[0])
    return ""


def _infer_app_name(source: str, analysis: Dict[str, Any]) -> str:
    repo = analysis.get("repo")
    if isinstance(repo, str) and repo.strip():
        return repo.strip()

    parsed = urlparse(source)
    if parsed.scheme and parsed.path:
        parts = [part for part in parsed.path.split("/") if part]
        if parts:
            return parts[-1].removesuffix(".git")

    parts = [part for part in source.split("/") if part]
    if parts:
        return parts[-1].split(":")[0]
    return "docker-app"


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]", "-", value.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or "docker-app"


def _env_entries(env_config: Dict[str, Any], key: Optional[str] = None) -> list[Dict[str, Any]]:
    if key:
        entries = env_config.get(key)
        return entries if isinstance(entries, list) else []
    return _env_entries(env_config, "required") + _env_entries(env_config, "optional")
