const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, saveNow } = require('./database');
const { setupRoutes } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 每个 API 请求结束后统一保存数据库到磁盘（必须在路由注册之前）
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    try { saveNow(); } catch (e) { console.error('数据库保存失败:', e.message); }
  });
  next();
});

// API routes
setupRoutes(app);

// Serve static frontend in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// SPA fallback - any non-API route returns index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

async function start() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  合同管理系统服务已启动`);
    console.log(`  本机访问: http://localhost:${PORT}`);
    console.log(`  局域网访问: http://${getLocalIP()}:${PORT}\n`);
    console.log(`  把上面的局域网地址发给同事即可使用\n`);
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

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});

// 进程退出前保存数据库
process.on('SIGINT', () => { try { saveNow(); } catch (_) {} process.exit(); });
process.on('SIGTERM', () => { try { saveNow(); } catch (_) {} process.exit(); });
process.on('beforeExit', () => { try { saveNow(); } catch (_) {} });
