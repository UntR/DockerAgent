from pydantic import BaseModel, Field
from typing import Optional, Any, List, Dict
from datetime import datetime


# ── Docker 相关 ──────────────────────────────────────────────

class ContainerAction(BaseModel):
    container_id: str


class RunContainerRequest(BaseModel):
    image: str
    name: Optional[str] = None
    ports: Optional[Dict[str, Any]] = None
    env: Optional[Dict[str, str]] = None
    volumes: Optional[Dict[str, Dict[str, str]]] = None
    network: Optional[str] = None
    command: Optional[str] = None
    restart_policy: Optional[str] = "unless-stopped"
    detach: bool = True


class PullImageRequest(BaseModel):
    image: str
    tag: str = "latest"


class CreateNetworkRequest(BaseModel):
    name: str
    driver: str = "bridge"


class CreateVolumeRequest(BaseModel):
    name: str
    driver: str = "local"


# ── Agent 相关 ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    session_id: str
    message: str


class AgentChatResponse(BaseModel):
    session_id: str
    reply: str
    tool_calls_used: List[str] = []


# ── 部署相关 ──────────────────────────────────────────────

class DeployRequest(BaseModel):
    source: str
    description: Optional[str] = None


class DeployResult(BaseModel):
    success: bool
    message: str
    containers_created: List[str] = []
    compose_content: Optional[str] = None


# ── 回滚相关 ──────────────────────────────────────────────

class SnapshotCreate(BaseModel):
    name: str
    description: Optional[str] = None


class RollbackRequest(BaseModel):
    snapshot_id: int
    keep_volumes: bool = True


class SnapshotInfo(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    is_auto: bool
    container_count: int

    class Config:
        from_attributes = True


# ── 记忆相关 ──────────────────────────────────────────────

class MemoryItem(BaseModel):
    key: str
    value: str
    category: str = "general"
    importance: float = 1.0
