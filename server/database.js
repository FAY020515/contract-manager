const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 数据库存储路径：
// - 打包 Electron: exe 同级 data/ 目录（避免 AppData 被企业策略清理）
// - 开发模式 / 纯 Web: 项目根目录 data/
function getDataDir() {
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      const exeDir = path.join(path.dirname(process.execPath), 'data');
      // 检查 exe 同级目录是否可写（装在 Program Files 下可能不行）
      try {
        if (!fs.existsSync(exeDir)) fs.mkdirSync(exeDir, { recursive: true });
        fs.accessSync(exeDir, fs.constants.W_OK);
        return exeDir;
      } catch (_) {
        // 不可写，回退到 AppData
        return path.join(app.getPath('userData'), 'data');
      }
    }
    return path.join(__dirname, '../data');
  } catch (_) {
    return path.join(__dirname, '../data');
  }
}

// 旧版数据目录（AppData），用于自动迁移
function getLegacyDataDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'data');
  } catch (_) {
    return null;
  }
}

const DB_DIR = getDataDir();
const DB_PATH = path.join(DB_DIR, 'contracts.db');

let db = null;

// 递归复制目录
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function initDatabase() {
  // 显式指定 WASM 文件路径，确保 asar 环境中能正确加载
  const sqlWasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmPath,
  });

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // 自动迁移：旧版数据在 AppData，新版存在 exe 旁边
  if (!fs.existsSync(DB_PATH)) {
    try {
      const legacyDir = getLegacyDataDir();
      const legacyDB = legacyDir ? path.join(legacyDir, 'contracts.db') : null;
      if (legacyDB && fs.existsSync(legacyDB)) {
        fs.copyFileSync(legacyDB, DB_PATH);
        // 同时迁移上传目录
        const legacyUploads = path.join(legacyDir, 'uploads');
        if (fs.existsSync(legacyUploads)) {
          const newUploads = path.join(DB_DIR, 'uploads');
          if (!fs.existsSync(newUploads)) {
            fs.mkdirSync(newUploads, { recursive: true });
          }
          copyDirSync(legacyUploads, newUploads);
        }
        console.log('  已从旧目录迁移数据:', legacyDB);
      }
    } catch (e) {
      console.log('  旧数据迁移失败（不影响使用）:', e.message);
    }
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  seedDefaults();
  ensureAdminUser();
  saveToDisk();
  console.log('  数据库已就绪:', DB_PATH);
}

function saveToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ========== SQL Helpers ==========

function sanitizeParams(params) {
  return (params || []).map(v => (v === undefined ? null : v));
}

function queryAll(sql, params = []) {
  if (!db) return [];
  const safeParams = sanitizeParams(params);
  const stmt = db.prepare(sql);
  if (safeParams.length > 0) stmt.bind(safeParams);
  const results = [];
  while (stmt.step()) {
    const columns = stmt.getColumnNames();
    const row = stmt.get();
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    results.push(obj);
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSql(sql, params = []) {
  if (!db) return;
  db.run(sql, sanitizeParams(params));
}

// ========== Schema ==========

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_no TEXT UNIQUE,
      title TEXT NOT NULL,
      type TEXT DEFAULT '其他',
      party_a TEXT,
      party_b TEXT,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'CNY',
      sign_date TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT '草稿',
      department TEXT,
      person_in_charge TEXT,
      description TEXT,
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      contract_title TEXT,
      remind_date TEXT,
      remind_type TEXT DEFAULT '到期提醒',
      message TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS contract_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      action TEXT,
      detail TEXT,
      operator TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      uploader TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      department TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
}

function seedDefaults() {
  const existing = queryOne("SELECT value FROM settings WHERE key = 'contract_types'");
  if (!existing) {
    runSql("INSERT INTO settings (key, value) VALUES ('contract_types', ?)",
      [JSON.stringify(['采购', '销售', '服务', '租赁', '劳动', '其他'])]);
    runSql("INSERT INTO settings (key, value) VALUES ('departments', ?)",
      [JSON.stringify(['行政部', '财务部', '技术部', '销售部', '采购部', '人事部', '法务部'])]);
    runSql("INSERT INTO settings (key, value) VALUES ('reminder_days', ?)",
      [JSON.stringify([7, 15, 30])]);
  }
}

function ensureAdminUser() {
  try {
    const { hash, salt } = hashPassword('admin123');

    // 检查 admin 用户是否存在
    const adminUser = queryOne("SELECT id, username FROM users WHERE username = 'admin'");
    if (adminUser) {
      // 强制重置密码和激活状态，确保默认凭据可用
      runSql("UPDATE users SET password_hash = ?, salt = ?, active = 1, role = 'admin' WHERE username = 'admin'",
        [hash, salt]);
      console.log('  管理员密码已重置 (admin/admin123)');
    } else {
      // 创建新管理员
      runSql("INSERT INTO users (username, password_hash, salt, display_name, role) VALUES (?, ?, ?, ?, ?)",
        ['admin', hash, salt, '系统管理员', 'admin']);
      console.log('  默认管理员已创建 (admin/admin123)');
    }
  } catch (e) {
    console.error('  管理账号初始化失败:', e.message, e.stack);
  }
}

// ========== Contract Operations ==========

function getContracts(filters = {}) {
  let where = '1=1';
  const params = [];

  if (filters.keyword) {
    where += ' AND (title LIKE ? OR contract_no LIKE ? OR party_a LIKE ? OR party_b LIKE ?)';
    const kw = `%${filters.keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  if (filters.type) { where += ' AND type = ?'; params.push(filters.type); }
  if (filters.status) { where += ' AND status = ?'; params.push(filters.status); }
  if (filters.department) { where += ' AND department = ?'; params.push(filters.department); }
  if (filters.startDate) { where += ' AND sign_date >= ?'; params.push(filters.startDate); }
  if (filters.endDate) { where += ' AND sign_date <= ?'; params.push(filters.endDate); }

  const page = parseInt(filters.page) || 1;
  const pageSize = parseInt(filters.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  const total = queryOne(`SELECT COUNT(*) as count FROM contracts WHERE ${where}`, params)?.count || 0;
  const data = queryAll(
    `SELECT * FROM contracts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { data, total };
}

function getContractById(id) {
  return queryOne('SELECT * FROM contracts WHERE id = ?', [id]);
}

function createContract(c) {
  runSql(`
    INSERT INTO contracts (contract_no, title, type, party_a, party_b, amount, currency,
      sign_date, start_date, end_date, status, department, person_in_charge, description, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    c.contract_no || null, c.title, c.type || '其他', c.party_a || null, c.party_b || null,
    c.amount || 0, c.currency || 'CNY',
    c.sign_date || null, c.start_date || null, c.end_date || null,
    c.status || '草稿', c.department || null, c.person_in_charge || null,
    c.description || null, c.file_path || null
  ]);

  const row = queryOne('SELECT last_insert_rowid() as id');
  const contractId = row ? row.id : 0;

  // Log
  runSql('INSERT INTO contract_logs (contract_id, action, detail, operator) VALUES (?, ?, ?, ?)',
    [contractId, '创建', '创建合同', c.person_in_charge || '系统']);

  // Auto-create expiry reminder
  if (c.end_date) {
    const remindDate = new Date(c.end_date);
    remindDate.setDate(remindDate.getDate() - 7);
    const remindStr = remindDate.toISOString().slice(0, 10);
    runSql(`
      INSERT INTO reminders (contract_id, contract_title, remind_date, remind_type, message)
      VALUES (?, ?, ?, '到期提醒', ?)
    `, [contractId, c.title, remindStr, `合同「${c.title}」将于 ${c.end_date} 到期，请及时处理。`]);
  }

  // 回查确认合同存在，返回完整对象
  const created = getContractById(contractId);
  return created || { id: contractId };
}

function updateContract(id, c) {
  runSql(`
    UPDATE contracts SET contract_no=?, title=?, type=?, party_a=?, party_b=?, amount=?, currency=?,
      sign_date=?, start_date=?, end_date=?, status=?, department=?, person_in_charge=?,
      description=?, file_path=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `, [
    c.contract_no || null, c.title, c.type, c.party_a || null, c.party_b || null,
    c.amount || 0, c.currency || 'CNY',
    c.sign_date || null, c.start_date || null, c.end_date || null,
    c.status, c.department || null, c.person_in_charge || null,
    c.description || null, c.file_path || null, id
  ]);

  runSql('INSERT INTO contract_logs (contract_id, action, detail, operator) VALUES (?, ?, ?, ?)',
    [id, '更新', '更新合同信息', c.person_in_charge || '系统']);
}

function deleteContract(id) {
  runSql('DELETE FROM reminders WHERE contract_id = ?', [id]);
  runSql('DELETE FROM contract_logs WHERE contract_id = ?', [id]);
  runSql('DELETE FROM contracts WHERE id = ?', [id]);
}

// ========== Reminders ==========

function getReminders(filters = {}) {
  let where = '1=1';
  const params = [];
  if (filters.status) { where += ' AND status = ?'; params.push(filters.status); }
  if (filters.date) { where += ' AND remind_date = ?'; params.push(filters.date); }
  return queryAll(`SELECT * FROM reminders WHERE ${where} ORDER BY remind_date ASC`, params);
}

function getUpcomingReminders(days) {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date();
  future.setDate(future.getDate() + days);
  const futureStr = future.toISOString().slice(0, 10);
  return queryAll(`
    SELECT r.*, c.contract_no, c.end_date as contract_end_date
    FROM reminders r
    LEFT JOIN contracts c ON r.contract_id = c.id
    WHERE r.remind_date >= ? AND r.remind_date <= ? AND r.status = 'pending'
    ORDER BY r.remind_date ASC
  `, [today, futureStr]);
}

function updateReminderStatus(id, status) {
  runSql('UPDATE reminders SET status = ? WHERE id = ?', [status, id]);
}

// ========== Logs ==========

function getLogsByContract(contractId) {
  return queryAll('SELECT * FROM contract_logs WHERE contract_id = ? ORDER BY created_at DESC', [contractId]);
}

// ========== Statistics ==========

function getDashboardStats() {
  const total = queryOne('SELECT COUNT(*) as count FROM contracts')?.count || 0;
  const thisMonth = queryOne(
    "SELECT COUNT(*) as count FROM contracts WHERE strftime('%Y-%m', sign_date) = strftime('%Y-%m', 'now', 'localtime')"
  )?.count || 0;
  const active = queryOne("SELECT COUNT(*) as count FROM contracts WHERE status = '执行中'")?.count || 0;

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  const expiringSoon = queryOne(
    "SELECT COUNT(*) as count FROM contracts WHERE end_date >= ? AND end_date <= ? AND status = '执行中'",
    [today, soonStr]
  )?.count || 0;

  const totalAmount = queryOne(
    "SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE status = '执行中'"
  )?.total || 0;

  return { total, thisMonth, active, expiringSoon, totalAmount };
}

function getStatsByType() {
  return queryAll(
    "SELECT type, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM contracts GROUP BY type ORDER BY count DESC"
  );
}

function getStatsByDepartment() {
  return queryAll(
    "SELECT department, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM contracts GROUP BY department ORDER BY count DESC"
  );
}

function getMonthlyTrend() {
  return queryAll(`
    SELECT strftime('%Y-%m', sign_date) as month, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
    FROM contracts WHERE sign_date IS NOT NULL
    GROUP BY strftime('%Y-%m', sign_date)
    ORDER BY month DESC LIMIT 12
  `).reverse();
}

function getAmountDistribution() {
  return queryAll(`
    SELECT
      CASE
        WHEN amount < 10000 THEN '1万以下'
        WHEN amount < 100000 THEN '1-10万'
        WHEN amount < 500000 THEN '10-50万'
        WHEN amount < 1000000 THEN '50-100万'
        ELSE '100万以上'
      END as range_name,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total_amount
    FROM contracts
    GROUP BY range_name
    ORDER BY MIN(amount)
  `);
}

// ========== Settings ==========

function getSetting(key) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(key, value) {
  const strValue = typeof value === 'string' ? value : JSON.stringify(value);
  const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    runSql('UPDATE settings SET value = ? WHERE key = ?', [strValue, key]);
  } else {
    runSql('INSERT INTO settings (key, value) VALUES (?, ?)', [key, strValue]);
  }
}

function getAllSettings() {
  const rows = queryAll('SELECT key, value FROM settings');
  const result = {};
  rows.forEach(r => {
    try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; }
  });
  return result;
}

// ========== Backup ==========

function exportBackup(filePath) {
  if (!db) return false;
  const data = db.export();
  fs.writeFileSync(filePath, Buffer.from(data));
  return true;
}

function getDbPath() {
  return DB_PATH;
}

function getUploadsDir() {
  return path.join(DB_DIR, 'uploads');
}

// ========== Attachments ==========

function getAttachmentsByContract(contractId) {
  return queryAll('SELECT * FROM attachments WHERE contract_id = ? ORDER BY created_at DESC', [contractId]);
}

function getAttachmentById(id) {
  return queryOne('SELECT * FROM attachments WHERE id = ?', [id]);
}

function createAttachment(contractId, filename, originalName, mimeType, size, uploader) {
  runSql(`
    INSERT INTO attachments (contract_id, filename, original_name, mime_type, size, uploader)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [contractId, filename, originalName, mimeType || 'application/octet-stream', size || 0, uploader || null]);
  const row = queryOne('SELECT last_insert_rowid() as id');
  return row ? row.id : 0;
}

function deleteAttachment(id) {
  const att = queryOne('SELECT * FROM attachments WHERE id = ?', [id]);
  runSql('DELETE FROM attachments WHERE id = ?', [id]);
  // 删除磁盘上的文件
  if (att) {
    const filePath = path.join(getUploadsDir(), att.filename);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
  }
  return att;
}

function deleteAttachmentsByContract(contractId) {
  const atts = queryAll('SELECT * FROM attachments WHERE contract_id = ?', [contractId]);
  runSql('DELETE FROM attachments WHERE contract_id = ?', [contractId]);
  const uploadsDir = getUploadsDir();
  for (const att of atts) {
    try {
      const filePath = path.join(uploadsDir, att.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }
}

function getAttachmentCountByContract(contractId) {
  const row = queryOne('SELECT COUNT(*) as count FROM attachments WHERE contract_id = ?', [contractId]);
  return row ? row.count : 0;
}

// ========== Password Hashing ==========

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const testHash = crypto.createHash('sha256').update(salt + password).digest('hex');
  if (testHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(storedHash));
}

// ========== User Operations ==========

function getUserByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
}

function getUserById(id) {
  const user = queryOne('SELECT * FROM users WHERE id = ?', [id]);
  if (user) { delete user.password_hash; delete user.salt; }
  return user;
}

function getAllUsers() {
  const users = queryAll('SELECT id, username, display_name, role, department, active, created_at FROM users ORDER BY created_at ASC');
  return users;
}

function createUser(username, password, displayName, role, department) {
  const { hash, salt } = hashPassword(password);
  runSql(`
    INSERT INTO users (username, password_hash, salt, display_name, role, department)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [username, hash, salt, displayName || username, role || 'user', department || null]);
  const row = queryOne('SELECT last_insert_rowid() as id');
  return row ? row.id : 0;
}

function updateUser(id, updates) {
  const fields = [];
  const params = [];

  if (updates.display_name !== undefined) { fields.push('display_name = ?'); params.push(updates.display_name); }
  if (updates.role !== undefined) { fields.push('role = ?'); params.push(updates.role); }
  if (updates.department !== undefined) { fields.push('department = ?'); params.push(updates.department); }
  if (updates.active !== undefined) { fields.push('active = ?'); params.push(updates.active ? 1 : 0); }
  if (updates.password) {
    const { hash, salt } = hashPassword(updates.password);
    fields.push('password_hash = ?'); params.push(hash);
    fields.push('salt = ?'); params.push(salt);
  }

  if (fields.length === 0) return false;
  params.push(id);
  runSql(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  return true;
}

function deleteUser(id) {
  // 不允许删除最后一个管理员
  const user = queryOne('SELECT role FROM users WHERE id = ?', [id]);
  if (user && user.role === 'admin') {
    const adminCount = queryOne("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1");
    if (adminCount && adminCount.count <= 1) return false;
  }
  runSql('UPDATE users SET active = 0 WHERE id = ?', [id]);
  return true;
}

function authenticateUser(username, password) {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash, user.salt)) return null;
  // 返回不含敏感信息的用户对象
  const { password_hash, salt, ...safeUser } = user;
  return safeUser;
}

// ========== Simple Token (JWT-like) ==========
const TOKEN_SECRET = crypto.randomBytes(32).toString('hex');

function generateToken(user) {
  const payload = JSON.stringify({ id: user.id, username: user.username, role: user.role, exp: Date.now() + 24 * 60 * 60 * 1000 });
  const encoded = Buffer.from(payload).toString('base64');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('hex');
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    if (payload.exp < Date.now()) return null;
    // 验证用户仍然有效
    const user = queryOne('SELECT id, username, display_name, role, department FROM users WHERE id = ? AND active = 1', [payload.id]);
    return user;
  } catch (_) {
    return null;
  }
}

function saveNow() {
  saveToDisk();
}

module.exports = {
  initDatabase, getDbPath, getUploadsDir, saveNow,
  getContracts, getContractById, createContract, updateContract, deleteContract,
  getReminders, getUpcomingReminders, updateReminderStatus,
  getLogsByContract,
  getDashboardStats, getStatsByType, getStatsByDepartment, getMonthlyTrend, getAmountDistribution,
  getSetting, setSetting, getAllSettings,
  getAttachmentsByContract, getAttachmentById, createAttachment, deleteAttachment,
  deleteAttachmentsByContract, getAttachmentCountByContract,
  authenticateUser, generateToken, verifyToken,
  getUserById, getAllUsers, createUser, updateUser, deleteUser,
  exportBackup,
};
