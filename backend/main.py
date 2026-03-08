import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.db.database import init_db
from app.api import docker, agent, deploy, rollback, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # 从数据库加载活跃的 LLM 提供商配置，覆盖环境变量默认值
    await _load_active_provider()
    yield


async def _load_active_provider():
    """启动时从 DB 读取激活的 provider，热重载 llm_client。"""
    try:
        from sqlalchemy import select
        from app.db.database import AsyncSessionLocal, LLMProvider
        from app.api.settings import init_providers, _reload_llm_client
        async with AsyncSessionLocal() as db:
            await init_providers(db)
            result = await db.execute(
                select(LLMProvider).where(LLMProvider.is_active == True)
            )
            active = result.scalar_one_or_none()
            if active:
                _reload_llm_client(active)
    except Exception as e:
        print(f"[warn] 启动时加载 LLM 提供商失败，使用环境变量默认值: {e}")


app = FastAPI(
    title="DockerAgent API",
    description="AI 驱动的 Docker 管理平台",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# ALLOWED_ORIGINS: 逗号分隔的允许来源列表，留空则默认为 ["*"]（仅限本地/内网部署）
# 示例: ALLOWED_ORIGINS=https://myserver.com,https://www.myserver.com
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
_allow_origins: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]
# 规范要求：allow_credentials=True 时不能使用通配符 "*"
_allow_credentials: bool = "*" not in _allow_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API 鉴权中间件 ──────────────────────────────────────────────────────────────
# ACCESS_TOKEN: 设置后，所有 /api/* 请求均需携带该 Token
# HTTP：Authorization: Bearer <token>  或  X-API-Key: <token>
# WebSocket 握手：?token=<token> 查询参数（在中间件层统一校验）
# 留空则跳过鉴权（向后兼容，仅推荐纯内网环境）
_ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "").strip()

_AUTH_SKIP_PATHS = {"/api/health"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not _ACCESS_TOKEN:
        return await call_next(request)

    path = request.url.path

    # 非 API 路径（前端静态文件等）直接放行
    if not path.startswith("/api"):
        return await call_next(request)

    # 白名单路径放行
    if path in _AUTH_SKIP_PATHS:
        return await call_next(request)

    # WebSocket 握手：从查询参数 ?token= 提取并校验，拒绝时返回 403
    if request.headers.get("upgrade", "").lower() == "websocket":
        ws_token = request.query_params.get("token", "")
        if ws_token != _ACCESS_TOKEN:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "未授权：WebSocket 握手缺少有效的 token 参数"},
            )
        return await call_next(request)

    # HTTP 请求：从 Authorization Bearer 或 X-API-Key 提取 token
    token = ""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.headers.get("X-API-Key", "").strip()

    if token != _ACCESS_TOKEN:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "未授权：请在请求头中提供有效的 Access Token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await call_next(request)


app.include_router(docker.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(deploy.router, prefix="/api")
app.include_router(rollback.router, prefix="/api")
app.include_router(settings.router, prefix="/api")

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "DockerAgent"}


# ── 前端静态文件（生产环境，必须在所有 API 路由之后注册）──────────
_here = os.path.dirname(os.path.abspath(__file__))
_static = os.environ.get("STATIC_DIR") or os.path.join(_here, "frontend", "dist")

if os.path.exists(_static):
    # 把 /assets/* 单独挂载（Vite 构建的 JS/CSS 带 hash，走这里）
    _assets_dir = os.path.join(_static, "assets")
    if os.path.exists(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    # Catch-all：SPA 路由兜底，所有非 API 路径都返回 index.html
    # 若路径对应一个真实文件（favicon.ico 等），直接返回该文件
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # 实际文件优先（favicon.ico / 其他根目录静态资源）
        candidate = os.path.join(_static, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        # 其余一律返回 index.html，由 React Router 处理
        return FileResponse(os.path.join(_static, "index.html"))
