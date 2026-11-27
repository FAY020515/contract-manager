const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 数据库存储路径：
// - 打包 Electron: AppData/userData（重装不丢数据）
// - 开发模式 / 纯 Web: 项目根目录 data/
function getDataDir() {
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'data');
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

// v1.0.x 的打包版把数据放在 exe 同级的 data 目录，而现在的打包版读用户数据目录，
// 老用户升级时数据只能从这里搬过来
function getExeSideDataDir() {
  try {
    const { app } = require('electron');
    if (!app.isPackaged) return null;
    return path.join(path.dirname(process.execPath), 'data');
  } catch (_) {
    return null;
  }
}

const DB_DIR = getDataDir();
const DB_PATH = path.join(DB_DIR, 'contracts.db');

let db = null;
let SQL_INSTANCE = null;

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
  SQL_INSTANCE = SQL;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // 目标库不存在时，按优先级从旧位置搬数据：先 exe 同级目录（v1.0.x 打包版），再 AppData
  if (!fs.existsSync(DB_PATH)) {
    const candidates = [getExeSideDataDir(), getLegacyDataDir()]
      .filter(d => d && path.resolve(d) !== path.resolve(DB_DIR));
    for (const legacyDir of candidates) {
      const legacyDB = path.join(legacyDir, 'contracts.db');
      if (!fs.existsSync(legacyDB)) continue;
      try {
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
      } catch (e) {
        console.log('  旧数据迁移失败（不影响使用）:', e.message);
      }
      break;
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

// 覆盖数据库文件必须走"同目录临时文件 + 改名"：直接 writeFileSync 会先清空原文件，
// 若进程在清空与写完之间被杀或断电，contracts.db 就只剩半个甚至空文件，服务再也起不来
function replaceFile(source, target) {
  const tmpPath = target + '.tmp';
  fs.copyFileSync(source, tmpPath);
  fs.renameSync(tmpPath, target);
}

function saveToDisk() {
  if (!db) return;
  const data = Buffer.from(db.export());
  const tmpPath = DB_PATH + '.tmp';
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, DB_PATH);
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

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT '支出',
      amount REAL NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL,
      status TEXT DEFAULT '待付',
      description TEXT,
      attachment TEXT,
      attachment_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `);

  // 迁移：为旧表添加 attachment_name 列
  try {
    runSql('ALTER TABLE payments ADD COLUMN attachment_name TEXT');
  } catch (e) {
    // 列已存在，忽略错误
  }
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
    // 检查 admin 用户是否存在
    const adminUser = queryOne("SELECT id, username FROM users WHERE username = 'admin'");
    if (adminUser) {
      // 已存在的账号只保证启用且为管理员；密码归使用者管理。
      // 每次启动都重置回默认值，等于让局域网里任何人都能用 admin/admin123 进来改数据。
      runSql("UPDATE users SET active = 1, role = 'admin' WHERE username = 'admin'", []);
      if (authenticateUser('admin', 'admin123')) {
        console.warn('  警告：管理员仍在使用默认密码 admin123，请登录后立即修改');
      }
    } else {
      // 首次启动才创建默认管理员
      const { hash, salt } = hashPassword('admin123');
      runSql('INSERT INTO users (username, password_hash, salt, display_name, role) VALUES (?, ?, ?, ?, ?)',
        ['admin', hash, salt, '系统管理员', 'admin']);
      console.log('  默认管理员已创建 (admin/admin123)，请首次登录后立即修改密码');
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
    where += ' AND (c.title LIKE ? OR c.contract_no LIKE ? OR c.party_a LIKE ? OR c.party_b LIKE ?)';
    const kw = `%${filters.keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  if (filters.type) { where += ' AND c.type = ?'; params.push(filters.type); }
  if (filters.status) { where += ' AND c.status = ?'; params.push(filters.status); }
  if (filters.department) { where += ' AND c.department = ?'; params.push(filters.department); }
  if (filters.startDate) { where += ' AND c.sign_date >= ?'; params.push(filters.startDate); }
  if (filters.endDate) { where += ' AND c.sign_date <= ?'; params.push(filters.endDate); }
  if (filters.amountMin !== undefined && filters.amountMin !== '') { where += ' AND c.amount >= ?'; params.push(Number(filters.amountMin)); }
  if (filters.amountMax !== undefined && filters.amountMax !== '') { where += ' AND c.amount < ?'; params.push(Number(filters.amountMax)); }

  const page = parseInt(filters.page) || 1;
  const pageSize = parseInt(filters.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  const total = queryOne(`SELECT COUNT(*) as count FROM contracts c WHERE ${where}`, params)?.count || 0;
  const data = queryAll(
    `SELECT c.*, 
       COALESCE(SUM(CASE WHEN p.status IN ('已付', '已收') THEN p.amount ELSE 0 END), 0) as occurred_amount
     FROM contracts c
     LEFT JOIN payments p ON c.id = p.contract_id
     WHERE ${where}
     GROUP BY c.id
     ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { data, total };
}

function getContractById(id) {
  return queryOne('SELECT * FROM contracts WHERE id = ?', [id]);
}

function createContract(c, operator) {
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
    [contractId, '创建', '创建合同', operator || c.person_in_charge || '系统']);

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

function updateContract(id, c, operator) {
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
    [id, '更新', '更新合同信息', operator || c.person_in_charge || '系统']);

  // 同步更新提醒的日期和内容（排除已忽略的）
  if (c.end_date) {
    const remindDate = new Date(c.end_date);
    remindDate.setDate(remindDate.getDate() - 7);
    const remindStr = remindDate.toISOString().slice(0, 10);
    const msg = `合同「${c.title}」将于 ${c.end_date} 到期，请及时处理。`;
    runSql("UPDATE reminders SET remind_date = ?, message = ?, contract_title = ?, status = 'pending' WHERE contract_id = ? AND status != 'ignored'",
      [remindStr, msg, c.title, id]);
  }

  // 合同状态联动更新提醒：已终止/已到期→已完成
  if (['已终止', '已到期'].includes(c.status)) {
    runSql("UPDATE reminders SET status = 'processed' WHERE contract_id = ? AND status = 'pending'",
      [id]);
  }
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
  if (filters.status) { where += ' AND r.status = ?'; params.push(filters.status); }
  if (filters.date) { where += ' AND r.remind_date = ?'; params.push(filters.date); }
  where += " AND (c.status IS NULL OR c.status NOT IN ('已到期', '已终止'))";
  return queryAll(`SELECT r.*, c.contract_no, c.end_date as contract_end_date
    FROM reminders r LEFT JOIN contracts c ON r.contract_id = c.id
    WHERE ${where} ORDER BY r.remind_date ASC`, params);
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
    AND (c.status IS NULL OR c.status NOT IN ('已到期', '已终止'))
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

// 备份文件名带毫秒，避免同一秒内两次备份互相覆盖
function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const SQLITE_MAGIC = 'SQLite format 3\0';

// 校验一个备份文件是否是本系统可用的数据库；只读，不触碰运行中的库
function validateBackupFile(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (e) {
    return { ok: false, error: '无法读取文件：' + e.message };
  }
  if (buf.length < 16 || buf.subarray(0, 16).toString('latin1') !== SQLITE_MAGIC) {
    return { ok: false, error: '文件不是有效的 SQLite 数据库' };
  }
  try {
    const probe = new SQL_INSTANCE.Database(buf);
    try {
      const rows = probe.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'");
      if (!rows.length || !rows[0].values.length) {
        throw new Error('缺少 contracts 表，可能不是本系统的备份');
      }
    } finally {
      probe.close();
    }
  } catch (e) {
    return { ok: false, error: '备份文件无法解析：' + e.message };
  }
  return { ok: true };
}

// 用指定文件替换运行中的库（调用方负责失败回滚）
function swapDatabaseTo(sourceFile) {
  if (db) db.close();
  db = null;
  replaceFile(sourceFile, DB_PATH);
  db = new SQL_INSTANCE.Database(fs.readFileSync(DB_PATH));
  createTables();
  ensureAdminUser();
  saveToDisk();
}

function reloadDatabaseFromDisk() {
  if (db) db.close();
  db = null;
  db = new SQL_INSTANCE.Database(fs.readFileSync(DB_PATH));
}

function importBackup(filePath) {
  // 校验必须早于任何写操作
  const check = validateBackupFile(filePath);
  if (!check.ok) {
    return { success: false, error: check.error + '，已取消导入' };
  }

  // 覆盖当前库之前先留一份应急备份，导入中途失败可以回滚
  let emergencyPath = null;
  try {
    saveNow();
    if (!fs.existsSync(DEFAULT_BACKUP_DIR)) {
      fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true });
    }
    emergencyPath = path.join(DEFAULT_BACKUP_DIR, `pre_import_${backupStamp()}.db`);
    fs.copyFileSync(DB_PATH, emergencyPath);
    cleanOldBackups(DEFAULT_BACKUP_DIR, PRE_IMPORT_KEEP, 'pre_import_');
  } catch (e) {
    return { success: false, error: '导入前备份失败，已取消导入：' + e.message };
  }

  try {
    swapDatabaseTo(filePath);
    console.log('  数据库已从备份恢复:', DB_PATH, '（导入前的库已存至:', emergencyPath, '）');
    return { success: true, restoreFile: emergencyPath };
  } catch (e) {
    try {
      replaceFile(emergencyPath, DB_PATH);
      reloadDatabaseFromDisk();
      console.error('  导入失败，已回滚到导入前的数据库');
    } catch (rollbackErr) {
      console.error('  导入失败且回滚失败，请手动用', emergencyPath, '恢复:', rollbackErr.message);
    }
    return { success: false, error: '导入失败：' + e.message };
  }
}

function getDbPath() {
  return DB_PATH;
}

// ========== Auto Backup ==========

const DEFAULT_BACKUP_DIR = path.join(DB_DIR, 'backups');
// 导入前的应急备份固定留在默认目录，单独轮转，不受用户配置的保留份数影响
const PRE_IMPORT_KEEP = 5;

// backupDir 由管理员在设置页填写，会被用于建目录、写备份和轮转删除，
// 因此只接受不含 .. 的绝对路径，且不允许指向数据库自身所在目录；非法值回退到默认目录
function normalizeBackupDir(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  if (raw.includes('..')) {
    console.warn('  备份目录配置无效（包含 ..），已改用默认目录');
    return '';
  }
  if (!path.isAbsolute(raw)) {
    console.warn('  备份目录必须是绝对路径，已改用默认目录:', raw);
    return '';
  }
  const resolved = path.resolve(raw);
  if (resolved === path.resolve(DB_DIR)) {
    console.warn('  备份目录不能与数据库所在目录相同，已改用默认目录');
    return '';
  }
  return resolved;
}

function getAutoBackupConfig() {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', ['auto_backup']);
  if (!row) {
    return {
      enabled: false,
      backupDir: '',
      frequency: 'daily',
      keepCount: 7,
      lastBackupTime: null,
      lastError: null,
    };
  }
  try {
    const config = JSON.parse(row.value);
    const keep = Number(config.keepCount);
    return {
      enabled: config.enabled || false,
      backupDir: normalizeBackupDir(config.backupDir),
      frequency: config.frequency === 'weekly' ? 'weekly' : 'daily',
      keepCount: Number.isFinite(keep) && keep >= 1 ? Math.floor(keep) : 7,
      lastBackupTime: config.lastBackupTime || null,
      lastError: config.lastError || null,
    };
  } catch (_) {
    return {
      enabled: false,
      backupDir: '',
      frequency: 'daily',
      keepCount: 7,
      lastBackupTime: null,
      lastError: null,
    };
  }
}

function setAutoBackupConfig(config) {
  const current = getAutoBackupConfig();
  const incomingKeep = Number(config.keepCount !== undefined ? config.keepCount : current.keepCount);
  const merged = {
    enabled: config.enabled !== undefined ? !!config.enabled : current.enabled,
    backupDir: normalizeBackupDir(config.backupDir !== undefined ? config.backupDir : current.backupDir),
    frequency: (config.frequency !== undefined ? config.frequency : current.frequency) === 'weekly' ? 'weekly' : 'daily',
    keepCount: Number.isFinite(incomingKeep) && incomingKeep >= 1 ? Math.floor(incomingKeep) : current.keepCount,
    lastBackupTime: config.lastBackupTime !== undefined ? config.lastBackupTime : current.lastBackupTime,
    lastError: config.lastError !== undefined ? config.lastError : current.lastError,
  };
  runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auto_backup', JSON.stringify(merged)]);
  saveToDisk();
  return merged;
}

// 记录本次自动备份的结果，供设置页显示；记录本身失败不应影响接口返回
function rememberBackupResult(fields) {
  try {
    setAutoBackupConfig(fields);
  } catch (e) {
    console.error('  备份结果记录失败:', e.message);
  }
}

// 自动备份产物是一个目录：contracts.db 加上当时的 uploads 副本。
// 附件本体只存在 data/uploads 里、数据库只存文件名，所以单备 .db 会丢掉扫描件/凭证。
function writeFullBackup(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (!exportBackup(path.join(targetDir, 'contracts.db'))) {
    return false;
  }
  const uploadsDir = getUploadsDir();
  if (fs.existsSync(uploadsDir)) {
    copyDirSync(uploadsDir, path.join(targetDir, 'uploads'));
  }
  return true;
}

// 恢复前留存的完整状态（库+附件），单独轮转
const PRE_RESTORE_KEEP = 3;

// 统计目录里的文件数与总字节，用于界面上说明一份备份里有多少附件
function statTree(dir) {
  let count = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        count++;
        bytes += fs.statSync(full).size;
      }
    }
  }
  return { count, bytes };
}

// 列出某目录里的备份单元：目录形态（含附件）与早期单文件 .db 都能显示
function listBackupUnits(rawDir) {
  // 显式传目录时校验失败要报错，不能悄悄退回默认目录让人以为列表是全的
  if (rawDir !== undefined && rawDir !== '') {
    const checked = normalizeBackupDir(rawDir);
    if (!checked) {
      return { error: '目录不合法：请填不含 .. 的绝对路径（例如 U 盘的 E:\\合同备份）' };
    }
    rawDir = checked;
  }
  const dir = rawDir ? rawDir : DEFAULT_BACKUP_DIR;
  if (!fs.existsSync(dir)) {
    return { dir, units: [] };
  }
  const units = fs.readdirSync(dir)
    .filter(f => f.startsWith('auto_backup_'))
    .map(name => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      const unit = {
        name,
        path: fullPath,
        time: stat.mtime.toISOString(),
        isFolder: stat.isDirectory(),
        hasUploads: false,
        attachmentCount: 0,
        uploadsBytes: 0,
        dbBytes: 0,
        hasDatabase: false,
      };
      if (unit.isFolder) {
        const dbFile = path.join(fullPath, 'contracts.db');
        unit.hasDatabase = fs.existsSync(dbFile);
        if (unit.hasDatabase) unit.dbBytes = fs.statSync(dbFile).size;
        const uploadsDir = path.join(fullPath, 'uploads');
        if (fs.existsSync(uploadsDir)) {
          unit.hasUploads = true;
          const tree = statTree(uploadsDir);
          unit.attachmentCount = tree.count;
          unit.uploadsBytes = tree.bytes;
        }
      } else if (name.endsWith('.db')) {
        unit.hasDatabase = true;
        unit.dbBytes = stat.size;
      }
      return unit;
    })
    .filter(u => u.hasDatabase)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  return { dir, units };
}

// 把一份完整备份直接写到指定目录（插着 U 盘时一键带走，不做轮转）
function exportFullBackupTo(rawDest) {
  const dest = normalizeBackupDir(rawDest);
  if (!dest) {
    return { success: false, error: '目标目录不合法：请填不含 .. 的绝对路径（例如 U 盘的 E:\\合同备份）' };
  }
  const unitDir = path.join(dest, `auto_backup_${backupStamp()}`);
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    if (!writeFullBackup(unitDir)) {
      fs.rmSync(unitDir, { recursive: true, force: true });
      return { success: false, error: '导出失败：数据库尚未就绪' };
    }
    console.log('  完整备份已写出:', unitDir);
    return { success: true, path: unitDir };
  } catch (e) {
    fs.rmSync(unitDir, { recursive: true, force: true });
    return { success: false, error: '导出失败：' + e.message };
  }
}

// 用备份里的 uploads 整体替换当前附件目录
function replaceUploadsFrom(sourceUploads) {
  const live = getUploadsDir();
  if (fs.existsSync(live)) {
    fs.rmSync(live, { recursive: true, force: true });
  }
  if (fs.existsSync(sourceUploads)) {
    copyDirSync(sourceUploads, live);
  } else {
    fs.mkdirSync(live, { recursive: true });
  }
}

// 从备份单元（目录或早期 .db 文件）一键恢复台账与附件
function restoreFromUnit(rawSource) {
  const source = normalizeBackupDir(rawSource);
  if (!source) {
    return { success: false, error: '备份路径不合法：请填不含 .. 的绝对路径' };
  }
  if (!fs.existsSync(source)) {
    return { success: false, error: '找不到该备份：' + source };
  }
  const isFile = fs.statSync(source).isFile();
  const srcDb = isFile ? source : path.join(source, 'contracts.db');
  if (!fs.existsSync(srcDb)) {
    return { success: false, error: '所选备份里没有 contracts.db' };
  }
  const check = validateBackupFile(srcDb);
  if (!check.ok) {
    return { success: false, error: '恢复已取消：' + check.error };
  }
  const srcUploads = isFile ? null : path.join(source, 'uploads');
  const willRestoreUploads = !!(srcUploads && fs.existsSync(srcUploads));

  // 先把当前状态整份留存，恢复出问题时能原样退回
  const safetyDir = path.join(DEFAULT_BACKUP_DIR, `pre_restore_${backupStamp()}`);
  try {
    saveNow();
    fs.mkdirSync(safetyDir, { recursive: true });
    fs.copyFileSync(DB_PATH, path.join(safetyDir, 'contracts.db'));
    if (fs.existsSync(getUploadsDir())) {
      copyDirSync(getUploadsDir(), path.join(safetyDir, 'uploads'));
    }
  } catch (e) {
    return { success: false, error: '恢复前留存当前数据失败，已取消恢复：' + e.message };
  }

  try {
    swapDatabaseTo(srcDb);
    if (willRestoreUploads) {
      replaceUploadsFrom(srcUploads);
    }
    cleanOldBackups(DEFAULT_BACKUP_DIR, PRE_RESTORE_KEEP, 'pre_restore_');
    console.log('  已从备份恢复:', source, willRestoreUploads ? '（含附件）' : '（该备份不含附件，现有附件保持不变）', '恢复前状态:', safetyDir);
    return { success: true, restoreFile: safetyDir, uploadsRestored: willRestoreUploads, source };
  } catch (e) {
    try {
      replaceFile(path.join(safetyDir, 'contracts.db'), DB_PATH);
      reloadDatabaseFromDisk();
      if (willRestoreUploads) {
        replaceUploadsFrom(path.join(safetyDir, 'uploads'));
      }
      console.error('  恢复失败，已回滚到恢复前的数据');
    } catch (rollbackErr) {
      console.error('  恢复失败且回滚失败，请用', safetyDir, '手工还原:', rollbackErr.message);
    }
    return { success: false, error: '恢复失败：' + e.message };
  }
}

function performAutoBackup() {
  const config = getAutoBackupConfig();
  const backupDir = config.backupDir || DEFAULT_BACKUP_DIR;
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  } catch (e) {
    const msg = '备份目录无法创建：' + e.message + (config.backupDir ? '' : '（默认目录）');
    console.error('  ', msg);
    rememberBackupResult({ lastError: msg });
    return { success: false, error: msg };
  }
  const now = new Date();
  const filename = `auto_backup_${backupStamp()}`;
  const backupPath = path.join(backupDir, filename);
  try {
    const exportOk = writeFullBackup(backupPath);
    if (!exportOk) {
      const msg = '导出失败：数据库尚未就绪';
      console.error('  ', msg);
      rememberBackupResult({ lastError: msg });
      return { success: false, error: msg };
    }
    // 记录成功时间并清除上次的失败提示
    rememberBackupResult({ lastBackupTime: now.toISOString(), lastError: null });
    // 清理旧备份
    cleanOldBackups(backupDir, config.keepCount, 'auto_backup_');
    console.log(`  自动备份完成: ${backupPath}`);
    return { success: true, path: backupPath, time: now.toISOString() };
  } catch (e) {
    const msg = '自动备份失败：' + e.message;
    console.error('  ', msg);
    rememberBackupResult({ lastError: msg });
    return { success: false, error: msg };
  }
}

function cleanOldBackups(backupDir, keepCount, prefix) {
  try {
    const files = fs.readdirSync(backupDir)
      // 备份单元现在既可能是目录（auto_backup_*），也可能是早前的单文件（*.db），按前缀一并统计
      .filter(f => f.startsWith(prefix))
      .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > keepCount) {
      files.slice(keepCount).forEach(f => {
        try { fs.rmSync(f.path, { recursive: true, force: true }); } catch (_) {}
      });
    }
  } catch (_) {}
}

function shouldAutoBackupNow() {
  const config = getAutoBackupConfig();
  if (!config.enabled) return false;
  if (!config.lastBackupTime) return true;
  const last = new Date(config.lastBackupTime);
  const now = new Date();
  const diffMs = now - last;
  const intervalMs = config.frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return diffMs >= intervalMs;
}

function getUploadsDir() {
  return path.join(DB_DIR, 'uploads');
}

// ========== Attachments ==========

function getAttachmentsByContract(contractId) {
  return queryAll('SELECT *, size AS file_size FROM attachments WHERE contract_id = ? ORDER BY created_at DESC', [contractId]);
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

  addContractLog(contractId, '上传', `上传附件：${originalName}`, uploader);

  return row ? row.id : 0;
}

// 记录一条合同操作日志；附件与凭证的增删替换也归到所属合同的时间线上
function addContractLog(contractId, action, detail, operator) {
  if (!contractId) return;
  runSql('INSERT INTO contract_logs (contract_id, action, detail, operator) VALUES (?, ?, ?, ?)',
    [contractId, action, detail, operator || '系统']);
}

function deleteAttachment(id, operator) {
  const att = queryOne('SELECT * FROM attachments WHERE id = ?', [id]);
  runSql('DELETE FROM attachments WHERE id = ?', [id]);
  // 删除磁盘上的文件
  if (att) {
    const filePath = path.join(getUploadsDir(), att.filename);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    addContractLog(att.contract_id, '删除', `删除附件：${att.original_name}`, operator);
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

// ========== Payments ==========

function getPaymentsByContract(contractId) {
  return queryAll('SELECT * FROM payments WHERE contract_id = ? ORDER BY payment_date DESC', [contractId]);
}

function getPaymentById(id) {
  return queryOne('SELECT * FROM payments WHERE id = ?', [id]);
}

function createPayment(contractId, p) {
  runSql(`
    INSERT INTO payments (contract_id, type, amount, payment_date, status, description, attachment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    contractId, p.type || '支出', p.amount || 0, p.payment_date,
    p.status || '已付', p.description || null, p.attachment || null
  ]);
  const row = queryOne('SELECT last_insert_rowid() as id');
  return row ? row.id : 0;
}

function updatePayment(id, p) {
  const existing = getPaymentById(id);
  if (!existing) return;
  
  const merged = {
    type: p.type !== undefined ? p.type : existing.type,
    amount: p.amount !== undefined ? p.amount : existing.amount,
    payment_date: p.payment_date !== undefined ? p.payment_date : existing.payment_date,
    status: p.status !== undefined ? p.status : existing.status,
    description: p.description !== undefined ? p.description : existing.description,
    attachment: p.attachment !== undefined ? p.attachment : existing.attachment,
    attachment_name: p.attachment_name !== undefined ? p.attachment_name : existing.attachment_name
  };
  
  runSql(`
    UPDATE payments SET type=?, amount=?, payment_date=?, status=?, description=?, attachment=?, attachment_name=?
    WHERE id=?
  `, [merged.type, merged.amount, merged.payment_date, merged.status, merged.description || null, merged.attachment || null, merged.attachment_name || null, id]);
}

function deletePayment(id) {
  runSql('DELETE FROM payments WHERE id = ?', [id]);
}

function getPaymentSummary(contractId) {
  const contract = queryOne('SELECT amount FROM contracts WHERE id = ?', [contractId]);
  const contractAmount = contract ? (contract.amount || 0) : 0;

  // 已发生金额：所有已付记录之和（不区分收入/支出）
  const occurredAmount = queryOne(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE contract_id = ? AND status IN ('已付', '已收')",
    [contractId]
  )?.total || 0;

  // 待发生金额：合同金额 - 已发生金额（仅当合同金额 > 0 时计算）
  const pendingAmount = contractAmount > 0 ? contractAmount - occurredAmount : null;

  return { contractAmount, occurredAmount, pendingAmount };
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

function countActiveAdmins() {
  const row = queryOne("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1");
  return row ? row.count : 0;
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
  const payload = JSON.stringify({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, exp: Date.now() + 24 * 60 * 60 * 1000 });
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
  getAttachmentsByContract, getAttachmentById, createAttachment, deleteAttachment, addContractLog,
  deleteAttachmentsByContract, getAttachmentCountByContract,
  getPaymentsByContract, getPaymentById, createPayment, updatePayment, deletePayment, getPaymentSummary,
  authenticateUser, generateToken, verifyToken,
  getUserById, getAllUsers, createUser, updateUser, deleteUser, countActiveAdmins,
  exportBackup,
  importBackup,
  getAutoBackupConfig,
  setAutoBackupConfig,
  performAutoBackup,
  shouldAutoBackupNow,
  listBackupUnits,
  exportFullBackupTo,
  restoreFromUnit,
  DEFAULT_BACKUP_DIR,
};
