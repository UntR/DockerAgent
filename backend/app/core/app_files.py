import os
from typing import Any, Dict, Optional


MAX_APP_FILE_BYTES = 256 * 1024


def mask_env_content(content: str) -> str:
    lines = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            lines.append(line)
            continue

        prefix = ""
        body = line
        leading = line[:len(line) - len(line.lstrip())]
        stripped_line = line.lstrip()
        if stripped_line.startswith("export "):
            prefix = leading + "export "
            body = stripped_line[len("export "):]
        elif leading:
            prefix = leading
            body = line[len(leading):]

        key, value = body.split("=", 1)
        lines.append(f"{prefix}{key}={'********' if value else ''}")
    return "\n".join(lines)


def _is_within_work_dir(path: str, work_dir: str) -> bool:
    real_path = os.path.realpath(path)
    real_work_dir = os.path.realpath(work_dir)
    return os.path.commonpath([real_path, real_work_dir]) == real_work_dir


def read_app_file(path: str, kind: str, work_dir: Optional[str] = None) -> Dict[str, Any]:
    if work_dir and not _is_within_work_dir(path, work_dir):
        raise ValueError("应用文件路径不在工作目录内")

    with open(path, "rb") as f:
        raw = f.read(MAX_APP_FILE_BYTES + 1)

    truncated = len(raw) > MAX_APP_FILE_BYTES
    raw = raw[:MAX_APP_FILE_BYTES]
    content = raw.decode("utf-8", errors="replace")
    if kind == "env":
        content = mask_env_content(content)

    return {
        "kind": kind,
        "path": path,
        "content": content,
        "masked": kind == "env",
        "truncated": truncated,
    }
