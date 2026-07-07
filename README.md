# 合同管理系统

企业合同全生命周期管理平台，支持合同录入、到期提醒、统计分析、附件管理等功能。

## 功能特性

- **合同管理**: 录入、编辑、删除、批量导入（Excel）
- **到期提醒**: 自动创建到期提醒，支持通知推送
- **统计分析**: 仪表盘、按类型/部门统计、月度趋势、金额分布
- **附件管理**: 文件上传、预览、下载
- **用户管理**: 多用户支持，角色权限控制（管理员/普通用户）
- **数据备份**: 数据库导出/导入

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite 7 + Ant Design 5 + ECharts |
| 后端 | Express 4 + sql.js (WebAssembly SQLite) |
| 桌面端 | Electron 42 + electron-builder |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
npm install
```

### 开发

```bash
# Web 版本（推荐快速开发）
npm run dev:web

# Electron 桌面版本
npm run dev
```

访问 http://localhost:5173

### 构建

```bash
# 构建前端资源
npm run build

# 打包 Electron 桌面应用
npm run pack
```

## 默认账户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |

> 每次启动会重置管理员密码

## 项目结构

```
├── server/              # Web 模式后端
│   ├── index.js         # Express 服务器
│   ├── database.js      # 数据库操作
│   └── routes.js        # API 路由
├── electron/            # Electron 桌面端
├── src/                 # React 前端
│   ├── pages/           # 页面组件
│   ├── services/        # API 服务
│   ├── contexts/        # 状态管理
│   └── components/      # 公共组件
└── dist/                # 构建产物
```

## API 文档

所有 API 以 `/api` 为前缀，需 Bearer Token 鉴权。

| 端点 | 说明 |
|------|------|
| `POST /api/auth/login` | 登录 |
| `GET /api/contracts` | 合同列表 |
| `POST /api/contracts` | 创建合同 |
| `POST /api/contracts/import` | 批量导入 |
| `GET /api/reminders` | 提醒列表 |
| `GET /api/stats/dashboard` | 仪表盘数据 |

## License

MIT
