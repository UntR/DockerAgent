# DockerAgent

DockerAgent 是一个面向中文 self-hosted 用户的本地 AI Docker/Compose 应用安装与管理器。

它的目标不是做泛 DevOps、SSH 运维工作台或整机控制面板，而是把一个常见流程做深：

1. 输入 GitHub 仓库、Compose 项目、镜像名、应用名或一句需求。
2. 自动读取 README、`docker-compose.yml` / `compose.yaml`、`.env.example` 和部署说明。
3. 用中文解释必填配置，并生成可确认的部署计划。
4. 部署前做 Compose 预检、风险提示和快照。
5. 用户确认后写入 compose/env，执行 `docker compose pull` 和 `docker compose up -d`。
6. 展示部署状态、访问地址、日志、配置文件、关联容器和回滚入口。

## 严重安全提醒

DockerAgent 需要挂载 `/var/run/docker.sock`。

这等同于让 DockerAgent 拥有宿主机 Docker 的高权限控制能力。它可以创建、停止、删除容器，也可能通过 Docker 间接影响宿主机文件和数据。

默认使用方式是本机访问：

- 默认端口绑定为 `127.0.0.1:${PORT:-3000}:8088`。
- 未设置 `ACCESS_TOKEN` 时，后端要求 `Host` 和真实客户端地址都必须是本机 loopback。
- 设置 `ACCESS_TOKEN` 后，所有 `/api/*` HTTP 请求都需要 token，WebSocket 也需要 token。
- 不建议直接暴露到公网。

如果你一定要通过反向代理远程访问，请至少做到：

- 设置强 `ACCESS_TOKEN`。
- 使用 HTTPS。
- 限制来源 IP 或通过 VPN / Tailscale / 内网访问。
- 明确理解 Docker socket 暴露带来的风险。

## 当前能力

| 模块 | 说明 |
| --- | --- |
| 工作台 | 以应用部署为中心展示 Docker 状态、近期应用、风险提醒和快速入口 |
| 智能部署 | 分析 GitHub / Compose / Docker 镜像 / 网页内容，生成部署计划 |
| Env 配置引导 | 从 `.env.example` 识别必填和可选变量，在部署页生成填写表单 |
| 部署计划 | 展示应用名、Compose 项目名、工作目录、将写入文件、预检风险和预计访问地址 |
| 部署任务记录 | 记录部署任务的 `running` / `deployed` / `failed` 状态，失败时保留错误输出 |
| 应用管理 | 登记已部署应用，展示 compose 路径、env 路径、访问 URL、关联容器、日志和快照 |
| 应用级回滚 | 部署前自动快照，回滚时按 Compose 项目收窄范围，默认保留数据卷 |
| 危险操作确认 | 容器启停、删除镜像/网络/卷、Compose 部署、回滚等危险操作需要后端确认 |
| LLM Provider 管理 | UI 中配置 Anthropic、OpenAI 和 OpenAI-compatible Provider，支持热切换 |
| 中文 AI 助手 | 对话式查看日志、分析部署问题、解释配置项和执行 Docker/Compose 操作 |

## 不做什么

DockerAgent 不定位为：

- Linux 服务器管理面板
- SSH 运维工作台
- Kubernetes 平台
- CI/CD 平台
- 云端多租户控制台
- Portainer 的全功能替代品

它只在 Docker/Compose 应用部署、检查、管理和回滚这条链路上发力。

## 快速开始

### 方式一：Docker Compose 启动（推荐）

前提：宿主机已安装 Docker 和 Docker Compose。

```bash
git clone https://github.com/UntR/DockerAgent.git
cd DockerAgent

cp .env.example .env
# 编辑 .env，至少填一个 LLM API Key，建议同时设置 ACCESS_TOKEN
nano .env

docker compose up -d
```

启动后访问：

```text
http://localhost:3000
```

默认 `docker-compose.yml` 会把服务绑定到本机：

```yaml
ports:
  - "127.0.0.1:${PORT:-3000}:8088"
```

### 方式二：docker run 启动

```bash
docker run -d \
  --name docker-agent \
  -p 127.0.0.1:3000:8088 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/docker-projects:/opt/docker-projects \
  -v docker-agent-data:/data \
  -e ACCESS_TOKEN=replace-with-a-long-random-token \
  -e ANTHROPIC_API_KEY=your_key_here \
  rcpn7/docker-agent:latest
```

如果使用 OpenAI-compatible Provider，可以先不传 API Key，启动后到「设置」页面添加。

## 关键目录与挂载

DockerAgent 使用 DoOD（Docker-outside-of-Docker）方式工作：容器内调用宿主机 Docker daemon。

| 挂载 | 作用 |
| --- | --- |
| `/var/run/docker.sock:/var/run/docker.sock` | 控制宿主机 Docker，必须挂载 |
| `${PROJECTS_BASE_DIR}:${PROJECTS_BASE_DIR}` | 存放 DockerAgent 写入的 compose/env 文件 |
| `docker-agent-data:/data` | 保存 SQLite 数据库、对话历史、LLM 配置、快照和部署任务 |

`PROJECTS_BASE_DIR` 默认是：

```text
/opt/docker-projects
```

如果你的 NAS 或服务器没有 `/opt`，可以改成类似：

```env
PROJECTS_BASE_DIR=/volume1/docker-projects
```

同时要保证 `docker-compose.yml` 中的卷映射也使用同一个路径。宿主机 Docker daemon 会解析 compose 文件里的相对路径和卷路径，所以两侧路径必须一致。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | Web UI 对外端口，compose 默认绑定到 `127.0.0.1` |
| `ACCESS_TOKEN` | 空 | 设置后所有 API 请求需要 token；留空则仅允许本机 loopback 访问 |
| `ALLOWED_ORIGINS` | 空 | CORS 来源列表，逗号分隔；留空时为本机模式默认配置 |
| `LLM_PROVIDER` | `anthropic` | 初始 LLM Provider，可在 UI 中切换 |
| `ANTHROPIC_API_KEY` | 空 | Anthropic API Key |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Anthropic 默认模型 |
| `OPENAI_API_KEY` | 空 | OpenAI 或 OpenAI-compatible API Key |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI 初始模型 |
| `OPENAI_BASE_URL` | 空 | OpenAI-compatible Base URL |
| `GITHUB_TOKEN` | 空 | 可选，提高读取 GitHub 文件的速率限制 |
| `DB_PATH` | `/data/docker_agent.db` | SQLite 数据库路径 |
| `COMPOSE_PULL_TIMEOUT` | `0` | 镜像拉取超时秒数，`0` 表示不限时 |
| `COMPOSE_UP_TIMEOUT` | `120` | `docker compose up -d` 超时秒数 |
| `PROJECTS_BASE_DIR` | `/opt/docker-projects` | 应用 compose/env 工作目录 |
| `PUID` / `PGID` | 空 | 可选，写入文件后自动 chown，方便宿主机普通用户编辑 |

## LLM Provider 配置

DockerAgent 支持两类接口：

- Anthropic Claude
- OpenAI Chat Completions 兼容接口

设置页面内置了常用 Provider 预设，包括：

- OpenAI
- DeepSeek
- MiniMax
- SiliconFlow
- 火山方舟 / 豆包
- Qwen / 阿里百炼
- GLM / 智谱
- Kimi / Moonshot
- OpenRouter
- Groq
- NVIDIA NIM
- Ollama
- LM Studio

第三方 Provider 通常走 OpenAI-compatible Chat Completions 格式。DockerAgent 会优先尝试拉取 `/models`，如果 Provider 不支持模型列表接口，再按域名使用内置兜底模型列表。

## 部署一个应用

进入「安装应用」页面后：

1. 输入 GitHub URL、`owner/repo`、Docker 镜像名或应用需求。
2. 点击「解析分析」。
3. DockerAgent 会尝试读取：
   - README
   - `docker-compose.yml` / `docker-compose.yaml` / `compose.yml` / `compose.yaml`
   - `.env.example`
   - 网页中的 Compose 代码块或 `docker run` 命令
4. 页面会生成部署计划，展示：
   - Compose 项目名
   - 工作目录
   - 将写入的文件
   - 必填和可选环境变量
   - 端口冲突、公开端口、Docker socket 挂载、宿主机根目录挂载等风险
   - 预计访问地址
5. 填写必填 env 后，刷新计划。
6. 点击「AI 智能部署」进入 AI 助手，由 Agent 执行部署流程。

部署执行时会：

1. 再次执行 Compose 预检。
2. 要求用户确认危险操作。
3. 创建部署前快照。
4. 写入 `docker-compose.yml` 和 `.env`。
5. 执行 `docker compose -p <project> pull`。
6. 执行 `docker compose -p <project> up -d`。
7. 登记应用和部署任务状态。

部署成功后，可以在「我的应用」中查看应用详情。

## 应用详情页

应用详情页提供：

- 应用名称、Compose 项目名、工作目录
- Compose 文件路径和 Env 文件路径
- 访问地址
- 关联容器
- 容器日志
- Compose 文件查看
- Env 文件查看
- 关联快照
- 回滚入口

Env 文件默认会脱敏显示，不直接展示明文 secret。

## 回滚机制

DockerAgent 的回滚是应用管理链路的一部分，不是整机恢复工具。

当前行为：

- 部署前自动创建快照。
- 快照记录容器、网络、卷信息。
- 如果快照关联了 `compose_project`，回滚时只处理该 Compose 项目的容器和卷。
- 默认保留数据卷，避免误删数据库等持久化数据。
- 用户显式取消「保留数据卷」时，才会尝试清理快照后新增的应用卷。

注意：回滚不能替代数据库备份。对 PostgreSQL、MySQL、Redis、MinIO 等有状态应用，仍建议使用应用自己的备份机制。

## 安全机制

DockerAgent 当前包含这些防线：

- 默认只绑定本机地址。
- 未设置 `ACCESS_TOKEN` 时，只允许 `Host` 和真实客户端地址都为 loopback。
- 设置 `ACCESS_TOKEN` 后，HTTP API 和 WebSocket 都需要 token。
- 危险 Docker/Compose 操作在后端工具层要求确认。
- Compose 部署前会检查端口冲突。
- Compose 部署前会提示公开端口绑定。
- Compose 部署前会提示 Docker socket 挂载和宿主机根目录挂载。
- 应用文件读取限制在应用工作目录内。
- `.env` 文件查看默认脱敏。
- 回滚默认保留数据卷。
- 应用级回滚按 Compose 项目收窄范围。

仍然需要你注意：

- 不要直接公网暴露 DockerAgent。
- 不要给不可信的人使用访问 token。
- 不要部署你不理解的 Compose 文件。
- 不要把宿主机根目录、Docker socket、SSH key、云厂商凭据等随意挂进第三方应用。

## 本地开发

环境要求：

- Python 3.10+
- Node.js 18+
- Docker

```bash
git clone https://github.com/UntR/DockerAgent.git
cd DockerAgent

cp .env.example .env
# 编辑 .env

bash dev.sh
```

默认开发地址：

```text
前端: http://localhost:3000
后端: http://localhost:8088
API 文档: http://localhost:8088/docs
```

也可以分别启动：

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8088
```

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 43131
```

## 测试与构建

后端重点测试：

```bash
cd backend
python -m unittest tests.test_security_defaults tests.test_rollback_manager tests.test_deploy_plan tests.test_deployment_tasks tests.test_confirmation tests.test_compose_preflight tests.test_app_registry tests.test_app_files tests.test_deploy_result
```

前端构建：

```bash
cd frontend
npm run build
```

当前前端可能出现大 chunk 警告，这是已知构建提示，不代表构建失败。

## 端到端样例

仓库内置一个最小 Nginx Compose 样例：

```text
examples/nginx-demo/
```

你可以把这个目录里的 compose 内容交给 AI 助手，按完整流程测试：

1. 解析 Compose。
2. 展示部署计划。
3. 确认危险操作。
4. 创建部署前快照。
5. 写入 compose/env。
6. 启动 Nginx。
7. 在「我的应用」中查看访问地址、日志和快照。

默认访问地址：

```text
http://localhost:18080
```

## 项目结构

```text
DockerAgent/
├── backend/
│   ├── app/
│   │   ├── api/        # REST / WebSocket API
│   │   ├── core/       # Agent、部署计划、回滚、Docker、LLM、WebFetch
│   │   ├── db/         # SQLite / SQLAlchemy 模型
│   │   ├── mcp/        # Docker 工具定义
│   │   └── models/     # Pydantic schema
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/      # 工作台、安装应用、我的应用、回滚、设置等页面
│       ├── hooks/      # Docker / Agent hooks
│       └── lib/        # API 客户端和状态工具
├── examples/
│   └── nginx-demo/
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── AGENTS.md
```

## License

MIT
