"""
MCP Docker 工具定义。
这里不使用完整的 MCP 服务器框架（避免额外进程），
而是将工具定义为标准的 Tool Calling 格式，
由 agent_engine 直接调用 docker_manager 执行。
"""
from typing import Any, Dict, List

# Anthropic Tool Calling 格式的工具定义
DOCKER_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "list_containers",
        "description": "列出所有 Docker 容器（包括已停止的），返回容器的 ID、名称、镜像、状态、端口等信息。",
        "input_schema": {
            "type": "object",
            "properties": {
                "all": {
                    "type": "boolean",
                    "description": "是否包含已停止的容器，默认 true",
                    "default": True,
                }
            },
        },
    },
    {
        "name": "get_container",
        "description": "获取指定容器的详细信息，包括配置、网络、挂载点等。",
        "input_schema": {
            "type": "object",
            "properties": {
                "container_id": {
                    "type": "string",
                    "description": "容器 ID 或名称",
                }
            },
            "required": ["container_id"],
        },
    },
    {
        "name": "start_container",
        "description": "启动一个已停止的容器。",
        "input_schema": {
            "type": "object",
            "properties": {
                "container_id": {"type": "string", "description": "容器 ID 或名称"}
            },
            "required": ["container_id"],
        },
    },
    {
        "name": "stop_container",
        "description": "停止一个正在运行的容器。",
        "input_schema": {
            "type": "object",
            "properties": {
                "container_id": {"type": "string", "description": "容器 ID 或名称"}
            },
            "required": ["container_id"],
        },
    },
    {
        "name": "restart_container",
        "description": "重启一个容器。",
        "input_schema": {
            "type": "object",
            "properties": {
                "container_id": {"type": "string", "description": "容器 ID 或名称"}
            },
            "required": ["container_id"],
        },
    },
    {
        "name": "remove_container",
        "description": "删除一个容器（可强制删除运行中的容器）。",
        "input_schema": {
            "type": "object",
            "properties": {
                "container_id": {"type": "string", "description": "容器 ID 或名称"},
                "force": {"type": "boolean", "description": "是否强制删除（含运行中的容器）", "default": False},
            },
            "required": ["container_id"],
        },
    },
    {
        "name": "get_container_logs",
        "description": "获取容器的日志输出。",
        "input_schema": {
            "type": "object",
            "properties": {
                "container_id": {"type": "string", "description": "容器 ID 或名称"},
                "tail": {"type": "integer", "description": "返回最后 N 行，默认 100", "default": 100},
            },
            "required": ["container_id"],
        },
    },
    {
        "name": "run_container",
        "description": "拉取镜像并运行一个新容器。",
        "input_schema": {
            "type": "object",
            "properties": {
                "image": {"type": "string", "description": "镜像名称，如 nginx:latest"},
                "name": {"type": "string", "description": "容器名称（可选）"},
                "ports": {
                    "type": "object",
                    "description": "端口映射，格式：{\"容器端口/协议\": 宿主机端口}，如 {\"80/tcp\": 8080}",
                },
                "env": {
                    "type": "object",
                    "description": "环境变量，格式：{\"KEY\": \"VALUE\"}",
                },
                "volumes": {
                    "type": "object",
                    "description": "卷挂载，格式：{\"宿主机路径或卷名\": {\"bind\": \"容器路径\", \"mode\": \"rw\"}}",
                },
                "network": {"type": "string", "description": "加入的 Docker 网络名称"},
                "command": {"type": "string", "description": "覆盖默认启动命令"},
                "restart_policy": {
                    "type": "string",
                    "description": "重启策略：no / always / unless-stopped / on-failure",
                    "default": "unless-stopped",
                },
            },
            "required": ["image"],
        },
    },
    {
        "name": "pull_image",
        "description": "从镜像仓库拉取一个镜像。",
        "input_schema": {
            "type": "object",
            "properties": {
                "image": {"type": "string", "description": "镜像名称"},
                "tag": {"type": "string", "description": "标签，默认 latest", "default": "latest"},
            },
            "required": ["image"],
        },
    },
    {
        "name": "list_images",
        "description": "列出本地所有 Docker 镜像。",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "remove_image",
        "description": "删除本地镜像。",
        "input_schema": {
            "type": "object",
            "properties": {
                "image_id": {"type": "string", "description": "镜像 ID 或名称:标签"},
                "force": {"type": "boolean", "description": "强制删除", "default": False},
            },
            "required": ["image_id"],
        },
    },
    {
        "name": "list_networks",
        "description": "列出所有 Docker 网络。",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_network",
        "description": "创建一个新的 Docker 网络。",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "网络名称"},
                "driver": {"type": "string", "description": "网络驱动，默认 bridge", "default": "bridge"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "remove_network",
        "description": "删除一个 Docker 网络。",
        "input_schema": {
            "type": "object",
            "properties": {
                "network_id": {"type": "string", "description": "网络 ID 或名称"}
            },
            "required": ["network_id"],
        },
    },
    {
        "name": "connect_to_network",
        "description": "将一个容器连接到指定的 Docker 网络。",
        "input_schema": {
            "type": "object",
            "properties": {
                "network_id": {"type": "string", "description": "网络 ID 或名称"},
                "container_id": {"type": "string", "description": "容器 ID 或名称"},
            },
            "required": ["network_id", "container_id"],
        },
    },
    {
        "name": "list_volumes",
        "description": "列出所有 Docker 数据卷。",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_volume",
        "description": "创建一个新的 Docker 数据卷。",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "卷名称"},
                "driver": {"type": "string", "description": "驱动，默认 local", "default": "local"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "get_system_info",
        "description": "获取 Docker 宿主机系统信息，包括容器数量、镜像数量、Docker 版本、内存、CPU 等。",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "fetch_deployment_info",
        "description": "从 URL、GitHub 仓库或镜像名称获取部署信息（docker-compose 内容、docker run 命令等），用于辅助部署。",
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "可以是 URL（GitHub 仓库、论坛帖子）、GitHub owner/repo 格式、或镜像名称",
                }
            },
            "required": ["source"],
        },
    },
    {
        "name": "analyze_project_requirements",
        "description": (
            "深度分析一个 GitHub 项目的部署需求。"
            "会自动获取并解析 README、docker-compose.yml 和 .env.example，"
            "返回必填配置项列表（含说明）和可选配置项。"
            "在部署任何需要配置的项目之前，应先调用此工具，"
            "然后根据返回的必填项向用户逐一询问。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "github_url": {
                    "type": "string",
                    "description": "GitHub 仓库 URL，如 https://github.com/owner/repo",
                }
            },
            "required": ["github_url"],
        },
    },
    {
        "name": "deploy_with_compose",
        "description": (
            "使用用户提供的环境变量和 docker-compose 内容来部署项目。"
            "在用户确认了所有必填配置后调用此工具完成部署。"
            "会自动将 env_vars 写入 .env 文件，然后执行 docker-compose up。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "项目名称（用于 docker-compose 的 project name 和工作目录名）",
                },
                "compose_content": {
                    "type": "string",
                    "description": "docker-compose.yml 的完整内容",
                },
                "env_vars": {
                    "type": "object",
                    "description": "环境变量键值对，如 {\"API_KEY\": \"sk-xxx\", \"PORT\": \"8080\"}",
                },
            },
            "required": ["project_name", "compose_content"],
        },
    },
    {
        "name": "save_memory",
        "description": "记住用户告知的重要信息，如用户偏好、常用配置等，供后续对话使用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "记忆的键名"},
                "value": {"type": "string", "description": "记忆的内容"},
                "category": {
                    "type": "string",
                    "description": "分类：preference（偏好）/ config（配置）/ note（笔记）/ general",
                    "default": "general",
                },
            },
            "required": ["key", "value"],
        },
    },
]
