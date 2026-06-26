const { app, BrowserWindow, shell, dialog, clipboard, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow = null;
let tray = null;
let serverPort = 3000;
let serverUrl = '';

// 日志写入文件，方便排查问题
const logPath = path.join(app.getPath('userData'), 'app.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  try { fs.appendFileSync(logPath, line); } catch (_) {}
}

async function startServer() {
  log('开始加载服务端模块...');
  log(`__dirname = ${__dirname}`);

  const databasePath = path.join(__dirname, '../server/database');
  const routesPath = path.join(__dirname, '../server/routes');
  log(`database.js 路径: ${databasePath}`);
  log(`routes.js 路径: ${routesPath}`);

  // 检查文件是否存在
  const dbFile = databasePath + '.js';
  const routesFile = routesPath + '.js';
  log(`database.js 存在: ${fs.existsSync(dbFile)}`);
  log(`routes.js 存在: ${fs.existsSync(routesFile)}`);

  let initDatabase, setupRoutes, express, cors, saveNow;
  try {
    const dbModule = require(databasePath);
    initDatabase = dbModule.initDatabase;
    saveNow = dbModule.saveNow;
    const routesModule = require(routesPath);
    setupRoutes = routesModule.setupRoutes;
    express = require('express');
    cors = require('cors');
    log('模块加载成功');
  } catch (e) {
    log(`模块加载失败: ${e.message}`);
    log(`堆栈: ${e.stack}`);
    throw e;
  }

  const serverApp = express();
  serverApp.use(cors());
  serverApp.use(express.json({ limit: '10mb' }));

  // 初始化数据库
  log('初始化数据库...');
  await initDatabase();
  log('数据库初始化完成');

  // 显示数据库存储位置，方便排查数据丢失问题
  try {
    const dbModule = require(databasePath);
    log(`数据库存储路径: ${dbModule.getDbPath ? dbModule.getDbPath() : '未知'}`);
  } catch (_) {}

  // 每个 API 请求结束后统一保存数据库到磁盘（必须在路由注册之前）
  serverApp.use('/api', (req, res, next) => {
    res.on('finish', () => {
      try { saveNow(); } catch (e) { log('数据库保存失败: ' + e.message); }
    });
    next();
  });

  // 注册 API 路由
  setupRoutes(serverApp);
  log('API 路由已注册');

  // 托管前端静态文件
  const distPath = path.join(__dirname, '../dist');
  log(`前端静态文件路径: ${distPath}`);
  log(`dist 目录存在: ${fs.existsSync(distPath)}`);

  serverApp.use(express.static(distPath));
  serverApp.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });

  // 启动服务，自动寻找可用端口
  return new Promise((resolve, reject) => {
    function tryListen(port) {
      const server = serverApp.listen(port, '0.0.0.0', () => {
        serverPort = port;
        const localIP = getLocalIP();
        serverUrl = `http://localhost:${serverPort}`;
        log(`服务已启动: ${serverUrl}`);
        log(`局域网: http://${localIP}:${serverPort}`);
        resolve({ server, port: serverPort, localIP });
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 3100) {
          log(`端口 ${port} 被占用，尝试 ${port + 1}`);
          server.close();
          tryListen(port + 1);
        } else {
          log(`服务启动失败: ${err.message}`);
          reject(err);
        }
      });
    }
    tryListen(serverPort);
  });
}

// IPC: 渲染进程请求复制到剪贴板
ipcMain.handle('clipboard:write', (_, text) => {
  clipboard.writeText(text);
  return true;
});

// 生成一个简单的托盘图标（蓝色方块）
function createTrayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      canvas[i] = 22; canvas[i + 1] = 119; canvas[i + 2] = 255; canvas[i + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTray(localIP) {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('合同管理系统 - 运行中');

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: `服务运行中 (端口 ${serverPort})`, enabled: false },
      { type: 'separator' },
      {
        label: '打开管理界面',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          } else {
            createStatusWindow(localIP);
          }
        },
      },
      {
        label: '在浏览器中打开',
        click: () => shell.openExternal(`http://localhost:${serverPort}`),
      },
      {
        label: '复制局域网地址',
        click: () => {
          clipboard.writeText(`http://${localIP}:${serverPort}`);
          tray.displayBalloon({ title: '已复制', content: `http://${localIP}:${serverPort}` });
        },
      },
      { type: 'separator' },
      {
        label: '退出系统',
        click: () => {
          try { saveNow(); } catch (_) {}
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  };

  updateMenu();

  // 单击托盘图标打开窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createStatusWindow(localIP);
    }
  });
}

function createStatusWindow(localIP) {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 380,
    resizable: false,
    title: '合同管理系统',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-status.js'),
    },
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #f5f7fa; color: #333; padding: 32px; user-select: text; }
  .status { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #52c41a; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .status span { font-size: 14px; color: #52c41a; font-weight: 600; }
  h2 { font-size: 20px; margin-bottom: 20px; color: #1677ff; }
  .url-box { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; margin-bottom: 12px; cursor: pointer; }
  .url-box:hover { border-color: #1677ff; }
  .label { font-size: 12px; color: #999; margin-bottom: 4px; }
  .url { font-size: 15px; font-weight: 500; color: #1677ff; word-break: break-all; }
  .hint { font-size: 13px; color: #666; margin-top: 20px; line-height: 1.8; }
  .btn { display: inline-block; margin-top: 16px; padding: 8px 20px; background: #1677ff; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .btn:hover { background: #4096ff; }
  .copy-tip { font-size: 11px; color: #999; float: right; }
</style>
</head>
<body>
  <div class="status"><div class="dot"></div><span>服务运行中</span></div>
  <h2>合同管理系统</h2>
  <div class="url-box" onclick="copyUrl('http://localhost:${serverPort}')">
    <div class="label">本机访问 <span class="copy-tip">点击复制</span></div>
    <div class="url">http://localhost:${serverPort}</div>
  </div>
  <div class="url-box" onclick="copyUrl('http://${localIP}:${serverPort}')">
    <div class="label">局域网地址 - 发给同事用这个 <span class="copy-tip">点击复制</span></div>
    <div class="url">http://${localIP}:${serverPort}</div>
  </div>
  <div class="hint">
    把局域网地址发给同事，在浏览器中打开即可使用。<br>
    关闭窗口后程序会在后台继续运行，右下角托盘图标可重新打开。
  </div>
  <button class="btn" id="openBtn">在浏览器中打开</button>
  <script>
    async function copyUrl(url) {
      try {
        await window.electronAPI.writeClipboard(url);
        alert('已复制: ' + url);
      } catch (e) {
        const range = document.createRange();
        range.selectNodeContents(event.currentTarget.querySelector('.url'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    document.getElementById('openBtn').addEventListener('click', function() {
      window.open('http://localhost:${serverPort}');
    });
  </script>
</body>
</html>`;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // 拦截 window.open 在外部浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭窗口时隐藏而非退出，服务继续在后台运行
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }

  // 优先级：192.168.x.x > 10.x.x.x > 其他 > 172.16-31.x.x（虚拟网卡）
  const isVirtual = (ip) => {
    const parts = ip.split('.').map(Number);
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  };

  const prioritized = candidates.sort((a, b) => {
    const aVirtual = isVirtual(a.address) ? 1 : 0;
    const bVirtual = isVirtual(b.address) ? 1 : 0;
    return aVirtual - bVirtual;
  });

  return prioritized.length > 0 ? prioritized[0].address : 'localhost';
}

// ========== App Lifecycle ==========
app.whenReady().then(async () => {
  log('应用开始启动...');
  log(`userData: ${app.getPath('userData')}`);
  log(`isDev: ${isDev}`);

  try {
    const { localIP } = await startServer();
    createTray(localIP);
    createStatusWindow(localIP);

    // 自动打开浏览器
    shell.openExternal(`http://localhost:${serverPort}`);
    log('应用启动完成');
  } catch (err) {
    log(`启动失败: ${err.message}`);
    log(`堆栈: ${err.stack}`);

    dialog.showErrorBox(
      '合同管理系统 - 启动失败',
      `错误信息: ${err.message}\n\n` +
      `日志文件: ${logPath}\n\n` +
      `请检查日志文件获取详细信息，或截图反馈。`
    );
    app.quit();
  }
});

// 窗口全部关闭时不退出程序，服务继续在后台运行
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// 退出前保存数据库（兜底，防止中间件未触发的写操作丢失）
app.on('before-quit', () => {
  app.isQuitting = true;
  try {
    const dbModule = require(path.join(__dirname, '../server/database'));
    if (dbModule.saveNow) dbModule.saveNow();
  } catch (_) {}
});
