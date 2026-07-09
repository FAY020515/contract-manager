import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'contracts.db');
}

function getUploadsDir(): string {
  return path.join(path.dirname(getDbPath()), 'uploads');
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  dbPath = getDbPath();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  seedDefaults();
  saveToDisk();
}

export function getDatabase() {
  if (!db) return null;
  return dbApi;
}

function saveToDisk() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, buffer);
}

function createTables() {
  if (!db) return;
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
    db.run('ALTER TABLE payments ADD COLUMN attachment_name TEXT');
  } catch (e) {
    // 列已存在，忽略错误
  }
}

function seedDefaults() {
  if (!db) return;
  const existing = db.exec("SELECT value FROM settings WHERE key = 'contract_types'");
  if (existing.length === 0) {
    db.run("INSERT INTO settings (key, value) VALUES ('contract_types', ?)",
      [JSON.stringify(['采购', '销售', '服务', '租赁', '劳动', '其他'])]);
    db.run("INSERT INTO settings (key, value) VALUES ('departments', ?)",
      [JSON.stringify(['行政部', '财务部', '技术部', '销售部', '采购部', '人事部', '法务部'])]);
    db.run("INSERT INTO settings (key, value) VALUES ('reminder_days', ?)",
      [JSON.stringify([7, 15, 30])]);
  }
}

// ========== CRUD Operations ==========

function rowToObject(columns: string[], row: any[]): any {
  const obj: any = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function queryAll(sql: string, params: any[] = []): any[] {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(rowToObject(stmt.getColumnNames(), stmt.get()));
  }
  stmt.free();
  return results;
}

function queryOne(sql: string, params: any[] = []): any | null {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSql(sql: string, params: any[] = []): void {
  if (!db) return;
  db.run(sql, params);
  saveToDisk();
}

// ========== API ==========

const dbApi = {
  getContracts(filters?: {
    keyword?: string;
    type?: string;
    status?: string;
    department?: string;
    startDate?: string;
    endDate?: string;
    amountMin?: number;
    amountMax?: number;
    page?: number;
    pageSize?: number;
  }) {
    let where = '1=1';
    const params: any[] = [];

    if (filters?.keyword) {
      where += ' AND (c.title LIKE ? OR c.contract_no LIKE ? OR c.party_a LIKE ? OR c.party_b LIKE ?)';
      const kw = `%${filters.keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    if (filters?.type) { where += ' AND c.type = ?'; params.push(filters.type); }
    if (filters?.status) { where += ' AND c.status = ?'; params.push(filters.status); }
    if (filters?.department) { where += ' AND c.department = ?'; params.push(filters.department); }
    if (filters?.startDate) { where += ' AND c.sign_date >= ?'; params.push(filters.startDate); }
    if (filters?.endDate) { where += ' AND c.sign_date <= ?'; params.push(filters.endDate); }
    if (filters?.amountMin !== undefined && filters?.amountMin !== '') { where += ' AND c.amount >= ?'; params.push(Number(filters.amountMin)); }
    if (filters?.amountMax !== undefined && filters?.amountMax !== '') { where += ' AND c.amount < ?'; params.push(Number(filters.amountMax)); }

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
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
  },

  getContractById(id: number) {
    return queryOne('SELECT * FROM contracts WHERE id = ?', [id]);
  },

  createContract(c: any, _operator?: string): number {
    runSql(`
      INSERT INTO contracts (contract_no, title, type, party_a, party_b, amount, currency,
        sign_date, start_date, end_date, status, department, person_in_charge, description, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      c.contract_no, c.title, c.type, c.party_a, c.party_b, c.amount || 0, c.currency || 'CNY',
      c.sign_date, c.start_date, c.end_date, c.status || '草稿', c.department, c.person_in_charge,
      c.description, c.file_path
    ]);

    // Auto-create expiry reminder
    if (c.end_date) {
      const remindDate = new Date(c.end_date);
      remindDate.setDate(remindDate.getDate() - 7);
      const remindStr = remindDate.toISOString().slice(0, 10);
      const contractId = queryOne('SELECT last_insert_rowid() as id')?.id;
      runSql(`
        INSERT INTO reminders (contract_id, contract_title, remind_date, remind_type, message)
        VALUES (?, ?, ?, '到期提醒', ?)
      `, [contractId, c.title, remindStr, `合同「${c.title}」将于 ${c.end_date} 到期，请及时处理。`]);
    }

    return queryOne('SELECT last_insert_rowid() as id')?.id || 0;
  },

  updateContract(id: number, c: any, _operator?: string) {
    runSql(`
      UPDATE contracts SET contract_no=?, title=?, type=?, party_a=?, party_b=?, amount=?, currency=?,
        sign_date=?, start_date=?, end_date=?, status=?, department=?, person_in_charge=?,
        description=?, file_path=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `, [
      c.contract_no, c.title, c.type, c.party_a, c.party_b, c.amount || 0, c.currency || 'CNY',
      c.sign_date, c.start_date, c.end_date, c.status, c.department, c.person_in_charge,
      c.description, c.file_path, id
    ]);

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
  },

  deleteContract(id: number) {
    runSql('DELETE FROM reminders WHERE contract_id = ?', [id]);
    runSql('DELETE FROM contract_logs WHERE contract_id = ?', [id]);
    runSql('DELETE FROM contracts WHERE id = ?', [id]);
  },

  // --- Reminders ---
  getReminders(filters?: { status?: string; date?: string }) {
    let where = '1=1';
    const params: any[] = [];
    if (filters?.status) { where += ' AND r.status = ?'; params.push(filters.status); }
    if (filters?.date) { where += ' AND r.remind_date = ?'; params.push(filters.date); }
    where += " AND (c.status IS NULL OR c.status NOT IN ('已到期', '已终止'))";
    return queryAll(`SELECT r.*, c.contract_no, c.end_date as contract_end_date
      FROM reminders r LEFT JOIN contracts c ON r.contract_id = c.id
      WHERE ${where} ORDER BY r.remind_date ASC`, params);
  },

  getUpcomingReminders(days: number) {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date();
    future.setDate(future.getDate() + days);
    const futureStr = future.toISOString().slice(0, 10);
    return queryAll(
      `SELECT r.*, c.contract_no, c.end_date as contract_end_date
       FROM reminders r
       LEFT JOIN contracts c ON r.contract_id = c.id
       WHERE r.remind_date >= ? AND r.remind_date <= ? AND r.status = 'pending'
       AND (c.status IS NULL OR c.status NOT IN ('已到期', '已终止'))
       ORDER BY r.remind_date ASC`,
      [today, futureStr]
    );
  },

  updateReminderStatus(id: number, status: string) {
    runSql('UPDATE reminders SET status = ? WHERE id = ?', [status, id]);
  },

  // --- Logs ---
  addLog(contractId: number, action: string, detail: string, operator: string) {
    runSql('INSERT INTO contract_logs (contract_id, action, detail, operator) VALUES (?, ?, ?, ?)',
      [contractId, action, detail, operator]);
  },

  getLogsByContract(contractId: number) {
    return queryAll('SELECT * FROM contract_logs WHERE contract_id = ? ORDER BY created_at DESC', [contractId]);
  },

  // --- Attachments ---
  getAttachmentsByContract(contractId: number) {
    return queryAll('SELECT *, size AS file_size FROM attachments WHERE contract_id = ? ORDER BY created_at DESC', [contractId]);
  },

  getAttachmentById(id: number) {
    return queryOne('SELECT * FROM attachments WHERE id = ?', [id]);
  },

  createAttachment(contractId: number, filename: string, originalName: string, mimeType: string, size: number, uploader: string | null) {
    runSql(`
      INSERT INTO attachments (contract_id, filename, original_name, mime_type, size, uploader)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [contractId, filename, originalName, mimeType || 'application/octet-stream', size || 0, uploader || null]);
    const row = queryOne('SELECT last_insert_rowid() as id');
    return row ? row.id : 0;
  },

  deleteAttachment(id: number) {
    const att = queryOne('SELECT * FROM attachments WHERE id = ?', [id]);
    runSql('DELETE FROM attachments WHERE id = ?', [id]);
    if (att) {
      const filePath = path.join(getUploadsDir(), att.filename);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }
    return att;
  },

  deleteAttachmentsByContract(contractId: number) {
    const atts = queryAll('SELECT * FROM attachments WHERE contract_id = ?', [contractId]);
    runSql('DELETE FROM attachments WHERE contract_id = ?', [contractId]);
    const uploadsDir = getUploadsDir();
    for (const att of atts) {
      try {
        const filePath = path.join(uploadsDir, att.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    }
  },

  getAttachmentCountByContract(contractId: number) {
    const row = queryOne('SELECT COUNT(*) as count FROM attachments WHERE contract_id = ?', [contractId]);
    return row ? row.count : 0;
  },

  // --- Payments ---
  getPaymentsByContract(contractId: number) {
    return queryAll('SELECT * FROM payments WHERE contract_id = ? ORDER BY payment_date DESC', [contractId]);
  },

  getPaymentById(id: number) {
    return queryOne('SELECT * FROM payments WHERE id = ?', [id]);
  },

  createPayment(contractId: number, p: any) {
    runSql(`
      INSERT INTO payments (contract_id, type, amount, payment_date, status, description, attachment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      contractId, p.type || '支出', p.amount || 0, p.payment_date,
      p.status || '已付', p.description || null, p.attachment || null
    ]);
    const row = queryOne('SELECT last_insert_rowid() as id');
    return row ? row.id : 0;
  },

  updatePayment(id: number, p: any) {
    const existing = this.getPaymentById(id);
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
  },

  deletePayment(id: number) {
    runSql('DELETE FROM payments WHERE id = ?', [id]);
  },

  getPaymentSummary(contractId: number) {
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
  },

  // --- Statistics ---
  getDashboardStats() {
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

    const totalAmount = queryOne("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE status = '执行中'")?.total || 0;

    return { total, thisMonth, active, expiringSoon, totalAmount };
  },

  getStatsByType() {
    return queryAll(
      "SELECT type, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM contracts GROUP BY type ORDER BY count DESC"
    );
  },

  getStatsByDepartment() {
    return queryAll(
      "SELECT department, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM contracts GROUP BY department ORDER BY count DESC"
    );
  },

  getMonthlyTrend() {
    return queryAll(
      `SELECT strftime('%Y-%m', sign_date) as month, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
       FROM contracts
       WHERE sign_date IS NOT NULL
       GROUP BY strftime('%Y-%m', sign_date)
       ORDER BY month DESC LIMIT 12`
    ).reverse();
  },

  getAmountDistribution() {
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
  },

  // --- Settings ---
  getSetting(key: string) {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  },

  setSetting(key: string, value: any) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing) {
      runSql('UPDATE settings SET value = ? WHERE key = ?', [strValue, key]);
    } else {
      runSql('INSERT INTO settings (key, value) VALUES (?, ?)', [key, strValue]);
    }
  },

  getAllSettings() {
    const rows = queryAll('SELECT key, value FROM settings');
    const result: any = {};
    rows.forEach(r => {
      try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; }
    });
    return result;
  },

  // --- Backup ---
  exportBackup(filePath: string) {
    if (!db) return false;
    const data = db.export();
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
  },

  importBackup(filePath: string) {
    try {
      const SQL = require('sql.js');
      const buffer = fs.readFileSync(filePath);
      // Close current db
      if (db) db.close();
      // We need to re-init with the imported file
      // For simplicity, just copy the file
      fs.copyFileSync(filePath, dbPath);
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },
};
