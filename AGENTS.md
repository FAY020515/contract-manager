# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## 项目概述

合同管理系统 v2.8.1 - 用于企业合同全生命周期管理的桌面/Web 应用，支持合同录入、收付款管理、到期提醒、统计分析、附件管理、Excel 导入导出、列配置（筛选/排序）、数据库自动备份与导入恢复等功能。

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

> **当前实际链路（2026-11-26 核实）**：渲染进程一律走 HTTP。`src/main.tsx` 用 `(window as any).api = api` 把调用固定接到 `src/services/api.ts` 的 REST 客户端；`package.json` 的 `main` 指向 `electron/main.js`，**`electron/main.ts` 已不再被执行**（`electron/main.ts` 里的 `ipcMain.handle` 与 `electron/database.ts` 属于遗留代码，排查问题不要看它们）。
>
> Electron 模式（`npm run dev` / `npm run start` / 打包后的 exe）由 `electron/main.js` 的 `startServer()` 在进程内自己起一套 Express——它 require 的就是 `server/database.js` 和 `server/routes.js`，端口从 3000 起被占用则自动往后试到 3100，`dist/` 由同一服务托管。所以**不需要另外开 `npm run server`**；改 `server/` 下的接口，桌面版 exe 会一起生效。它弹出的窗口只是一个"服务运行中 + 本机/局域网地址"的状态页，真正的使用界面是点按钮在浏览器里打开。

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
├── scripts/             # 构建与运维脚本
│   ├── package-server.js          # Web 部署打包脚本
│   ├── generate-tray-icon.js      # 托盘图标生成
│   ├── setup-autostart.ps1        # 开机自启设置
│   ├── smoke.js                   # 体检：临时环境跑 13 项核心检查，不碰真实数据
│   └── reset-admin-password.js    # 忘记管理员密码时重置为 admin123（须先停服务）
├── docs/                # 使用手册、运维手册、建设规划与排期
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

> 补充（2026-11-26）：迁移只在**目标库不存在**时发生，目标已有数据时绝不覆盖。候选来源按优先级为 `getExeSideDataDir()`（v1.0.x 打包版把数据放在 exe 同级 `data/`）→ `getLegacyDataDir()`（`app.getPath('userData')/data`，即当前打包版的存放位置）；与 `DB_DIR` 同路径的候选会被跳过，所以现行版本里 AppData 那条实际是空操作。早期注释写的"旧版在 AppData、新版在 exe 旁边"方向是反的，已按实际代码修正。

**数据库文件同步**：以下三个文件需保持 schema 一致：`server/database.js`, `electron/database.ts`, `electron/database.js`（编译产物）

> 补充（2026-11-26）：Web 与 Electron 用的是同一个数据库层——`server/index.js` 和 `electron/main.js` 都 require `server/database.js`。所以日常改动只需维护 `server/database.js`。`electron/database.ts` 与 `electron/database.js` 是早期 IPC 方案的遗留副本，schema 已经落后（例如没有本次新增的自动备份函数），排查问题时不要以它们为准。

### 认证机制

- HMAC-SHA256 token（非标准 JWT），随机 secret，24 小时过期
- 密码哈希：salt + SHA256
- 默认管理员: `admin / admin123`（仅在 admin 不存在时创建；已存在只保证启用与管理员角色，**密码不再被启动重置**，仍用默认值时启动日志会给出警告）
- 角色: `admin` (管理员) 和 `user` (普通用户)
- 用户软删除：`active = 0`（非物理删除）。**最后一位在职 admin 既不能删除、也不能被降级或停用**（删除由 `deleteUser` 拦截，降级/停用由 `PUT /api/users/:id` 用 `countActiveAdmins()` 拦截），否则系统会没人能管用户与备份。
- 前端 token 存储在 `localStorage.auth_token`，挂载时通过 `/api/auth/me` 验证

### API 路由

所有 API 以 `/api` 为前缀，除 `/api/auth/login`、`/api/health`、以及 **`/api/attachments/*` 的只读方法（GET/HEAD）** 外均需 Bearer token 鉴权。文件上传限制 50MB。

**认证**: `POST /api/auth/login`, `GET /api/auth/me`

**用户管理** (admin): `GET/POST /api/users`, `PUT/DELETE /api/users/:id`

**合同 CRUD**: `GET/POST /api/contracts`, `GET/PUT/DELETE /api/contracts/:id`, `POST /api/contracts/import`, `PUT /api/contracts/:id/approval`, `GET /api/contracts/next-number`。其中 **DELETE 仅管理员**，且必须带 `?confirm_no=<该合同的编号>`，编号不符返回 400（前端用输入编号的确认弹窗，不是普通 Popconfirm）。普通用户可新增与修改合同、可改审批状态，靠操作日志追溯。

**主体公司与自动编号**：`settings.companies` 存 `[{name, abbr}]`，缩写 2-6 位大写字母或数字、名称与缩写各自唯一（`PUT /api/settings/companies` 在服务端校验并自动转大写）。合同编号格式 `<缩写>-<年份>-<四位流水>`，`GET /api/contracts/next-number?company=<公司名>` 按"缩写+年份"取 `max(settings.contract_seq 记录的最大号, 现有合同最大号)+1`；创建/更新合同时 `bumpContractSeq()` 把用过的号写回 `contract_seq`，保证**删除后作废号不复用**。`contracts.company` 存公司名称（非 id），公司改名不影响历史合同与已生成编号；新建时前端必选，历史/导入允许为空（显示"未指定"）。

**审批留痕**：审批走线下纸质单据，系统只记录结果。`contracts.approval_status ∈ 未审批/审核中/已批准/已用印`（默认未审批），变更由 `setApprovalStatus()` 写 `approval_by/approval_at` 并记日志「审批状态：旧 → 新」。审批单扫描件与合同附件共用 `attachments` 表，用 `category` 区分（`contract` / `approval`），详情页分两栏展示；删除审批单同样仅管理员。

**附件**: `POST/GET /api/contracts/:id/attachments`, `GET/DELETE /api/attachments/:id`, `GET /api/attachments/:id/download`, `GET /api/attachments/:id/preview`

**收付款**: `GET/POST /api/contracts/:id/payments`, `GET /api/contracts/:id/payments/summary`, `PUT/DELETE /api/payments/:id`, `POST /api/payments/:id/attachment`, `DELETE /api/payments/:id/attachment`

**提醒**: `GET /api/reminders`, `GET /api/reminders/upcoming/:days`, `PUT /api/reminders/:id/status`

**日志**: `GET /api/contracts/:id/logs`

**统计**: `GET /api/stats/dashboard`, `/by-type`, `/by-department`, `/monthly-trend`, `/amount-distribution`

**设置**: `GET /api/settings`, `GET/PUT /api/settings/:key`

**备份** (admin only): `POST /api/backup/export`, `POST /api/backup/import`, `GET/PUT /api/backup/auto-config`, `POST /api/backup/auto-trigger`, `GET /api/backup/units`, `POST /api/backup/full-export`, `POST /api/backup/restore`

### 备份与恢复

- 自动备份配置存在 `settings` 表的 `auto_backup` 键：`{ enabled, backupDir, frequency('daily'|'weekly'), keepCount, lastBackupTime }`。读取时统一归一化：`keepCount` 至少 1（默认 7），`frequency` 只认 `weekly`，其余都按 `daily`。
- 触发时机：`server/index.js` 启动 30 秒后检查一次，之后每小时检查一次，由 `shouldAutoBackupNow()` 判断是否到期，再调 `performAutoBackup()`。
- 默认备份目录 `data/backups/`（`DEFAULT_BACKUP_DIR`），`backupDir` 留空即用默认。`backupDir` 由 `normalizeBackupDir()` 校验：必须是不含 `..` 的绝对路径，且不能等于数据库所在目录，否则记一条警告并回退默认目录；写入（`setAutoBackupConfig`）和读取（`getAutoBackupConfig`）两侧都会钳制。文件名带毫秒，避免同一秒内两次备份互相覆盖。
- 轮转按前缀分别处理，一个"备份单元"可以是目录或以前的单文件：`auto_backup_*` 受用户配置的 `keepCount` 控制，`pre_import_*` 固定保留最近 5 份（`PRE_IMPORT_KEEP`）。`cleanOldBackups` 用 `rmSync(recursive)` 删除，两种形态都能清。
- **附件本体不在数据库里。** 合同附件与收付款凭证的实际文件存在 `data/uploads/`，`attachments` 表与 `payments.attachment` 只记文件名/原名/大小，单靠一个 .db 恢复后附件栏会显示存在但打不开。因此 `performAutoBackup()` 走 `writeFullBackup()`，产物是一个 `auto_backup_<时间戳>/` 目录，内含 `contracts.db` 与 `uploads/` 副本；而 `POST /api/backup/export`（浏览器下载）仍是单个 .db，不含附件，界面上已分别写明。
- **备份单元与一键恢复**：一份备份 = `auto_backup_<时间戳>/` 目录（内含 `contracts.db` 与 `uploads/`）。`listBackupUnits(dir)` 枚举备份单元并带出附件数量与体积；`restoreFromUnit(source)` 校验后同时回退台账与附件——**当前 uploads 里不在该备份中的文件会被删除**（用户确认过的语义：恢复=回到那个时点），删除前整个 uploads 与当前库会存进 `pre_restore_<时间戳>/`（`PRE_RESTORE_KEEP=3` 轮转），失败时库和附件一起回滚。早期单文件备份（`auto_backup_*.db`）仍可列出与恢复，但没有附件，此时附件目录保持不动并在返回值里以 `uploadsRestored:false` 标明。`exportFullBackupTo(dest)` 供"插 U 盘直接写一份"，目标目录不做轮转清理。三个接口都限 admin，路径都过 `normalizeBackupDir`。
- `auto_backup` 配置另有 `lastError` 字段：`performAutoBackup()` 成功时清空、失败时写入原因，设置页用红色 Alert 显示"最近一次自动备份没有成功"。这一步很重要——备份目录指向 U 盘而盘没插时，定时任务原本只会写控制台日志，界面上无声无息。
- **导入必须"先校验、再覆盖"**：`importBackup()` 先验证上传文件的 SQLite 头和 `contracts` 表，通过后先把当前库存成 `pre_import_*.db`，然后才覆盖 `contracts.db`，中途失败会回滚。原因：直接复制文件会在解析失败时把运行中的数据库变成无效文件，此时所有接口报 `file is not a database`，且 `initDatabase()` 重启也起不来，只能人工替换文件恢复。

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
- Excel 导入：前端用 `xlsx` 解析后把行数组 POST 给 `/api/contracts/import`，服务端按中文表头映射（`合同编号/合同名称/合同类型/甲方/乙方/合同金额/币种/签订日期/生效日期/到期日期/状态/所属部门/负责人/合同摘要`）。**CSV 的中文表头编码不固定**，`ContractList.handleImportFile` 先按 UTF-8（codepage 65001）读，表头认不出再按 GBK（936）读一次；表头缺少「合同名称」时直接提示，不再逐行报错。日期经 `normalizeDateValue()` 兼容 Excel 序列号与 `2026/1/5`，金额经 `parseAmountValue()` 兼容千分位与"元"。重复编号由 `translateContractError()` 转成中文提示（手动新建、编辑、导入三条路径共用）。

- 提醒状态规则：合同更新 → 重置为 pending；合同终止/到期 → processed
- 写 `contract_logs` 统一走 `addContractLog(contractId, action, detail, operator)`（`server/database.js`）：`action` 用短动词（现有为 `创建` / `更新` / `上传` / `更换` / `删除` / `新增`），`detail` 写中文说明，`operator` 一律取令牌里的登录者（`req.user.display_name || req.user.username`），不要用请求体自报的名字。已覆盖：合同创建/更新、合同附件上传与删除、收付款记录新增/修改/删除、收付款凭证上传/更换/删除。**合同更新必须写字段级差异**（`diffFields()` + `CONTRACT_FIELD_LABELS`，格式如「合同金额：8,000 元 → 9,000 元」，多条用「；」连接）；收付款更新只记业务字段、不记凭证字段，避免与凭证日志重复。`getLogsByContract` 按 `created_at DESC, id DESC` 排序，否则同一秒内的多条记录顺序不定。前端在 `ContractDetail.tsx` 的 `refreshLogs()` 里同步刷新时间线。
- 鉴权白名单分两类：`PUBLIC_PREFIX` 完全公开（登录、健康检查），`PUBLIC_READ_PREFIX`（`/attachments/`）**只放行 GET/HEAD**，因为预览与下载是浏览器直接打开链接、不带令牌；删除附件必须登录。新增附件类写接口不要放进只读白名单。
- 未匹配的 `/api` 路径必须由 `app.use('/api', 404)` 兜底返回 JSON，不能像早期那样在 SPA 回退里对 `/api` 直接 return——那样请求永远不响应，连接一直悬着（`server/index.js` 与 `electron/main.js` 两处写法要保持一致）。
- 限定管理员的接口在 handler 首行写 `if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' })`（鉴权中间件只保证已登录，不区分角色）；前端对应入口用 `useAuth()` 的 `user?.role === 'admin'` 控制显隐，避免普通用户触发 403
- 破坏性操作（覆盖数据库文件、批量删除）必须先校验输入再动目标，并留下可回滚的副本；错误响应要区分"未做改动"和"已改动但失败"
- 提交前至少跑 `npx tsc -b`（根 `tsconfig.json` 是引用壳，**必须用 `-b`**；直接 `tsc -p tsconfig.json` 什么都不检查，此前因此漏过"用了未导入的 Modal"这类错误）和 `npm run build`；涉及备份/导入这类改数据库的功能，另用一份独立的 `data/` 目录起服务实测，不要拿真实库试
- 覆盖 `contracts.db` 只能走 `saveToDisk()` 或 `replaceFile()`（同目录临时文件 + `renameSync`）。不要直接 `fs.writeFileSync(DB_PATH, ...)`：`server/index.js` 每个请求结束都会存盘，截断式写入一旦碰上进程被杀或断电，库里就只剩半个甚至 0 字节，症状与无效导入相同且日常使用就会撞上
