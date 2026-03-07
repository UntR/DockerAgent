import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(docker.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(deploy.router, prefix="/api")
app.include_router(rollback.router, prefix="/api")
app.include_router(settings.router, prefix="/api")

# 前端静态文件（生产环境）
# 优先查相对路径（容器内 /app/frontend/dist），其次用环境变量覆盖
_here = os.path.dirname(os.path.abspath(__file__))
_static = os.environ.get("STATIC_DIR") or os.path.join(_here, "frontend", "dist")
if os.path.exists(_static):
    app.mount("/", StaticFiles(directory=_static, html=True), name="frontend")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "DockerAgent"}
