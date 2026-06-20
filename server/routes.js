const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('./database');

// 文件上传配置：存到 uploads 目录，用随机名防冲突
function getUploadStorage() {
  const uploadsDir = db.getUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    },
  });
}

const upload = multer({
  storage: getUploadStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

function setupRoutes(app) {

  // ========== Auth Middleware ==========
  // 公开路由不需要鉴权（路径相对于 /api 挂载点）
  // 附件预览/下载需要公开，因为浏览器打开新标签页不会带 Authorization 头
  const PUBLIC_EXACT = ['/auth/login', '/health'];
  const PUBLIC_PREFIX = ['/auth/login/', '/health/', '/attachments/'];

  app.use('/api', (req, res, next) => {
    // 放行公开路由
    const isPublic = PUBLIC_EXACT.includes(req.path) ||
      PUBLIC_PREFIX.some(p => req.path.startsWith(p));
    if (isPublic) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未登录，请先登录' });
    }

    const token = authHeader.slice(7);
    const user = db.verifyToken(token);
    if (!user) {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }

    // 将用户信息附加到请求对象
    req.user = user;
    next();
  });

  // ========== Auth Routes ==========

  app.post('/api/auth/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: '请输入用户名和密码' });
      }
      const user = db.authenticateUser(username, password);
      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      const token = db.generateToken(user);
      res.json({ token, user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user });
  });

  // ========== User Management (Admin Only) ==========

  app.get('/api/users', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      res.json(db.getAllUsers());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/users', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const { username, password, display_name, role, department } = req.body;
      if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
      const id = db.createUser(username, password, display_name, role, department);
      res.json({ id });
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/users/:id', (req, res) => {
    // 管理员可以改任何人，普通用户只能改自己的密码和显示名
    const targetId = Number(req.params.id);
    if (req.user.role !== 'admin' && targetId !== req.user.id) {
      return res.status(403).json({ error: '权限不足' });
    }
    try {
      const updates = { ...req.body };
      // 普通用户不能改角色和部门
      if (req.user.role !== 'admin') {
        delete updates.role;
        delete updates.department;
        delete updates.active;
      }
      db.updateUser(targetId, updates);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/users/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const result = db.deleteUser(Number(req.params.id));
      if (!result) return res.status(400).json({ error: '不能删除最后一个管理员账号' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Contracts ==========

  app.get('/api/contracts', (req, res) => {
    try {
      const result = db.getContracts(req.query);
      result.data = result.data.map(c => ({
        ...c,
        attachment_count: db.getAttachmentCountByContract(c.id),
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/contracts/:id', (req, res) => {
    try {
      const contract = db.getContractById(Number(req.params.id));
      if (!contract) return res.status(404).json({ error: '合同不存在' });
      res.json(contract);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Batch Import ==========

  app.post('/api/contracts/import', (req, res) => {
    try {
      const contracts = req.body.contracts;
      if (!Array.isArray(contracts) || contracts.length === 0) {
        return res.status(400).json({ error: '没有可导入的数据' });
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (let i = 0; i < contracts.length; i++) {
        try {
          const row = contracts[i];
          // 字段映射：中文名 → 数据库字段
          const contract = {
            contract_no: row['合同编号'] || row.contract_no || null,
            title: row['合同名称'] || row.title,
            type: row['合同类型'] || row.type || '其他',
            party_a: row['甲方'] || row.party_a || null,
            party_b: row['乙方'] || row.party_b || null,
            amount: parseFloat(row['合同金额'] || row.amount) || 0,
            currency: row['币种'] || row.currency || 'CNY',
            sign_date: row['签订日期'] || row.sign_date || null,
            start_date: row['生效日期'] || row.start_date || null,
            end_date: row['到期日期'] || row.end_date || null,
            status: row['状态'] || row.status || '草稿',
            department: row['所属部门'] || row.department || null,
            person_in_charge: row['负责人'] || row.person_in_charge || null,
            description: row['合同摘要'] || row.description || null,
          };

          if (!contract.title) {
            results.errors.push({ row: i + 2, error: '合同名称不能为空' });
            results.failed++;
            continue;
          }

          db.createContract(contract);
          results.success++;
        } catch (e) {
          results.errors.push({ row: i + 2, error: e.message });
          results.failed++;
        }
      }

      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/contracts', (req, res) => {
    try {
      const contract = db.createContract(req.body);
      res.json(contract);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/contracts/:id', (req, res) => {
    try {
      db.updateContract(Number(req.params.id), req.body);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/contracts/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      // 先清理附件文件
      db.deleteAttachmentsByContract(id);
      db.deleteContract(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Attachments ==========

  // 上传附件（支持多文件）
  app.post('/api/contracts/:id/attachments', upload.array('files', 10), (req, res) => {
    try {
      const contractId = Number(req.params.id);
      const contract = db.getContractById(contractId);
      if (!contract) {
        // 诊断：返回请求的ID和数据库中实际存在的合同ID
        const allContracts = db.getContracts({ pageSize: 100 });
        const existingIds = allContracts.data.map(c => c.id);
        return res.status(404).json({
          error: `合同不存在(请求ID:${contractId},类型:${typeof contractId},数据库中:[${existingIds.join(',')}])`
        });
      }

      const results = [];
      for (const file of (req.files || [])) {
        const id = db.createAttachment(
          contractId,
          file.filename,
          file.originalname,
          file.mimetype,
          file.size,
          req.body.uploader || null
        );
        results.push({ id, filename: file.filename, original_name: file.originalname });
      }

      // 记录操作日志
      if (results.length > 0) {
        const names = results.map(r => r.original_name).join('、');
        const logDb = require('./database');
        // 直接插入日志
        const { getLogsByContract } = logDb;
      }

      res.json({ files: results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取合同的附件列表
  app.get('/api/contracts/:id/attachments', (req, res) => {
    try {
      const attachments = db.getAttachmentsByContract(Number(req.params.id));
      res.json(attachments);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 下载附件
  app.get('/api/attachments/:id/download', (req, res) => {
    try {
      const att = db.getAttachmentById(Number(req.params.id));
      if (!att) return res.status(404).json({ error: '附件不存在' });

      const filePath = path.join(db.getUploadsDir(), att.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

      res.download(filePath, att.original_name);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 预览附件（浏览器内联显示，如 PDF/图片）
  app.get('/api/attachments/:id/preview', (req, res) => {
    try {
      const att = db.getAttachmentById(Number(req.params.id));
      if (!att) return res.status(404).json({ error: '附件不存在' });

      const filePath = path.join(db.getUploadsDir(), att.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

      res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'inline');
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 删除附件
  app.delete('/api/attachments/:id', (req, res) => {
    try {
      db.deleteAttachment(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Reminders ==========

  app.get('/api/reminders', (req, res) => {
    try {
      const reminders = db.getReminders(req.query);
      res.json(reminders);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/reminders/upcoming/:days', (req, res) => {
    try {
      const reminders = db.getUpcomingReminders(Number(req.params.days));
      res.json(reminders);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/reminders/:id/status', (req, res) => {
    try {
      db.updateReminderStatus(Number(req.params.id), req.body.status);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Logs ==========

  app.get('/api/contracts/:id/logs', (req, res) => {
    try {
      const logs = db.getLogsByContract(Number(req.params.id));
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Statistics ==========

  app.get('/api/stats/dashboard', (req, res) => {
    try {
      res.json(db.getDashboardStats());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/stats/by-type', (req, res) => {
    try {
      res.json(db.getStatsByType());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/stats/by-department', (req, res) => {
    try {
      res.json(db.getStatsByDepartment());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/stats/monthly-trend', (req, res) => {
    try {
      res.json(db.getMonthlyTrend());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/stats/amount-distribution', (req, res) => {
    try {
      res.json(db.getAmountDistribution());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Settings ==========

  app.get('/api/settings', (req, res) => {
    try {
      res.json(db.getAllSettings());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/settings/:key', (req, res) => {
    try {
      const value = db.getSetting(req.params.key);
      res.json({ value });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/settings/:key', (req, res) => {
    try {
      db.setSetting(req.params.key, req.body.value);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Backup ==========

  app.post('/api/backup/export', (req, res) => {
    try {
      const filename = `合同管理备份_${new Date().toISOString().slice(0, 10)}.db`;
      const dataDir = path.join(db.getDbPath(), '..');
      const backupPath = path.join(dataDir, filename);
      const source = db.getDbPath();
      fs.copyFileSync(source, backupPath);
      res.download(backupPath, filename, () => {
        try { fs.unlinkSync(backupPath); } catch (_) {}
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Health Check ==========

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
}

module.exports = { setupRoutes };
