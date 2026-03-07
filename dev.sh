#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  DockerAgent 本地一键启动脚本
#  用法: bash dev.sh
#  退出: Ctrl+C
# ─────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$ROOT/.venv"
LOG_DIR="$ROOT/.dev-logs"
PID_FILE="$ROOT/.dev.pids"
ENV_FILE="$ROOT/.env"
DATA_DIR="$ROOT/.dev-data"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${CYAN}[DockerAgent]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*" >&2; }
sep()  { echo -e "${CYAN}────────────────────────────────────────${NC}"; }
die()  { err "$*"; exit 1; }

# ── 清理函数 ──────────────────────────────────────────────────
cleanup() {
  echo ""
  warn "正在停止所有服务..."
  if [[ -f "$PID_FILE" ]]; then
    while IFS= read -r pid; do
      kill -0 "$pid" 2>/dev/null && kill "$pid" 2>/dev/null || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  ok "已停止。再见！"
}
trap cleanup EXIT INT TERM

# ── 打印标题 ──────────────────────────────────────────────────
sep
echo -e "${BOLD}    DockerAgent — 本地开发启动${NC}"
sep
echo ""

# ── 检查前置条件 ──────────────────────────────────────────────
log "检查运行环境..."

command -v python3 &>/dev/null || die "未找到 python3，请先安装 Python 3.10+"
PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
ok "Python $PYTHON_VER"

command -v node &>/dev/null    || die "未找到 node，请先安装 Node.js 18+"
ok "Node $(node --version)"

command -v npm &>/dev/null     || die "未找到 npm"
ok "npm $(npm --version)"

command -v docker &>/dev/null  || die "未找到 docker"
docker info &>/dev/null        || die "Docker daemon 未运行，请先启动 Docker"
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ── .env 配置 ─────────────────────────────────────────────────
echo ""
sep
log "检查环境变量配置..."

if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env 文件不存在，从模板创建..."
  cp "$ROOT/.env.example" "$ENV_FILE"
  echo ""
  echo -e "${YELLOW}  ⚠  请编辑 .env 填入 LLM API Key：${NC}"
  echo -e "     ${BOLD}$ENV_FILE${NC}"
  echo ""
  read -rp "  现在用 nano 打开编辑? [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    nano "$ENV_FILE"
  fi
fi

# 加载 .env（跳过注释行和空行）
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  export "$line" 2>/dev/null || true
done < "$ENV_FILE"

if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
  warn "未设置 LLM API Key，AI 对话功能不可用（Docker 管理面板可正常使用）"
else
  ok "LLM API Key 已配置（Provider: ${LLM_PROVIDER:-anthropic}）"
fi

# ── Python 虚拟环境 ────────────────────────────────────────────
echo ""
sep
log "准备 Python 虚拟环境..."

# 优先尝试 uv（极快），其次 python3 -m venv，再用 --user 模式
USE_UV=false
USE_VENV=false

if command -v uv &>/dev/null; then
  USE_UV=true
elif python3 -m venv "$VENV" --without-pip 2>/dev/null; then
  # 能创建 venv（有 python3-venv）
  rm -rf "$VENV"
  USE_VENV=true
fi

if [[ "$USE_UV" == "true" ]]; then
  if [[ ! -d "$VENV" ]]; then
    log "使用 uv 创建虚拟环境..."
    uv venv "$VENV" --python python3 --quiet
    ok "虚拟环境已创建（uv）"
  else
    ok "虚拟环境已存在"
  fi
  VENV_PY="$VENV/bin/python"
  VENV_PIP="uv pip"
  VENV_PIP_INSTALL() { uv pip install --python "$VENV_PY" "$@"; }

elif [[ "$USE_VENV" == "true" ]]; then
  if [[ ! -d "$VENV" ]]; then
    log "创建 Python venv..."
    python3 -m venv "$VENV"
    ok "虚拟环境已创建（venv）"
  else
    ok "虚拟环境已存在"
  fi
  VENV_PY="$VENV/bin/python"
  VENV_PIP_INSTALL() { "$VENV/bin/pip" install --quiet "$@"; }

else
  # fallback：直接安装到用户目录
  warn "无法创建虚拟环境（缺少 python3-venv），使用 --user 模式安装"
  VENV_PY="python3"
  VENV_PIP_INSTALL() { pip3 install --user --break-system-packages --quiet "$@" 2>/dev/null || pip3 install --user --quiet "$@"; }
fi

# ── 安装后端依赖 ───────────────────────────────────────────────
log "检查 Python 依赖..."

# 检查关键包是否已安装
need_install() {
  "$VENV_PY" -c "
import importlib, sys
pkgs = ['fastapi','uvicorn','sqlalchemy','aiosqlite','docker','anthropic','aiohttp','bs4','aiofiles','multipart','yaml','pydantic']
missing = []
for p in pkgs:
    try: importlib.import_module(p)
    except ImportError: missing.append(p)
if missing:
    sys.exit(1)
" 2>/dev/null
}

if ! need_install; then
  log "安装后端依赖（首次约 1~2 分钟）..."
  VENV_PIP_INSTALL -r "$BACKEND/requirements.txt"
  ok "后端依赖安装完成"
else
  ok "后端依赖已就绪"
fi

# 最终验证
"$VENV_PY" -c "import fastapi, uvicorn, sqlalchemy, aiosqlite, docker, aiohttp, bs4" \
  || die "依赖验证失败，请手动运行: pip3 install -r backend/requirements.txt"
ok "Python 环境验证通过"

# ── 安装前端依赖 ───────────────────────────────────────────────
echo ""
sep
log "检查前端依赖..."

if [[ ! -d "$FRONTEND/node_modules" ]]; then
  log "首次运行，安装 npm 依赖（约 1~2 分钟）..."
  (cd "$FRONTEND" && npm install 2>&1) | grep -E "^added|warn|ERR" | head -5 || true
  [[ -d "$FRONTEND/node_modules" ]] || die "npm install 失败，请检查网络"
  ok "前端依赖安装完成"
else
  ok "前端依赖已就绪"
fi

# ── 释放端口 ──────────────────────────────────────────────────
echo ""
sep
log "检查端口占用..."

free_port() {
  local port=$1
  local pid
  pid=$(lsof -ti :"$port" 2>/dev/null || fuser "$port/tcp" 2>/dev/null | awk '{print $1}' || true)
  if [[ -n "$pid" ]]; then
    warn "端口 $port 被占用 (PID: $pid)，正在释放..."
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
    ok "端口 $port 已释放"
  else
    ok "端口 $port 空闲"
  fi
}

free_port 8088
free_port 3000

# ── 准备目录和启动 ─────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$DATA_DIR"
rm -f "$PID_FILE"

# ── 启动后端 ───────────────────────────────────────────────────
echo ""
sep
BACKEND_PORT="${BACKEND_PORT:-8088}"
log "启动后端服务 (FastAPI :${BACKEND_PORT})..."

(
  cd "$BACKEND"
  export DB_PATH="$DATA_DIR/docker_agent.db"
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
  export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  export LLM_PROVIDER="${LLM_PROVIDER:-anthropic}"
  export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-3-5-sonnet-20241022}"
  export OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o}"
  export GITHUB_TOKEN="${GITHUB_TOKEN:-}"
  "$VENV_PY" -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "$BACKEND_PORT" \
    --reload \
    --log-level warning
) >> "$LOG_DIR/backend.log" 2>&1 &

BACKEND_PID=$!
echo "$BACKEND_PID" >> "$PID_FILE"

printf "  等待后端启动 "
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${BACKEND_PORT}/api/health" &>/dev/null; then
    echo " 就绪"
    ok "后端已启动 → http://localhost:${BACKEND_PORT}"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ""
    err "后端进程退出！日志如下："; echo "──────────"
    tail -25 "$LOG_DIR/backend.log"; echo "──────────"
    die "后端启动失败"
  fi
  printf "."
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo ""
    err "后端启动超时（30s）！日志如下："; echo "──────────"
    tail -25 "$LOG_DIR/backend.log"; echo "──────────"
    die "启动超时"
  fi
done

# ── 启动前端 ───────────────────────────────────────────────────
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
log "启动前端服务 (Vite :${FRONTEND_PORT})..."

(cd "$FRONTEND" && BACKEND_PORT="$BACKEND_PORT" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT") \
  >> "$LOG_DIR/frontend.log" 2>&1 &

FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"

printf "  等待前端启动 "
for i in $(seq 1 60); do
  if curl -sf "http://localhost:${FRONTEND_PORT}" &>/dev/null; then
    echo " 就绪"
    ok "前端已启动 → http://localhost:${FRONTEND_PORT}"
    break
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo ""
    err "前端进程退出！日志如下："; echo "──────────"
    tail -25 "$LOG_DIR/frontend.log"; echo "──────────"
    die "前端启动失败"
  fi
  printf "."
  sleep 1
  if [[ $i -eq 60 ]]; then
    echo " (超时，继续等待...)"
    warn "前端可能仍在编译，请稍后访问 http://localhost:${FRONTEND_PORT}"
    break
  fi
done

# ── 全部就绪 ───────────────────────────────────────────────────
echo ""
sep
echo -e "${GREEN}${BOLD}  🚀 DockerAgent 已成功启动！${NC}"
sep
echo ""
echo -e "  ${BOLD}前端界面${NC}   →  ${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "  ${BOLD}后端 API${NC}   →  ${CYAN}http://localhost:${BACKEND_PORT}${NC}"
echo -e "  ${BOLD}API 文档${NC}   →  ${CYAN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo ""
echo -e "  ${BOLD}日志${NC}"
echo -e "    后端  →  ${LOG_DIR}/backend.log"
echo -e "    前端  →  ${LOG_DIR}/frontend.log"
echo ""
echo -e "  ${BOLD}数据${NC}       →  ${DATA_DIR}/docker_agent.db"
echo ""
echo -e "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
sep
echo ""

# ── 持续输出后端日志 ─────────────────────────────────────────
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" 2>/dev/null
