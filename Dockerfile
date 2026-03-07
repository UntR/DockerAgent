# ── Stage 1: 构建前端 ──────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
RUN npm run build

# ── Stage 2: 生产镜像（Python + 前端静态文件）─────────────────
FROM python:3.11-slim
WORKDIR /app

# 安装 Python 依赖
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝后端代码
COPY backend/ .

# 把前端构建产物放到 backend 期望的位置
COPY --from=frontend-build /frontend/dist ./frontend/dist

EXPOSE 8088

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088"]
