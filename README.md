# DockerAgent

> 用自然语言管理你的 Docker。不需要记命令，不需要查文档，直接说话就行。

这是我的第一个 Vibe Coding 项目。

老实说，在这之前我对 Vibe Coding 的了解仅限于"知道它存在"。但 LLM 进化到今天这个程度，让我觉得可以试着把一个真实的想法从零做出来——一个能帮我（和像我一样的人）真正用起来 Docker 的 AI 助手。从架构设计到每一行代码，全程和 Claude 一起完成。做出来之后我自己也在用，它确实帮我省了很多事。

感谢 Claude，感谢MiniMax，感谢DeepSeek，感谢Gemini。感谢所有在推动 LLM 进步的人。这个时代真的很特别。

---

## 它能做什么

你可以直接对它说：

- "帮我看看哪些容器在跑，有没有异常的"
- "把这个 GitHub 项目给我部署起来：https://github.com/xxx/xxx"
- "Dify 一直在 restart，帮我看看日志"
- "我想部署 Open WebUI，它需要连到我已有的 Ollama"
- "清理一下没用的镜像，空间不够了"

它会分析、执行、反馈，遇到需要你决定的事情会先问你，而不是直接动手。

---

## 功能

| | |
|---|---|
| 🖥️ **可视化仪表盘** | 容器按 Compose 项目分组展示，实时 CPU / 内存 / 磁盘监控，一键打开 Web 端口 |
| 🤖 **AI 对话助手** | 多会话管理，流式输出，展示思考过程和工具调用，Markdown 渲染，选项可点击 |
| 📦 **智能部署向导** | 给一个 GitHub URL，论坛，分享，甚至是一个功能描述，AI 自动读取 README 和 .env.example，引导你填完必要配置再部署 |
| 🔗 **依赖感知** | 知道 Ollama 和 Open WebUI 需要共享网络，部署时自动处理这类联动关系 |
| ↩️ **一键回滚** | 每次部署前自动打快照，出问题可以回到部署前的状态，数据卷是否保留你说了算 |
| 🧠 **记忆** | 记住你的偏好和常用配置，会话历史持久保存，越用越顺手 |
| ⚙️ **LLM 自由切换** | 界面里直接管理 API Key，支持 Claude / DeepSeek / MiniMax / Kimi / 任意 OpenAI 兼容接口 |

---

## 一键启动

**前提：机器上装了 Docker。**

```bash
docker run -d \
  --name docker-agent \
  -p 3000:8088 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v docker-agent-data:/data \
  -e ANTHROPIC_API_KEY=your_key_here \
  rcpn7/docker-agent:latest
```

然后打开 [http://localhost:3000](http://localhost:3000)。

> 没有 Anthropic key？支持 DeepSeek、MiniMax、Kimi 等任何 OpenAI 兼容接口。启动后在**设置页面**配置即可，无需重启。

### 用 Docker Compose（推荐，方便管理配置）

```bash
# 下载配置文件
curl -O https://raw.githubusercontent.com/UntR/DockerAgent/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/UntR/DockerAgent/main/.env.example

# 填入你的 API Key
cp .env.example .env
nano .env  # 或者用你喜欢的编辑器

# 启动
docker compose up -d
```

---

## 本地开发

```bash
git clone https://github.com/UntR/DockerAgent.git
cd DockerAgent

cp .env.example .env
# 编辑 .env 填入 API Key

bash dev.sh
# 自动安装依赖，启动前后端
# 前端: http://localhost:3000
# 后端 API 文档: http://localhost:8088/docs
```

环境要求：Python 3.10+、Node.js 18+、Docker

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API Key（与 OpenAI 二选一）|
| `OPENAI_API_KEY` | OpenAI 或兼容接口的 Key |
| `OPENAI_BASE_URL` | 自定义接口地址，如 `https://api.deepseek.com/v1` |
| `LLM_PROVIDER` | 默认提供商：`anthropic` / `openai`（也可在界面切换）|
| `GITHUB_TOKEN` | 可选，提高从 GitHub 抓取文件的速率限制 |

启动后也可以在**设置页面**直接管理，支持添加多个 Provider 并热切换，不用改配置文件。

---

## 技术栈

| | |
|---|---|
| 前端 | React · TypeScript · Vite · TailwindCSS · Framer Motion · Recharts |
| 后端 | Python · FastAPI · WebSocket · SQLAlchemy · SQLite |
| AI | 支持 Anthropic Claude 和任意 OpenAI 兼容接口 |
| Docker | Python docker SDK，通过挂载 socket 直接控制宿主机 |
| 部署 | 单容器多阶段构建，GitHub Actions 自动发布镜像 |

---

## 如果大家没有api，可以点这里注册，我也能收点代金卷嘿嘿


**[硅基流动 SiliconFlow](https://cloud.siliconflow.cn/i/lRKL1QBS)** — DeepSeek、Qwen、GLM 等主流开源模型，注册送 2000 万 Tokens，性价比很高，新用户可以直接免费跑起来。

**[MiniMax](https://platform.minimaxi.com/subscribe/coding-plan?code=4xo0BLjAak&source=link)** — 国内自研大模型，有专门面向开发者的套餐，响应速度快，适合做工具类应用。

在本项目设置页面填入对应的 Base URL 和 API Key 即可直接使用。

---

## 项目结构

```
DockerAgent/
├── backend/
│   ├── app/
│   │   ├── api/        # REST + WebSocket 接口
│   │   ├── core/       # Agent 引擎、LLM 客户端、Webfetch、记忆系统
│   │   ├── db/         # 数据库模型
│   │   └── mcp/        # Docker 工具定义
│   └── main.py
├── frontend/
│   └── src/
│       ├── pages/      # Dashboard、Chat、Settings 等页面
│       ├── hooks/      # WebSocket 通信、Docker 数据
│       └── lib/        # 状态管理、API 客户端
├── Dockerfile          # 多阶段构建（前端 + 后端合一）
├── docker-compose.yml
├── .env.example
└── dev.sh              # 本地一键启动脚本
```

---

## License

MIT — 随便用，随便改，做了好东西记得分享。
