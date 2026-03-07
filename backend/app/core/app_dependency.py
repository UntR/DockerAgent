"""
应用联动知识库。
记录常见 Docker 应用之间的依赖关系和联动配置，
供 Agent 在部署时自动感知并处理网络/环境变量联通。
"""
from typing import Any, Dict, List, Optional

# 规范名称映射：将各种写法统一到标准 key
ALIASES: Dict[str, str] = {
    "ollama": "ollama",
    "open-webui": "open-webui",
    "openwebui": "open-webui",
    "open_webui": "open-webui",
    "webui": "open-webui",
    "nginx": "nginx",
    "n8n": "n8n",
    "postgres": "postgres",
    "postgresql": "postgres",
    "mysql": "mysql",
    "redis": "redis",
    "minio": "minio",
    "grafana": "grafana",
    "prometheus": "prometheus",
    "portainer": "portainer",
    "traefik": "traefik",
    "nextcloud": "nextcloud",
    "wordpress": "wordpress",
    "gitea": "gitea",
    "vaultwarden": "vaultwarden",
    "bitwarden": "vaultwarden",
    "immich": "immich",
    "jellyfin": "jellyfin",
    "plex": "plex",
    "searxng": "searxng",
    "searx": "searxng",
    "qdrant": "qdrant",
    "weaviate": "weaviate",
    "chroma": "chroma",
    "chromadb": "chroma",
    "langfuse": "langfuse",
    "litellm": "litellm",
    "anythingllm": "anythingllm",
}

# 应用描述（中文，供自然语言回复使用）
APP_DESCRIPTIONS: Dict[str, str] = {
    "ollama": "本地大模型运行时，可在本机运行 Llama、Mistral 等开源 LLM",
    "open-webui": "Ollama 的网页对话界面，让你像使用 ChatGPT 一样使用本地大模型",
    "n8n": "可视化自动化工作流工具，类似 Zapier 的开源替代品",
    "postgres": "PostgreSQL 关系型数据库",
    "mysql": "MySQL 关系型数据库",
    "redis": "高性能内存缓存和消息队列",
    "minio": "兼容 S3 的对象存储服务",
    "grafana": "数据可视化和监控仪表盘",
    "prometheus": "指标采集和告警系统",
    "portainer": "Docker 容器图形化管理界面",
    "traefik": "反向代理和负载均衡器，支持自动 HTTPS",
    "nginx": "高性能反向代理和 Web 服务器",
    "nextcloud": "私有云存储，可替代 Dropbox/Google Drive",
    "wordpress": "最流行的开源博客/CMS 平台",
    "gitea": "轻量级自托管 Git 服务",
    "vaultwarden": "Bitwarden 兼容的密码管理器服务端",
    "immich": "高性能自托管照片和视频备份方案",
    "jellyfin": "免费的自托管媒体服务器",
    "plex": "媒体服务器，支持远程流媒体",
    "searxng": "隐私友好的元搜索引擎",
    "qdrant": "高性能向量数据库，适合 AI 应用",
    "weaviate": "向量数据库，支持多模态搜索",
    "chroma": "轻量级向量数据库，适合 RAG 应用",
    "langfuse": "LLM 应用的可观测性和分析平台",
    "litellm": "统一 LLM API 代理，支持多种模型提供商",
    "anythingllm": "全功能本地 AI 助手，支持文档对话",
}


# 应用间依赖关系定义
class AppRelation:
    def __init__(
        self,
        app_a: str,
        app_b: str,
        description: str,
        shared_network: bool = True,
        env_vars: Optional[Dict[str, str]] = None,
        notes: str = "",
    ):
        self.app_a = app_a
        self.app_b = app_b
        self.description = description
        self.shared_network = shared_network
        self.env_vars = env_vars or {}
        self.notes = notes


RELATIONS: List[AppRelation] = [
    AppRelation(
        "ollama", "open-webui",
        "Open WebUI 需要连接 Ollama 提供模型推理，必须在同一 Docker 网络中",
        shared_network=True,
        env_vars={"OLLAMA_BASE_URL": "http://ollama:11434"},
    ),
    AppRelation(
        "ollama", "anythingllm",
        "AnythingLLM 可使用 Ollama 作为本地 LLM 后端",
        shared_network=True,
        env_vars={"OLLAMA_BASE_PATH": "http://ollama:11434"},
    ),
    AppRelation(
        "ollama", "litellm",
        "LiteLLM 可代理 Ollama 模型统一对外暴露 OpenAI 兼容接口",
        shared_network=True,
    ),
    AppRelation(
        "postgres", "n8n",
        "n8n 可使用 PostgreSQL 作为持久化存储（替代默认的 SQLite）",
        shared_network=True,
        env_vars={
            "DB_TYPE": "postgresdb",
            "DB_POSTGRESDB_HOST": "postgres",
            "DB_POSTGRESDB_PORT": "5432",
        },
    ),
    AppRelation(
        "postgres", "nextcloud",
        "Nextcloud 推荐使用 PostgreSQL 作为数据库",
        shared_network=True,
        env_vars={
            "POSTGRES_HOST": "postgres",
            "POSTGRES_DB": "nextcloud",
        },
    ),
    AppRelation(
        "postgres", "gitea",
        "Gitea 可使用 PostgreSQL 作为数据库",
        shared_network=True,
    ),
    AppRelation(
        "postgres", "langfuse",
        "Langfuse 使用 PostgreSQL 存储追踪数据",
        shared_network=True,
        env_vars={"DATABASE_URL": "postgresql://postgres:password@postgres:5432/langfuse"},
    ),
    AppRelation(
        "redis", "n8n",
        "n8n 使用 Redis 作为队列后端（多工作节点时需要）",
        shared_network=True,
        env_vars={"QUEUE_BULL_REDIS_HOST": "redis"},
    ),
    AppRelation(
        "redis", "nextcloud",
        "Nextcloud 使用 Redis 作为缓存和文件锁定",
        shared_network=True,
        env_vars={"REDIS_HOST": "redis"},
    ),
    AppRelation(
        "prometheus", "grafana",
        "Grafana 使用 Prometheus 作为数据源进行指标可视化",
        shared_network=True,
    ),
    AppRelation(
        "qdrant", "open-webui",
        "Open WebUI 支持使用 Qdrant 作为 RAG 向量数据库",
        shared_network=True,
        env_vars={"QDRANT_URI": "http://qdrant:6333"},
    ),
    AppRelation(
        "qdrant", "anythingllm",
        "AnythingLLM 可使用 Qdrant 作为向量存储后端",
        shared_network=True,
    ),
    AppRelation(
        "minio", "nextcloud",
        "Nextcloud 可使用 MinIO 作为 S3 兼容对象存储",
        shared_network=True,
    ),
    AppRelation(
        "mysql", "wordpress",
        "WordPress 需要 MySQL/MariaDB 作为数据库",
        shared_network=True,
        env_vars={
            "WORDPRESS_DB_HOST": "mysql",
            "WORDPRESS_DB_NAME": "wordpress",
        },
    ),
]


def normalize_name(name: str) -> str:
    """将应用名称规范化为标准 key。"""
    return ALIASES.get(name.lower().strip(), name.lower().strip())


def get_app_description(name: str) -> Optional[str]:
    """获取应用的中文描述。"""
    key = normalize_name(name)
    return APP_DESCRIPTIONS.get(key)


def find_relations(app_names: List[str]) -> List[AppRelation]:
    """找出给定应用列表中存在联动关系的配对。"""
    normalized = [normalize_name(n) for n in app_names]
    found = []
    for rel in RELATIONS:
        if rel.app_a in normalized and rel.app_b in normalized:
            found.append(rel)
    return found


def get_dependencies_for(app_name: str) -> List[AppRelation]:
    """获取某个应用所有已知的联动关系（无论它是 app_a 还是 app_b）。"""
    key = normalize_name(app_name)
    return [r for r in RELATIONS if r.app_a == key or r.app_b == key]


def describe_relations_for_deployment(existing_apps: List[str], new_app: str) -> Optional[str]:
    """
    在部署新应用时，检查它与已有应用之间是否有联动关系，
    返回中文描述建议。
    """
    existing_normalized = [normalize_name(a) for a in existing_apps]
    new_normalized = normalize_name(new_app)

    suggestions = []
    for rel in RELATIONS:
        if rel.app_a == new_normalized and rel.app_b in existing_normalized:
            suggestions.append(f"检测到 {new_app} 与已有的 {rel.app_b} 存在联动关系：{rel.description}")
            if rel.shared_network:
                suggestions.append(f"  → 建议将它们放在同一 Docker 网络中")
            if rel.env_vars:
                env_str = "、".join([f"{k}={v}" for k, v in rel.env_vars.items()])
                suggestions.append(f"  → 需要设置环境变量：{env_str}")
        elif rel.app_b == new_normalized and rel.app_a in existing_normalized:
            suggestions.append(f"检测到 {new_app} 与已有的 {rel.app_a} 存在联动关系：{rel.description}")
            if rel.shared_network:
                suggestions.append(f"  → 建议将它们放在同一 Docker 网络中")
            if rel.env_vars:
                env_str = "、".join([f"{k}={v}" for k, v in rel.env_vars.items()])
                suggestions.append(f"  → 需要设置环境变量：{env_str}")

    return "\n".join(suggestions) if suggestions else None


def get_relation_env_vars(app_a: str, app_b: str) -> Dict[str, str]:
    """获取两个应用之间联动所需的环境变量。"""
    a = normalize_name(app_a)
    b = normalize_name(app_b)
    for rel in RELATIONS:
        if (rel.app_a == a and rel.app_b == b) or (rel.app_a == b and rel.app_b == a):
            return rel.env_vars
    return {}
