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
    page?: number;
    pageSize?: number;
  }) {
    let where = '1=1';
    const params: any[] = [];

    if (filters?.keyword) {
      where += ' AND (title LIKE ? OR contract_no LIKE ? OR party_a LIKE ? OR party_b LIKE ?)';
      const kw = `%${filters.keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    if (filters?.type) { where += ' AND type = ?'; params.push(filters.type); }
    if (filters?.status) { where += ' AND status = ?'; params.push(filters.status); }
    if (filters?.department) { where += ' AND department = ?'; params.push(filters.department); }
    if (filters?.startDate) { where += ' AND sign_date >= ?'; params.push(filters.startDate); }
    if (filters?.endDate) { where += ' AND sign_date <= ?'; params.push(filters.endDate); }

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const total = queryOne(`SELECT COUNT(*) as count FROM contracts WHERE ${where}`, params)?.count || 0;
    const data = queryAll(
      `SELECT * FROM contracts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return { data, total };
  },

  getContractById(id: number) {
    return queryOne('SELECT * FROM contracts WHERE id = ?', [id]);
  },

  createContract(c: any): number {
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

  updateContract(id: number, c: any) {
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
    if (filters?.status) { where += ' AND status = ?'; params.push(filters.status); }
    if (filters?.date) { where += ' AND remind_date = ?'; params.push(filters.date); }
    return queryAll(`SELECT * FROM reminders WHERE ${where} ORDER BY remind_date ASC`, params);
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
