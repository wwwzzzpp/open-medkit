<div align="center">

[English](./README.en.md) | 中文

# Open MedKit

**对着药箱说句话，剩下的交给 AI。**

家庭药箱管理工具 — 自然语言录入 · AI 结构化解析 · 过期自动提醒 · MCP Agent 接入

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](./DEPLOY.md)
[![MCP](https://img.shields.io/badge/MCP-server-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0xMiAyYTMgMyAwIDAgMC0zIDN2NGEzIDMgMCAwIDAgNiAwVjVhMyAzIDAgMCAwLTMtMyIvPjxwYXRoIGQ9Ik0xMiAxNHY4Ii8+PHBhdGggZD0iTTYgMTJhNiA2IDAgMCAwIDEyIDAiLz48L3N2Zz4=)](./MCP.md)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)]()

</div>

---

<div align="center">

![AI 检索页面](.docs/screenshot/chat-page.png)

</div>

### 为什么选择 Open MedKit

家里的药总是找不到、忘了过期、想不起来有没有。

Open MedKit 让你用**一句话**把药品录入药箱，用**一句话**从药箱里找药。没有复杂的表单，没有手动归类 —— AI 搞定一切，你只管说。

不想打开浏览器？Open MedKit 同时提供 [MCP Server](./MCP.md)，可以直接在 **Claude Code**、**Cursor**、**Claude Desktop**、**OpenClaw** 等 AI 客户端中通过自然语言管理药箱 —— 在终端里说一句「帮我加个布洛芬」，药品就入库了。

### 功能亮点

| | |
|:---|:---|
| **说一句话就入库** | 自然语言描述药品 → AI 提取名称、规格、有效期等全部字段，确认即入库 |
| **换行分隔批量录** | 多条药品换行粘贴，一键批量解析，适合首次整理一整箱药 |
| **问一句话就找药** | 「有退烧药吗」「快过期的有哪些」—— 像聊天一样检索药箱 |
| **过期自动提醒** | 到期 / 即将到期药品自动标记高亮，支持 [Telegram / Discord / 飞书 / 邮件](./NOTIFICATIONS.md) 每日推送 |
| **Agent 原生接入** | 内置 [MCP Server](./MCP.md)，Claude Code / Cursor / Claude Desktop / OpenClaw 直接调用 tool 管理药箱 |
| **一行命令自部署** | `docker compose up -d --build`，药箱数据默认保存在本地 SQLite；启用 AI 或通知时仅与对应服务通信 |
| **兼容任意 AI** | OpenAI、Deepseek、Ollama…… 任何兼容 `/v1/chat/completions` 的 API 均可 |

### 功能演示

<details>
<summary><b>AI 智能录入演示</b> — 说一句话，自动解析入库</summary>
<br>
<div align="center">

![AI 解析录入演示](.docs/screenshot/add-demo.gif)

</div>
</details>

<details open>
<summary><b>药品列表</b> — 分类筛选 · 过期状态一目了然</summary>
<br>
<div align="center">

![药品列表页面](.docs/screenshot/list-page.png)

</div>
</details>

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 · TypeScript · Vite · TailwindCSS v3 |
| 后端 | Hono (Node adapter) · TypeScript |
| 数据库 | SQLite via better-sqlite3 |
| AI | 任何兼容 OpenAI 格式的 API (`/v1/chat/completions`) |
| 部署 | 单 Docker 容器 |

## 快速开始

### Docker（推荐）

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
cp .env.example .env
# 可选：编辑 .env 设置 AI 默认值、MEDKIT_PORT 或代理变量
docker compose up -d --build
```

默认访问 `http://localhost:3000`。如果修改了 `.env` 中的 `MEDKIT_PORT`，请使用对应端口。

AI 配置在部署时是可选的，可以留空，之后在浏览器的设置面板中配置。

首次打开 Web UI 时，应用会自动检测当前浏览器时区并写入服务端；后续的过期判断、AI 问答中的"今天"以及每日提醒时间都会以这个业务时区为准。

### 本地开发

前置条件：Node.js >= 20

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
npm install
cp .env.example .env
npm run dev
```

前端运行在 http://localhost:5173，后端运行在 http://localhost:3000。

如果你只通过 MCP / CLI / OpenClaw 使用 Open MedKit、从不打开 Web UI，请先初始化时区。未初始化时系统会回退到 `UTC`，不会使用服务器本地时区。

## 配置

所有 AI 配置也可以在浏览器的设置面板中设置。在浏览器中输入的值存储在当前浏览器的 `localStorage` 中，优先级高于环境变量。

`MEDKIT_PORT` 仅影响 Docker Compose 的宿主机端口映射。`PORT` 和 `DB_PATH` 用于源码 / 非 Docker 方式运行。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `AI_API_KEY` | — | 兼容 OpenAI 格式的 API Key |
| `AI_BASE_URL` | `https://api.openai.com` | API 基础 URL |
| `AI_MODEL` | `gpt-4o-mini` | 模型名称 |
| `MEDKIT_PORT` | `3000` | `docker compose` 暴露的宿主机端口 |
| `PORT` | `3000` | 源码运行时的服务端口（不使用 Docker） |
| `DB_PATH` | `./data/medicine.db` | 源码运行时的 SQLite 数据库路径（不使用 Docker） |
| `HTTP_PROXY` | — | 可选的 HTTP 代理，用于出站请求 |
| `HTTPS_PROXY` | — | 可选的 HTTPS 代理，用于出站请求 |
| `NO_PROXY` | — | 逗号分隔的不走代理的主机列表 |

## 通知提醒

支持 Telegram / Discord / 飞书 / Email（SMTP 和 Resend）四种渠道，均在 Web UI 的 **设置 → 通知提醒** 中配置。

各渠道的详细配置步骤、常见邮箱参数和故障排查请参阅 **[通知提醒配置](./NOTIFICATIONS.md)**。

## 隐私与安全

- 药品数据默认存储在部署环境内的 SQLite 数据库中。
- AI 解析、图片识别和聊天功能会将提交的文本或图片发送到你配置的 OpenAI 兼容接口。
- AI 聊天还会发送回答问题所需的当前药品库存数据，请避免录入不希望与模型提供商共享的信息。
- 浏览器端的 AI 配置（如 `AI_API_KEY`、Base URL、模型名称）存储在当前浏览器的 `localStorage` 中。
- 通知提醒（Telegram / Discord / 飞书 / 邮件）启用后，会将药品名称、有效期和提醒文本发送到对应平台。
- Open MedKit 仅用于家庭药品库存管理，不提供诊断、处方或个性化用药建议。

## 部署

详细部署指南请参阅 **[部署文档](./DEPLOY.md)**。

### 一键发布到阿里云新加坡服务器

本项目已经提供面向 `bank-t.chuya.wang` / `43.119.88.83` 的一键发布脚本。脚本会在服务器上安装 Docker、配置 Nginx 反向代理、申请 HTTPS 证书、写入生产 `.env`，并把容器只绑定到服务器本机 `127.0.0.1:3000`，公网只开放 80/443。

前置条件：

- 阿里云安全组已放行 `22`、`80`、`443`
- `bank-t.chuya.wang` 的 A 记录已指向 `43.119.88.83`
- 本机可以通过 SSH 登录服务器：`ssh root@43.119.88.83`

首次发布：

```bash
npm install
git push origin codex/agrochemical-inventory-management
AUTH_PASSWORD='换成你的访问密码' \
AI_API_KEY='你的 DeepSeek API Key，可先留空' \
npm run deploy:singapore
```

脚本会让服务器从 GitHub 拉取代码，所以本地改动需要先 push 到对应分支。默认发布当前 Git 分支，也可以通过 `BRANCH=...` 指定。

如果不传 `AUTH_PASSWORD`，脚本会自动生成一个 20 位随机密码，并在发布完成后打印出来。

脚本默认使用 DeepSeek：

```env
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

后续更新代码后，再运行同一个命令即可重新发布：

```bash
npm run deploy:singapore
```

常用覆盖项：

```bash
SERVER_HOST=43.119.88.83 \
SERVER_USER=root \
DOMAIN=bank-t.chuya.wang \
BRANCH=codex/agrochemical-inventory-management \
AUTH_PASSWORD='新的访问密码' \
AI_API_KEY='sk-...' \
npm run deploy:singapore
```

如果登录提示“密码错误”，直接用 `AUTH_PASSWORD='新的访问密码' npm run deploy:singapore` 重新发布一次，脚本会重新生成密码哈希并重启服务。

**快速部署** — 任何能运行 Docker 的机器：

```bash
docker compose up -d --build
```

数据持久化在 Docker 卷 (`medkit-data`) 中。备份方式：

```bash
docker cp medkit:/data/medicine.db ./medicine-backup.db
```

## MCP Server（Agent 集成）

Open MedKit 内置 [MCP](https://modelcontextprotocol.io/) 服务器，让 AI agent 直接通过 tool 调用管理药箱数据，无需打开浏览器。

**已验证支持的客户端**：

| 客户端 | 配置方式 |
|---|---|
| **Claude Code** | 项目根目录 `.mcp.json`，启动即自动连接 |
| **OpenClaw / Codex** | `codex.json` 或 `~/.codex/config.json`，支持 Skill 调用 |
| **Cursor** | `~/.cursor/mcp.json` 或项目 `.cursor/mcp.json` |
| **Claude Desktop** | `claude_desktop_config.json` |

快速接入 — 在项目根目录创建 `.mcp.json`（Claude Code 自动识别）：

```json
{
  "mcpServers": {
    "open-medkit": {
      "command": "npx",
      "args": ["tsx", "backend/src/mcp-server.ts"],
      "env": { "DB_PATH": "./backend/data/medicine.db" }
    }
  }
}
```

如果你通过浏览器使用，首次访问时会自动检测并保存浏览器时区。

如果你只通过 MCP 使用，建议第一次连接后先运行：

```text
get_settings
set_timezone(timezone="Asia/Shanghai")
```

未初始化时区时，MCP 会明确提示当前只是回退到 `UTC`，而不是服务器本地时区。

**详细文档**：各客户端的完整配置方法、OpenClaw Skill 编写模板、对话示例、故障排查等，请参阅 **[MCP 使用指南](./MCP.md)**。

## 项目结构

```
open-medkit/
├── backend/           # Hono API 服务器 + MCP 服务器
│   └── src/
│       ├── ai/        # AI 客户端、提示词、解析逻辑
│       ├── db/        # SQLite schema 与客户端
│       ├── routes/    # REST API 路由
│       ├── services/  # Telegram、Discord、飞书、邮件 & 通知调度
│       ├── middleware/ # API Key 注入
│       └── mcp-server.ts  # MCP 服务器（stdio 传输）
├── frontend/          # React 单页应用
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── lib/       # API 客户端 & 工具函数
│       └── types/
├── Dockerfile         # 多阶段构建
├── docker-compose.yml
└── .env.example
```

## 许可证

MIT

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=MonoYan/open-medkit&type=Date)](https://star-history.com/#MonoYan/open-medkit&Date)

Powered by [Star History](https://github.com/star-history)
