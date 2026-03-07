"""
设置管理 API：LLM 提供商配置、API Key 管理、连通性测试、模型列表拉取。
"""
import os
import json
import httpx
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db, LLMProvider

router = APIRouter(prefix="/settings", tags=["settings"])

# ── Pydantic 模型 ──────────────────────────────────────────────

class ProviderCreate(BaseModel):
    name: str
    provider_type: str          # anthropic / openai / custom
    base_url: Optional[str] = None
    api_key: str
    model: str
    extra: Optional[Dict[str, Any]] = None


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


class TestRequest(BaseModel):
    provider_type: str
    base_url: Optional[str] = None
    api_key: str
    model: str


class FetchModelsRequest(BaseModel):
    provider_type: str
    base_url: Optional[str] = None
    api_key: str


# ── 内置提供商默认配置 ──────────────────────────────────────────

BUILTIN_BASE_URLS: Dict[str, str] = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com/v1",
}

BUILTIN_MODELS: Dict[str, List[str]] = {
    "anthropic": [
        "claude-opus-4-5",
        "claude-sonnet-4-5",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
        "o1-preview",
        "o1-mini",
    ],
}

# 不支持标准 /models 接口的提供商，按域名匹配内置模型列表
DOMAIN_BUILTIN_MODELS: Dict[str, List[str]] = {
    "minimax.chat": [
        "MiniMax-Text-01",
        "MiniMax-M1",
        "abab6.5s-chat",
        "abab6.5g-chat",
        "abab5.5s-chat",
        "abab5.5-chat",
    ],
    "moonshot.cn": [
        "moonshot-v1-8k",
        "moonshot-v1-32k",
        "moonshot-v1-128k",
    ],
    "bigmodel.cn": [
        "glm-4",
        "glm-4-plus",
        "glm-4-flash",
        "glm-4-air",
        "glm-4-long",
        "glm-4-airx",
        "glm-zero-preview",
    ],
}

# ── 初始化（启动时从 env 导入内置配置） ────────────────────────

async def init_providers(db: AsyncSession) -> None:
    """首次启动时，将环境变量里的 API Key 作为默认提供商写入数据库。"""
    result = await db.execute(select(LLMProvider))
    if result.scalars().first():
        return  # 已有配置，跳过

    # 从环境变量读取
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    active_provider = os.environ.get("LLM_PROVIDER", "anthropic")

    providers_to_add = []

    if anthropic_key and not anthropic_key.startswith("sk-ant-xxx"):
        providers_to_add.append(LLMProvider(
            name="Claude (Anthropic)",
            provider_type="anthropic",
            base_url=BUILTIN_BASE_URLS["anthropic"],
            api_key=anthropic_key,
            model=os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
            is_active=(active_provider == "anthropic"),
            is_builtin=True,
        ))

    if openai_key and not openai_key.startswith("sk-xxx"):
        providers_to_add.append(LLMProvider(
            name="OpenAI",
            provider_type="openai",
            base_url=BUILTIN_BASE_URLS["openai"],
            api_key=openai_key,
            model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
            is_active=(active_provider == "openai" and not anthropic_key),
            is_builtin=True,
        ))

    # 如果没有任何配置，创建空占位符
    if not providers_to_add:
        providers_to_add.append(LLMProvider(
            name="Claude (Anthropic)",
            provider_type="anthropic",
            base_url=BUILTIN_BASE_URLS["anthropic"],
            api_key="",
            model="claude-3-5-sonnet-20241022",
            is_active=True,
            is_builtin=True,
        ))

    # 确保只有一个 active
    if providers_to_add:
        has_active = any(p.is_active for p in providers_to_add)
        if not has_active:
            providers_to_add[0].is_active = True

    for p in providers_to_add:
        db.add(p)
    await db.commit()


def _mask_key(key: str) -> str:
    """隐藏 API Key 中间部分。"""
    if not key or len(key) < 8:
        return "••••••••"
    return key[:6] + "••••••••" + key[-4:]


def _provider_to_dict(p: LLMProvider, show_key: bool = False) -> Dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "provider_type": p.provider_type,
        "base_url": p.base_url or "",
        "api_key_masked": _mask_key(p.api_key),
        "api_key": p.api_key if show_key else "",
        "model": p.model,
        "is_active": p.is_active,
        "is_builtin": p.is_builtin,
        "extra": p.extra or {},
        "created_at": p.created_at.isoformat() if p.created_at else "",
    }


# ── 接口 ──────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers(db: AsyncSession = Depends(get_db)):
    """列出所有提供商（API Key 脱敏）。"""
    await init_providers(db)
    result = await db.execute(select(LLMProvider).order_by(LLMProvider.id))
    rows = result.scalars().all()
    return [_provider_to_dict(p) for p in rows]


@router.get("/providers/active")
async def get_active_provider(db: AsyncSession = Depends(get_db)):
    """获取当前激活的提供商（含完整 API Key，供 llm_client 使用）。"""
    await init_providers(db)
    result = await db.execute(
        select(LLMProvider).where(LLMProvider.is_active == True)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="无激活的 LLM 提供商")
    return _provider_to_dict(p, show_key=True)


@router.post("/providers")
async def create_provider(req: ProviderCreate, db: AsyncSession = Depends(get_db)):
    """新增自定义提供商。"""
    # 校验 custom 类型必须有 base_url
    if req.provider_type == "custom" and not req.base_url:
        raise HTTPException(status_code=400, detail="自定义提供商必须填写 Base URL")

    p = LLMProvider(
        name=req.name,
        provider_type=req.provider_type,
        base_url=req.base_url or BUILTIN_BASE_URLS.get(req.provider_type, ""),
        api_key=req.api_key,
        model=req.model,
        is_active=False,
        is_builtin=False,
        extra=req.extra,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _provider_to_dict(p)


@router.put("/providers/{provider_id}")
async def update_provider(
    provider_id: int,
    req: ProviderUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新提供商配置。"""
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="提供商不存在")

    if req.name is not None:
        p.name = req.name
    if req.base_url is not None:
        p.base_url = req.base_url
    if req.api_key is not None and req.api_key and not req.api_key.startswith("••"):
        p.api_key = req.api_key
    if req.model is not None:
        p.model = req.model
    if req.extra is not None:
        p.extra = req.extra
    p.updated_at = datetime.now(timezone.utc)

    await db.commit()
    return _provider_to_dict(p)


@router.post("/providers/{provider_id}/activate")
async def activate_provider(provider_id: int, db: AsyncSession = Depends(get_db)):
    """将某个提供商设为激活状态（同时关闭其他的）。"""
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="提供商不存在")
    if not p.api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key 再激活")

    # 先全部取消激活
    await db.execute(update(LLMProvider).values(is_active=False))
    # 激活指定的
    p.is_active = True
    await db.commit()

    # 同步更新运行时的 llm_client
    _reload_llm_client(p)

    return {"success": True, "message": f"已切换到 {p.name}"}


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: int, db: AsyncSession = Depends(get_db)):
    """删除自定义提供商（内置的不可删除）。"""
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="提供商不存在")
    if p.is_builtin:
        raise HTTPException(status_code=400, detail="内置提供商不可删除，可以修改其配置")
    if p.is_active:
        raise HTTPException(status_code=400, detail="请先切换到其他提供商再删除")

    await db.delete(p)
    await db.commit()
    return {"success": True}


@router.post("/test")
async def test_connection(req: TestRequest, db: AsyncSession = Depends(get_db)):
    """测试 LLM 提供商连通性（发送一条极短的测试消息）。"""
    try:
        api_key = req.api_key
        base_url = req.base_url
        model = req.model

        # 特殊标记：使用已保存的 provider 配置
        if api_key.startswith("__use_saved__"):
            provider_id = int(api_key.replace("__use_saved__", ""))
            result_db = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
            p = result_db.scalar_one_or_none()
            if not p:
                return {"success": False, "message": "提供商不存在"}
            api_key = p.api_key
            base_url = base_url or p.base_url
            model = model or p.model

        result = await _do_test(req.provider_type, base_url, api_key, model)
        return {"success": True, "message": result}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.post("/models")
async def fetch_models(req: FetchModelsRequest, db: AsyncSession = Depends(get_db)):
    """拉取指定提供商的可用模型列表。"""
    try:
        api_key = req.api_key
        base_url = req.base_url

        # 特殊标记：使用已保存的 key
        if api_key.startswith("__use_saved__"):
            provider_id = int(api_key.replace("__use_saved__", ""))
            result_db = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
            p = result_db.scalar_one_or_none()
            if p:
                api_key = p.api_key
                base_url = base_url or p.base_url

        models = await _fetch_model_list(req.provider_type, base_url, api_key)
        return {"success": True, "models": models}
    except Exception as e:
        fallback = BUILTIN_MODELS.get(req.provider_type, [])
        return {
            "success": False,
            "models": fallback,
            "message": f"拉取失败，使用内置列表：{str(e)}",
        }


# ── 内部工具函数 ───────────────────────────────────────────────

def _get_base_url(provider_type: str, base_url: Optional[str]) -> str:
    if base_url and base_url.strip():
        return base_url.rstrip("/")
    return BUILTIN_BASE_URLS.get(provider_type, "").rstrip("/")


async def _do_test(
    provider_type: str,
    base_url: Optional[str],
    api_key: str,
    model: str,
) -> str:
    """实际发送测试请求。"""
    url_base = _get_base_url(provider_type, base_url)

    if provider_type == "anthropic":
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{url_base}/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "hi"}],
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            text = data.get("content", [{}])[0].get("text", "ok")
            return f"连接成功！模型回复：{text[:50]}"
        else:
            error = resp.json().get("error", {}).get("message", resp.text[:200])
            raise Exception(f"HTTP {resp.status_code}: {error}")

    elif provider_type in ("openai", "custom"):
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{url_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "hi"}],
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            return f"连接成功！模型回复：{text[:50]}"
        else:
            try:
                error = resp.json().get("error", {}).get("message", resp.text[:200])
            except Exception:
                error = resp.text[:200]
            raise Exception(f"HTTP {resp.status_code}: {error}")
    else:
        raise Exception(f"不支持的 provider_type: {provider_type}")


def _get_domain_builtin_models(base_url: Optional[str]) -> Optional[List[str]]:
    """根据 base_url 的域名，查找内置模型列表（用于不支持 /models 接口的提供商）。"""
    if not base_url:
        return None
    for domain, models in DOMAIN_BUILTIN_MODELS.items():
        if domain in base_url:
            return models
    return None


async def _fetch_model_list(
    provider_type: str,
    base_url: Optional[str],
    api_key: str,
) -> List[str]:
    """从 API 拉取模型列表。若提供商不支持标准 /models 接口，回退至内置列表。"""
    url_base = _get_base_url(provider_type, base_url)

    if provider_type == "anthropic":
        return BUILTIN_MODELS["anthropic"]

    elif provider_type in ("openai", "custom"):
        # 先检查是否属于已知不支持 /models 的提供商（按域名）
        domain_models = _get_domain_builtin_models(url_base)
        if domain_models is not None:
            return domain_models

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{url_base}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if resp.status_code == 200:
            data = resp.json()
            # 兼容 {data: [{id: ...}]} 和 {models: [...]} 两种格式
            raw = data.get("data") or data.get("models") or []
            if raw and isinstance(raw[0], str):
                models = raw  # 直接是字符串列表
            else:
                models = [m["id"] for m in raw if isinstance(m, dict) and "id" in m]
            models.sort(key=lambda x: (
                0 if x.startswith("gpt") else
                1 if x.startswith("claude") else
                2 if "instruct" in x else 3
            ))
            return models[:50] if models else []
        elif resp.status_code == 404:
            # 服务端不支持 /models 端点
            raise Exception(f"该提供商不支持模型列表接口（404），请手动输入模型名称")
        else:
            raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")
    else:
        raise Exception(f"不支持的 provider_type: {provider_type}")


def _reload_llm_client(p: LLMProvider) -> None:
    """热重载 llm_client 的配置（切换激活提供商后调用）。"""
    try:
        from app.core.llm_client import llm_client
        llm_client.reload(
            provider_type=p.provider_type,
            api_key=p.api_key,
            model=p.model,
            base_url=p.base_url or None,
        )
    except Exception:
        pass  # 热重载失败不影响已有功能，重启后生效
