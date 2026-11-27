#!/usr/bin/env node
/**
 * 合同管理系统 - 重置管理员密码
 *
 * 用法（必须先把正在运行的服务停掉，否则运行中的服务会用内存里的旧数据覆盖文件）：
 *   node scripts/reset-admin-password.js
 *   node scripts/reset-admin-password.js "C:\Users\xxx\AppData\Roaming\合同管理系统\data\contracts.db"
 *
 * 不传参数时依次尝试：
 *   1. 环境变量 CM_DB 指向的数据库
 *   2. %APPDATA%\合同管理系统\data\contracts.db（安装版）
 *   3. 项目目录 data/contracts.db（源码运行）
 *
 * 执行后 admin 的密码会被重置为 admin123，请登录后立即修改。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

function candidatePaths() {
  const list = [];
  if (process.env.CM_DB) list.push(process.env.CM_DB);
  if (process.platform === 'win32' && process.env.APPDATA) {
    list.push(path.join(process.env.APPDATA, '合同管理系统', 'data', 'contracts.db'));
  }
  list.push(path.join(__dirname, '..', 'data', 'contracts.db'));
  return list;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

async function main() {
  const argPath = process.argv[2];
  const dbPath = argPath || candidatePaths().find(p => fs.existsSync(p));
  if (!dbPath) {
    console.error('没有找到数据库文件。请把 contracts.db 的完整路径作为参数传入。');
    process.exit(1);
  }
  if (!fs.existsSync(dbPath)) {
    console.error('数据库不存在：' + dbPath);
    process.exit(1);
  }

  const SQL = await initSqlJs({
    locateFile: () => path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm'),
  });
  const data = fs.readFileSync(dbPath);
  const db = new SQL.Database(data);

  const check = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
  if (!check.length || !check[0].values.length) {
    console.error('这个文件里没有 users 表，可能不是合同管理系统的数据库：' + dbPath);
    process.exit(1);
  }

  const { hash, salt } = hashPassword('admin123');
  db.run("UPDATE users SET password_hash = ?, salt = ?, active = 1, role = 'admin' WHERE username = 'admin'", [hash, salt]);
  const affected = db.getRowsModified();
  if (!affected) {
    console.error('没有找到用户名为 admin 的账号，未做改动。');
    process.exit(1);
  }

  // 与程序一致：先写临时文件再改名，避免写一半留下坏库
  const tmp = dbPath + '.reset.tmp';
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  db.close();
  fs.renameSync(tmp, dbPath);

  console.log('已重置管理员密码：admin / admin123');
  console.log('数据库：' + dbPath);
  console.log('请立刻启动服务并登录修改密码。');
}

main().catch(e => { console.error('重置失败:', e.message); process.exit(1); });
