# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

---

## [0.1.0] - 2026-03-08

首个正式发布版本。

### Added

- **AI 对话助手**：多会话管理、流式输出、思考过程展示、Markdown 渲染
- **可视化仪表盘**：容器按 Compose 项目分组、实时 CPU / 内存 / 磁盘监控、一键打开 Web 端口
- **智能部署向导**：给 GitHub URL 自动分析 README 和 `.env.example`，引导填写配置后一键部署
- **依赖感知**：自动识别 Ollama ↔ Open WebUI 等应用联动关系，部署时处理共享网络
- **一键回滚**：每次部署前自动打快照，支持回滚到任意历史状态
- **记忆系统**：记住用户偏好和常用配置，会话历史持久保存
- **LLM 自由切换**：界面内管理多个 Provider（Claude / DeepSeek / MiniMax / Kimi / 任意 OpenAI 兼容接口），热切换无需重启
- **Docker Compose 部署**：单容器多阶段构建，GitHub Actions 自动发布镜像到 Docker Hub

### Security

- **CORS 加固**：新增 `ALLOWED_ORIGINS` 环境变量，替代全局 `allow_origins=["*"]`；`allow_credentials` 与通配符自动互斥
- **API 鉴权中间件**：新增 `ACCESS_TOKEN` 环境变量，启用后所有 `/api/*` 请求（含 WebSocket 握手）统一在中间件层校验
- **README 安全警告**：顶部增加 Docker socket 权限风险的醒目提示

### Fixed

- 修复生产环境 SPA 路由 404 问题
- Docker socket 自动探测 + 连接失败时的友好提示
- 修复 Docker API 返回 `null` 时 `NoneType.keys()` 导致的 500 / 刷新失败
- 修复 `docker_manager.py` 括号不匹配导致的 `SyntaxError` 启动崩溃
- 修复 CI workflow `dockerfile` → `file` 参数名不匹配的 warning
- **DoOD 卷映射失效**：新增 `/opt/docker-projects` 一比一宿主机映射，修复相对路径 volume 挂载为空目录的关键 Bug

### Improved

- **消除硬编码路径**：新增 `PROJECTS_BASE_DIR` 环境变量，NAS 等无 `/opt` 的环境可自定义路径
- **部署超时可配置**：拆分 `docker compose pull` 和 `up` 为独立阶段，分别由 `COMPOSE_PULL_TIMEOUT`（默认不限时）和 `COMPOSE_UP_TIMEOUT`（默认 120s）控制
- **`.env` 写入安全**：强制类型转换 + 特殊字符（空格、引号、换行等）自动引号包裹转义
- **PUID/PGID 支持**：写入宿主机的文件自动 `chown` 为指定用户，符合自托管容器规范
- `docker-compose.yml` 卷映射参数化，支持通过环境变量灵活配置
