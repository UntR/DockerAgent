from typing import Any, Dict


def snapshot_to_dict(snapshot: Any) -> Dict[str, Any]:
    return {
        "id": snapshot.id,
        "name": snapshot.name,
        "description": snapshot.description,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else "",
        "is_auto": snapshot.is_auto,
        "container_count": len(snapshot.containers) if snapshot.containers else 0,
        "compose_project": getattr(snapshot, "compose_project", "") or "",
    }
