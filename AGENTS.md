# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## 项目概述

合同管理系统 - 用于企业合同全生命周期管理的桌面/Web 应用，支持合同录入、到期提醒、统计分析、附件管理等功能。

## 技术栈

- **前端**: React 18 + Vite 7 + TypeScript + Ant Design 5 + ECharts
- **后端**: Express 4 + sql.js (WebAssembly SQLite)
- **桌面端**: Electron 42 + electron-builder
- **路由**: react-router-dom 6 (HashRouter)

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式 - 启动 Electron 桌面应用（自动等待 Vite 就绪）
npm run dev

# 开发模式 - 仅 Web 版本（Vite + Node.js 后端）
npm run dev:web

# 单独启动后端服务（端口 3000）
npm run server

# 构建前端资源到 dist/
npm run build

# 打包为桌面应用（先 build 再 electron-builder）
npm run pack
```

## 架构说明

### 双模式运行

项目支持两种运行模式，共享同一套后端代码（`server/`）：

1. **Electron 桌面模式** (`npm run dev` 或打包后): `electron/main.js` 启动时内嵌 Express 服务，加载 `server/database.js` 和 `server/routes.js`，自动打开浏览器访问本地服务
2. **Web 服务模式** (`npm run dev:web` 或 `npm run server`): Express 服务器在 `server/index.js` 启动，前端通过 REST API (`/api/*`) 访问

### 目录结构

```
├── server/           # Web 模式的后端
│   ├── index.js      # Express 服务器入口，监听 3000 端口
│   ├── database.js   # sql.js 数据库操作，表结构定义，CRUD 函数
│   └── routes.js     # REST API 路由，鉴权中间件
├── electron/         # Electron 桌面模式
│   ├── main.ts       # Electron 主进程，IPC handlers
│   ├── database.ts   # Electron 专用的数据库层
│   └── preload.ts    # 预加载脚本
├── src/              # React 前端
│   ├── pages/        # 页面组件（ContractList, Dashboard 等）
│   ├── services/api.ts  # HTTP API 客户端封装
│   ├── contexts/AuthContext.tsx  # 认证状态管理
│   ├── types/index.ts   # TypeScript 类型定义
│   └── components/Layout/AppLayout.tsx  # 主布局（侧边栏 + 顶栏）
```

### 数据库

- 使用 sql.js (WebAssembly) 实现嵌入式 SQLite
- 数据文件存储位置（按优先级）：
  - 打包 Electron（exe 目录可写）：`exe 同级目录/data/contracts.db`
  - 打包 Electron（exe 目录不可写，如 Program Files）：`app.getPath('userData')/data/contracts.db`
  - 开发模式 / Web 模式：`项目目录/data/contracts.db`
- 附件上传目录: `data/uploads/`（与数据库同级）
- 首次启动自动从旧版 AppData 迁移数据（含附件）
- 主要表: `contracts`, `reminders`, `contract_logs`, `attachments`, `users`, `settings`

### 认证机制

- 简单的 HMAC-SHA256 token（非标准 JWT），24 小时过期
- 默认管理员: `admin / admin123`（每次启动强制重置密码）
- 角色: `admin` (管理员) 和 `user` (普通用户)
- 前端 token 存储在 `localStorage.auth_token`

### API 路由

所有 API 以 `/api` 为前缀，除 `/api/auth/login`, `/api/health`, `/api/attachments/*` 外均需 Bearer token 鉴权。

主要端点:
- `/api/contracts` - 合同 CRUD + 批量导入
- `/api/contracts/:id/attachments` - 附件上传
- `/api/reminders` - 到期提醒
- `/api/stats/*` - 统计数据
- `/api/users` - 用户管理 (仅 admin)
- `/api/settings` - 系统设置
- `/api/backup/export` - 数据库备份导出

### Vite 配置

- 开发端口: 5173
- API 代理: `/api` → `http://localhost:3000`
- 路径别名: `@` → `src/`
- 基础路径: `./` (相对路径，支持 Electron file:// 协议)

## 代码约定

- 后端使用 CommonJS (`require`)，前端使用 ES Modules (`import`)
- 中文注释和错误消息
- 合同状态使用中文枚举: `'草稿' | '执行中' | '已到期' | '已终止' | '已续签'`
- 统计查询使用 SQLite 的 `strftime` 函数处理日期聚合
