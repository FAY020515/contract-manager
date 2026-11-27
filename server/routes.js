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
      // multer 默认用 latin1 解码文件名，中文需要转回 UTF-8
      const realName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(realName);
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

  // 把数据库的英文约束错误翻成人话
  function translateContractError(e, contractNo) {
    const msg = String((e && e.message) || '');
    if (msg.includes('UNIQUE constraint failed: contracts.contract_no')) {
      return `合同编号${contractNo ? `「${contractNo}」` : ''}已存在，请换一个`;
    }
    return msg;
  }

  // 校验合同的基础字段：名称必填、金额必须是负数以外的数字
  function validateContractInput(body) {
    if (!body || !String(body.title || '').trim()) return '合同名称不能为空';
    if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
      const n = Number(body.amount);
      if (!Number.isFinite(n)) return '合同金额必须是数字';
      if (n < 0) return '合同金额不能为负数';
    }
    return null;
  }

  // Excel 导入的日期容错：支持 2026-01-05、2026/1/5、Excel 日期序列号、带时间的 ISO 串
  function normalizeDateValue(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v > 20000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 86400000));
        return d.toISOString().slice(0, 10);
      }
      return null;
    }
    const s = String(v).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return null;
  }

  // 金额容错：允许千分位、货币符号与"元"字；无法识别时返回 null
  function parseAmountValue(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const cleaned = String(v).replace(/[,，\s¥￥元]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  // ========== Auth Middleware ==========
  // 公开路由不需要鉴权（路径相对于 /api 挂载点）
  const PUBLIC_EXACT = ['/auth/login', '/health'];
  const PUBLIC_PREFIX = ['/auth/login/', '/health/'];
  // 附件预览与下载由浏览器直接打开链接，不会带 Authorization 头，因此只放行只读方法。
  // 改之前整段 /attachments/ 免鉴权，导致任何人不带令牌就能 DELETE 删除附件。
  const PUBLIC_READ_PREFIX = ['/attachments/'];

  app.use('/api', (req, res, next) => {
    const readonly = req.method === 'GET' || req.method === 'HEAD';
    // 放行公开路由
    const isPublic = PUBLIC_EXACT.includes(req.path) ||
      PUBLIC_PREFIX.some(p => req.path.startsWith(p)) ||
      (readonly && PUBLIC_READ_PREFIX.some(p => req.path.startsWith(p)));
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
      res.json({ token, user: { ...user, usingDefaultPassword: db.isUsingDefaultPassword(user.username) } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: { ...req.user, usingDefaultPassword: db.isUsingDefaultPassword(req.user.username) } });
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
      // 最后一位在职管理员不能被降级或停用，否则系统将无人可管用户与备份
      const target = db.getUserById(targetId);
      const willLoseAdmin = !!target && target.role === 'admin' &&
        ((updates.role !== undefined && updates.role !== 'admin') ||
         (updates.active !== undefined && !updates.active));
      if (willLoseAdmin && db.countActiveAdmins() <= 1) {
        return res.status(400).json({ error: '这是最后一位管理员，不能降级或停用' });
      }
      db.updateUser(targetId, updates);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });  app.delete('/api/users/:id', (req, res) => {
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
        const rowNo = i + 2; // Excel 行号（第一行是表头）
        try {
          const row = contracts[i];
          // 金额：允许千分位、"元"等写法；识别不了就明确报这一行
          const rawAmount = row['合同金额'] !== undefined ? row['合同金额'] : row.amount;
          const amount = parseAmountValue(rawAmount);
          if (amount === null) {
            results.errors.push({ row: rowNo, error: `合同金额无法识别：${rawAmount}` });
            results.failed++;
            continue;
          }
          if (amount < 0) {
            results.errors.push({ row: rowNo, error: '合同金额不能为负数' });
            results.failed++;
            continue;
          }
          // 日期：兼容 Excel 日期单元格与 2026/1/5 这类写法
          const dates = {};
          let dateError = null;
          for (const [cn, en] of [['签订日期', 'sign_date'], ['生效日期', 'start_date'], ['到期日期', 'end_date']]) {
            const raw = row[cn] !== undefined ? row[cn] : row[en];
            const normalized = normalizeDateValue(raw);
            if (raw !== undefined && raw !== null && raw !== '' && normalized === null) {
              dateError = `${cn}格式无法识别：${raw}`;
              break;
            }
            dates[en] = normalized;
          }
          if (dateError) {
            results.errors.push({ row: rowNo, error: dateError });
            results.failed++;
            continue;
          }

          // 字段映射：中文名 → 数据库字段
          const contract = {
            contract_no: row['合同编号'] || row.contract_no || null,
            title: row['合同名称'] || row.title,
            type: row['合同类型'] || row.type || '其他',
            party_a: row['甲方'] || row.party_a || null,
            party_b: row['乙方'] || row.party_b || null,
            amount,
            currency: row['币种'] || row.currency || 'CNY',
            sign_date: dates.sign_date,
            start_date: dates.start_date,
            end_date: dates.end_date,
            status: row['状态'] || row.status || '草稿',
            department: row['所属部门'] || row.department || null,
            person_in_charge: row['负责人'] || row.person_in_charge || null,
            description: row['合同摘要'] || row.description || null,
          };

          if (!String(contract.title || '').trim()) {
            results.errors.push({ row: rowNo, error: '合同名称不能为空' });
            results.failed++;
            continue;
          }

          db.createContract(contract, req.user.display_name || req.user.username);
          results.success++;
        } catch (e) {
          results.errors.push({ row: rowNo, error: translateContractError(e, contracts[i] && (contracts[i]['合同编号'] || contracts[i].contract_no)) });
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
      const invalid = validateContractInput(req.body);
      if (invalid) return res.status(400).json({ error: invalid });
      const operator = req.user.display_name || req.user.username;
      const contract = db.createContract(req.body, operator);
      res.json(contract);
    } catch (e) {
      const friendly = translateContractError(e, req.body && req.body.contract_no);
      const status = friendly !== (e && e.message) ? 400 : 500;
      res.status(status).json({ error: friendly });
    }
  });

  app.put('/api/contracts/:id', (req, res) => {
    try {
      const invalid = validateContractInput(req.body);
      if (invalid) return res.status(400).json({ error: invalid });
      const operator = req.user.display_name || req.user.username;
      db.updateContract(Number(req.params.id), req.body, operator);
      res.json({ success: true });
    } catch (e) {
      const friendly = translateContractError(e, req.body && req.body.contract_no);
      const status = friendly !== (e && e.message) ? 400 : 500;
      res.status(status).json({ error: friendly });
    }
  });

  // 修改审批状态：线下纸质审批，系统只记录结果与经手人
  app.put('/api/contracts/:id/approval', (req, res) => {
    try {
      const status = req.body && req.body.status;
      const result = db.setApprovalStatus(Number(req.params.id), status, req.user.display_name || req.user.username);
      if (!result.ok) {
        return res.status(result.error === '合同不存在' ? 404 : 400).json({ error: result.error });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/contracts/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足：删除合同需要管理员权限' });
    try {
      const id = Number(req.params.id);
      const contract = db.getContractById(id);
      if (!contract) return res.status(404).json({ error: '合同不存在' });
      // 删除会连带删掉附件与全部日志，要求提交的编号与库中一致，挡住点错行
      const confirmNo = String(req.query.confirm_no || '').trim();
      if (confirmNo !== contract.contract_no) {
        return res.status(400).json({ error: `删除已取消：请准确填写合同编号「${contract.contract_no}」` });
      }
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
      // 操作人以令牌里的登录者为准，不采信请求体里自报的名字
      const operator = req.user.display_name || req.user.username;
      // category=approval 表示审批单扫描件，与合同附件分开展示
      const category = req.body && req.body.category === 'approval' ? 'approval' : 'contract';
      for (const file of (req.files || [])) {
        // multer 用 latin1 解码了文件名，需要转回 UTF-8
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const id = db.createAttachment(
          contractId,
          file.filename,
          originalName,
          file.mimetype,
          file.size,
          operator,
          category
        );
        results.push({ id, filename: file.filename, original_name: originalName });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足：删除附件需要管理员权限' });
    try {
      db.deleteAttachment(Number(req.params.id), req.user.display_name || req.user.username);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Payments ==========

  // 获取合同的收付款记录
  app.get('/api/contracts/:id/payments', (req, res) => {
    try {
      const payments = db.getPaymentsByContract(Number(req.params.id));
      res.json(payments);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取合同收付款汇总
  app.get('/api/contracts/:id/payments/summary', (req, res) => {
    try {
      const summary = db.getPaymentSummary(Number(req.params.id));
      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 新增收付款记录
  app.post('/api/contracts/:id/payments', (req, res) => {
    try {
      const contractId = Number(req.params.id);
      const id = db.createPayment(contractId, req.body, req.user.display_name || req.user.username);
      res.json({ id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 更新收付款记录
  app.put('/api/payments/:id', (req, res) => {
    try {
      db.updatePayment(Number(req.params.id), req.body, req.user.display_name || req.user.username);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 删除收付款记录（会改动金额与已发生额，仅管理员）
  app.delete('/api/payments/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足：删除收付款记录需要管理员权限' });
    try {
      db.deletePayment(Number(req.params.id), req.user.display_name || req.user.username);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 上传收付款附件
  app.post('/api/payments/:id/attachment', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未选择文件' });
      }
      // multer 用 latin1 解码了文件名，需要转回 UTF-8
      const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const paymentId = Number(req.params.id);
      const previous = db.getPaymentById(paymentId);
      // 更新付款记录的附件字段
      db.updatePayment(paymentId, {
        attachment: req.file.filename,
        attachment_name: originalName
      });
      const operator = req.user.display_name || req.user.username;
      if (previous) {
        if (previous.attachment_name) {
          db.addContractLog(previous.contract_id, '更换',
            `更换收付款凭证：${previous.attachment_name} → ${originalName}`, operator);
        } else {
          db.addContractLog(previous.contract_id, '上传', `上传收付款凭证：${originalName}`, operator);
        }
      }
      res.json({
        filename: req.file.filename,
        original_name: originalName
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 删除收付款附件
  app.delete('/api/payments/:id/attachment', (req, res) => {
    try {
      const payment = db.getPaymentById(Number(req.params.id));
      if (payment && payment.attachment) {
        // 删除物理文件
        const filePath = path.join(db.getUploadsDir(), payment.attachment);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      // 清除付款记录的附件字段
      db.updatePayment(Number(req.params.id), {
        attachment: null,
        attachment_name: null
      });
      if (payment && payment.attachment_name) {
        db.addContractLog(payment.contract_id, '删除',
          `删除收付款凭证：${payment.attachment_name}`, req.user.display_name || req.user.username);
      }
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
  // 备份可导出/覆盖整个数据库，仅限管理员操作（与 /api/users 同一约定）

  app.post('/api/backup/export', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
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

  app.post('/api/backup/import', upload.single('file'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未选择文件' });
      }
      const result = db.importBackup(req.file.path);
      // 清理上传的临时文件
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      if (result.success) {
        res.json({ success: true, restoreFile: result.restoreFile });
      } else {
        res.status(400).json({ error: result.error || '导入失败' });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Auto Backup Config ==========

  app.get('/api/backup/auto-config', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const config = db.getAutoBackupConfig();
      res.json({ ...config, defaultDir: db.DEFAULT_BACKUP_DIR });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/backup/auto-config', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const config = db.setAutoBackupConfig(req.body || {});
      res.json({ success: true, config });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/backup/auto-trigger', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const result = db.performAutoBackup();
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 列出某个目录里的备份单元（默认列出本机备份目录）
  app.get('/api/backup/units', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const result = db.listBackupUnits(req.query.dir);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 把一份完整备份（台账+附件）直接写到指定目录，供插着 U 盘时带走
  app.post('/api/backup/full-export', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const result = db.exportFullBackupTo((req.body && req.body.destDir) || '');
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 从备份单元一键恢复台账与附件
  app.post('/api/backup/restore', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    try {
      const source = req.body && req.body.source;
      if (!source) return res.status(400).json({ error: '未选择要恢复的备份' });
      const result = db.restoreFromUnit(source);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ========== Health Check ==========

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
}

module.exports = { setupRoutes };
