# 合同管理系统

面向财务审计场景的内部合同台账系统：合同录入、收付款记录、到期提醒、统计分析、附件管理，
强调**数据不丢**（自动备份含附件、一键恢复）与**操作可追溯**（字段级操作日志）。

当前版本 **v2.6.0**。演进规划见 [docs/合同管理系统-建设规划与排期.md](docs/合同管理系统-建设规划与排期.md)。

## 下载与文档

- 安装包 / 免安装包：[GitHub Releases](https://github.com/FAY020515/contract-manager/releases)
- 给同事看：[使用手册](docs/使用手册.md)
- 给管理员 / IT 看：[运维手册](docs/运维手册.md)

## 功能特性

- **合同管理**：录入、编辑、Excel 批量导入（系统提供模板；重复编号会明确提示；日期与金额自动容错）
- **收付款记录**：收入/支出、状态、凭证附件，已发生金额自动汇总
- **操作留痕**：合同创建/修改（字段级差异，如「合同金额：8,000 元 → 9,000 元」）、附件与凭证的上传/更换/删除、收付款记录增删改
- **附件管理**：上传、预览、下载；附件原件存于 `data/uploads/`，随备份一起保存
- **到期提醒**：合同保存即生成到期前 7 天提醒，列表与日历双视图（仅系统内提醒，不推送外部渠道）
- **统计分析**：仪表盘、按类型/部门、月度趋势、金额分布，支持导出
- **权限**：管理员 / 普通用户两级。普通用户可录入与修改；**删除合同、附件、收付款记录仅管理员**，删合同需输入编号确认
- **备份与恢复**：自动备份（台账 + 附件，按份轮转）、备份距今提醒、一键恢复到任一备份、完整备份可直接写入 U 盘
- **安全**：管理员密码不会被重启重置；数据库原子写盘；导入前校验；未匹配接口显式 404

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite 7 + Ant Design 5 + ECharts |
| 后端 | Express 4 + sql.js (WebAssembly SQLite) |
| 桌面端 | Electron 42 + electron-builder |

## 快速开始（开发）

要求 Node.js >= 18、npm >= 9。

```bash
npm install

# Web 版本（Vite + Node 后端）
npm run dev:web

# Electron 桌面版本
npm run dev
```

访问 http://localhost:5173

### 构建与打包

```bash
npm run build      # 只构建前端到 dist/
npm run pack       # 打包安装包到 release/
npm run package    # 打 Web 部署包到 deploy/合同管理系统/
```

### 提交前检查

```bash
npx tsc -b        # 类型检查（根 tsconfig 是引用壳，必须用 -b）
npm run build     # 生产构建
node scripts/smoke.js   # 体检：临时环境跑 13 项核心检查，不碰真实数据
```

## 默认账户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |

> 仅在管理员不存在时创建。**密码不会被重启重置**，首次登录请立即修改。
> 忘记密码：停止服务后执行 `node scripts/reset-admin-password.js [db路径]`，重置为 `admin123`。

## 项目结构

```
├── server/              # Web 模式后端
│   ├── index.js         # Express 服务器
│   ├── database.js      # 数据库操作
│   └── routes.js        # API 路由与鉴权
├── electron/            # Electron 壳（main.js 为实际入口，内嵌同一套后端）
├── src/                 # React 前端
│   ├── pages/           # 页面组件
│   ├── services/        # API 服务
│   ├── contexts/        # 状态管理
│   └── components/      # 公共组件
├── docs/                # 使用手册、运维手册、建设规划
├── scripts/             # 打包脚本、体检脚本、重置密码脚本
└── data/                # 运行期数据（数据库、附件、备份，不入库）
```

## API 摘要

所有 API 以 `/api` 为前缀，除登录、健康检查与附件的只读下载/预览外均需 Bearer Token。

| 端点 | 说明 |
|------|------|
| `POST /api/auth/login` | 登录 |
| `GET/POST /api/contracts` | 合同列表 / 创建 |
| `GET/PUT/DELETE /api/contracts/:id` | 详情 / 修改 / 删除（仅管理员，需 `?confirm_no=`） |
| `POST /api/contracts/import` | 批量导入 |
| `GET/POST /api/contracts/:id/payments` | 收付款记录 |
| `GET /api/reminders` | 提醒列表 |
| `GET /api/stats/*` | 统计数据 |
| `/api/backup/*` | 备份、恢复、自动备份配置（仅管理员） |

## License

MIT
