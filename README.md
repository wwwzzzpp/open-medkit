# 农资库存管理系统 (Agrochemical Inventory Management)

**基于 AI 的农资（农药/化肥/种子等）库存管理与到期提醒系统**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

### 系统简介

本项目原衍生于开源的家庭药箱项目，现已深度改造为**多用户体系的农资库存管理系统**。支持通过自然语言（AI）快速录入农资产品进销存信息，并提供完善的库存流水记录、批次管理以及过期自动预警功能。

### 核心功能亮点

| 功能 | 描述 |
|:---|:---|
| **多用户账号隔离** | 系统具备完整的注册/登录认证体系，各农资店铺或用户的库存数据完全隔离独立。 |
| **AI 智能识别录入** | 一句话描述进货内容，AI 自动提取：品名、规格、数量、有效期、农资分类（如杀虫剂/杀菌剂/除草剂等）。 |
| **精细化库存流水** | 完整的入库、出库、盘点流水记录（`inventory_transactions`），操作来源与变更一目了然。 |
| **批次化生命周期管理** | 针对同一农资记录不同批次的购入日期、有效期及供应商（`inventory_batches`），精准追踪。 |
| **过期与临期预警** | 支持通过 飞书 / Telegram / Discord / 邮件 每日自动推送临期和已过期的农资提醒。 |
| **国内服务器一键部署** | 提供针对国内网络环境深度优化的部署脚本，使用 Rsync 本地直推代码绕过 GitHub 封锁，内置国内镜像源。 |

### 技术栈体系

| 模块 | 技术选型 |
|---|---|
| **前端界面** | React 18 · TypeScript · Vite · TailwindCSS |
| **后端接口** | Hono (Node adapter) · TypeScript · RESTful API |
| **数据库** | SQLite (基于 better-sqlite3) |
| **大语言模型** | 兼容任何支持 OpenAI 格式的 API（推荐 DeepSeek 等） |
| **部署架构** | Docker · Nginx 反向代理 · Certbot (HTTPS) |

### 快速开发与本地运行

前置条件：Node.js >= 20

```bash
# 1. 克隆并进入目录
git clone <repo_url>
cd open-medkit

# 2. 安装依赖并配置环境变量
npm install
cp .env.example .env

# 3. 启动开发服务器
npm run dev
```

启动后，前端页面运行在 `http://localhost:5173`，后端服务运行在 `http://localhost:3000`。

### 生产环境部署指南

系统已提供针对国内阿里云/腾讯云等服务器优化的自动部署脚本 `scripts/deploy-production.sh`。

**1. 部署前置条件：**
- 确保云服务器安全组已开放 `22` (SSH)、`80` (HTTP)、`443` (HTTPS) 端口。
- 您的域名已配置 A 记录指向服务器 IP。
- 部署的机器（如您的 Mac）已配置免密 SSH 登录服务器。

**2. 一键发布命令：**
在本地项目目录中直接运行：
```bash
npm run deploy:production
```

**⚠️ 登录系统须知：**
由于系统已重构为多用户体系，旧版本文档中的 `AUTH_PASSWORD` 环境变量与随机密码机制均已废弃。  
系统在首次初始化数据库时，会自动生成默认的超级管理员账户：
- 默认账号：`admin`
- 默认密码：`admin123`
*(请在部署完成后，第一时间登录系统并修改密码。)*

### 许可证
MIT License
