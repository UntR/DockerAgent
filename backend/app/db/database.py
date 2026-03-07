import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean, Float
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH", "/data/docker_agent.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), index=True, nullable=False)
    role = Column(String(16), nullable=False)  # user / assistant / tool
    content = Column(Text, nullable=False)
    tool_calls = Column(JSON, nullable=True)
    tool_call_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Memory(Base):
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(256), unique=True, index=True)
    value = Column(Text, nullable=False)
    category = Column(String(64), default="general")
    importance = Column(Float, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Reflection(Base):
    __tablename__ = "reflections"

    id = Column(Integer, primary_key=True, index=True)
    summary = Column(Text, nullable=False)
    session_ids = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    containers = Column(JSON, nullable=False)
    networks = Column(JSON, nullable=False)
    volumes = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_auto = Column(Boolean, default=True)


class LLMProvider(Base):
    """自定义及内置 LLM 提供商配置。"""
    __tablename__ = "llm_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)          # 显示名称，如 "我的 Claude"
    provider_type = Column(String(32), nullable=False)  # anthropic / openai / custom
    base_url = Column(String(512), nullable=True)       # 自定义时必填
    api_key = Column(Text, nullable=False)
    model = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=False)          # 当前激活的提供商
    is_builtin = Column(Boolean, default=False)         # 是否内置（不可删除）
    extra = Column(JSON, nullable=True)                 # 额外参数（如 temperature 等）
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
