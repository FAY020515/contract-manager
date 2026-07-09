# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## 项目概述

合同管理系统 v2.0.1 - 用于企业合同全生命周期管理的桌面/Web 应用，支持合同录入、收付款管理、到期提醒、统计分析、附件管理、Excel 导入导出、列配置（筛选/排序）等功能。

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

# 生产模式启动 Electron
npm run start

# 构建前端资源到 dist/
npm run build

# 打包为桌面应用（先 build 再 electron-builder，输出到 release/）
npm run pack

# Web 模式部署打包（输出到 deploy/合同管理系统/）
npm run package
```

## 架构说明

### 双模式运行

项目支持两种运行模式，共享同一套后端代码：

1. **Electron 桌面模式** (`npm run dev`): 主进程调用 `electron/database.ts` 直接操作 sql.js，通过 IPC 与渲染进程通信
2. **Web 服务模式** (`npm run dev:web` 或 `npm run server`): Express 服务器在 `server/index.js` 启动，前端通过 REST API (`/api/*`) 访问

### 目录结构

```
├── server/              # Web 模式的后端
│   ├── index.js         # Express 服务器入口，监听 3000 端口
│   ├── database.js      # sql.js 数据库操作，表结构定义，CRUD 函数
│   └── routes.js        # REST API 路由，鉴权中间件
├── electron/            # Electron 桌面模式
│   ├── main.ts          # Electron 主进程，IPC handlers
│   ├── database.ts      # Electron 专用的数据库层
│   └── preload.ts       # 预加载脚本
├── src/                 # React 前端
│   ├── pages/           # 页面组件
│   │   ├── Login.tsx              # 登录（渐变背景）
│   │   ├── Dashboard.tsx          # 仪表盘（统计卡片 + 饼图 + 趋势 + 提醒）
│   │   ├── ContractList.tsx       # 合同列表（列配置、Excel 导入导出、日期筛选）
│   │   ├── ContractForm.tsx       # 新建/编辑合同（含附件上传）
│   │   ├── ContractDetail.tsx     # 合同详情（费用记录、附件、日志、快捷状态变更）
│   │   ├── Reminders.tsx          # 提醒管理（列表 + 日历双视图）
│   │   ├── Statistics.tsx         # 统计分析（5 种图表，可钻取，Excel 导出）
│   │   ├── Settings.tsx           # 系统设置（类型/部门/提醒规则/备份）
│   │   └── UserManagement.tsx     # 用户管理（仅 admin）
│   ├── services/api.ts  # HTTP API 客户端封装
│   ├── contexts/AuthContext.tsx   # 认证状态管理
│   ├── types/index.ts   # TypeScript 类型定义
│   └── components/Layout/AppLayout.tsx  # 主布局（侧边栏 + 顶栏）
├── scripts/             # 构建脚本
│   ├── package-server.js          # Web 部署打包脚本
│   ├── generate-tray-icon.js      # 托盘图标生成
│   └── setup-autostart.ps1        # 开机自启设置
├── electron-builder.yml           # electron-builder 配置
├── electron-vite.config.ts        # electron-vite 构建配置
├── installer.nsh                  # NSIS 安装宏（开机自启）
└── deploy/                        # Web 部署输出目录
```

### 前端路由

HashRouter，所有业务路由通过 `ProtectedRoute` 鉴权：

| 路径 | 页面 |
|------|------|
| `/login` | 登录 |
| `/dashboard` | 仪表盘 |
| `/contracts` | 合同列表 |
| `/contracts/new` | 新建合同 |
| `/contracts/:id/edit` | 编辑合同 |
| `/contracts/:id` | 合同详情 |
| `/reminders` | 提醒管理 |
| `/statistics` | 统计分析 |
| `/settings` | 系统设置 |
| `/users` | 用户管理 |

### 数据库

- 使用 sql.js (WebAssembly) 实现嵌入式 SQLite
- 数据文件存储位置：
  - Electron: `app.getPath('userData')/contracts.db`
  - Web 开发: `项目目录/data/contracts.db`
  - Web 打包: `app.getPath('userData')/data/contracts.db`
- 附件上传目录: `data/uploads/`
- 主要表: `contracts`, `reminders`, `contract_logs`, `payments`, `attachments`, `users`, `settings`

**payments 表**：`id, contract_id, type ('收入'|'支出'), amount, payment_date, status ('待收'|'待付'|'已收'|'已付'), description, attachment, attachment_name, created_at`

**occurred_amount**：非存储列，通过 `LEFT JOIN payments` 聚合计算：
```sql
COALESCE(SUM(CASE WHEN p.status IN ('已付', '已收') THEN p.amount ELSE 0 END), 0) as occurred_amount
```

**数据迁移**：server/database.js 的 `initDatabase()` 在目标文件不存在时，会从旧版 AppData 目录自动迁移。注意：必须先停止所有 node 进程再复制数据库文件，否则运行中的 server 会覆盖。

**数据库文件同步**：以下三个文件需保持 schema 一致：`server/database.js`, `electron/database.ts`, `electron/database.js`（编译产物）

### 认证机制

- HMAC-SHA256 token（非标准 JWT），随机 secret，24 小时过期
- 密码哈希：salt + SHA256
- 默认管理员: `admin / admin123`（每次启动强制重置密码并激活）
- 角色: `admin` (管理员) 和 `user` (普通用户)
- 用户软删除：`active = 0`（非物理删除），最后一位 admin 不可删除
- 前端 token 存储在 `localStorage.auth_token`，挂载时通过 `/api/auth/me` 验证

### API 路由

所有 API 以 `/api` 为前缀，除 `/api/auth/login`, `/api/health`, `/api/attachments/*` 外均需 Bearer token 鉴权。文件上传限制 50MB。

**认证**: `POST /api/auth/login`, `GET /api/auth/me`

**用户管理** (admin): `GET/POST /api/users`, `PUT/DELETE /api/users/:id`

**合同 CRUD**: `GET/POST /api/contracts`, `GET/PUT/DELETE /api/contracts/:id`, `POST /api/contracts/import`

**附件**: `POST/GET /api/contracts/:id/attachments`, `GET/DELETE /api/attachments/:id`, `GET /api/attachments/:id/download`, `GET /api/attachments/:id/preview`

**收付款**: `GET/POST /api/contracts/:id/payments`, `GET /api/contracts/:id/payments/summary`, `PUT/DELETE /api/payments/:id`, `POST /api/payments/:id/attachment`, `DELETE /api/payments/:id/attachment`

**提醒**: `GET /api/reminders`, `GET /api/reminders/upcoming/:days`, `PUT /api/reminders/:id/status`

**日志**: `GET /api/contracts/:id/logs`

**统计**: `GET /api/stats/dashboard`, `/by-type`, `/by-department`, `/monthly-trend`, `/amount-distribution`

**设置**: `GET /api/settings`, `GET/PUT /api/settings/:key`

**备份**: `POST /api/backup/export`

### 列配置功能

合同列表支持用户自定义列显示和排序：

- **ALL_COLUMNS** 定义 10 个可配置列：`contract_no, title, type, party_a, amount, occurred_amount, end_date, status, person_in_charge, attachment_count`
- 配置存储在 `localStorage` 键 `contract_list_columns`，格式：`{ visible: string[], order: string[] }`
- Popover 面板中拖拽排序（HTML5 原生拖放事件），支持重置默认

### Vite 配置

- 开发端口: 5173（`strictPort: false`，被占用时自动切换）
- API 代理: `/api` → `http://localhost:3000`
- 路径别名: `@` → `src/`
- 基础路径: `./` (相对路径，支持 Electron file:// 协议)

### electron-builder 配置

- appId: `com.contract-manager.app`，输出目录: `release/`
- NSIS: `oneClick: false`，允许选择安装目录，快捷方式名: `合同管理系统`
- 安装时通过 `installer.nsh` 创建开机自启快捷方式
- 打包排除: `.ts, .tsx, src/**, electron/database.js, electron/preload.js, scripts/**, deploy/**` 等开发文件

## 代码约定

- 后端使用 CommonJS (`require`)，前端使用 ES Modules (`import`)
- 中文注释和错误消息
- 合同状态使用中文枚举: `'草稿' | '执行中' | '已到期' | '已终止' | '已续签'`
- 收付款类型: `'收入' | '支出'`，状态: `'待收' | '待付' | '已收' | '已付'`
- 统计查询使用 SQLite 的 `strftime` 函数处理日期聚合
- 中文文件名上传需 `Buffer.from(file.originalname, 'latin1').toString('utf8')` 修正编码
- 提醒状态规则：合同更新 → 重置为 pending；合同终止/到期 → processed
