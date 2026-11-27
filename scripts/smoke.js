#!/usr/bin/env node
/**
 * 合同管理系统 - 体检脚本
 *
 * 用法：node scripts/smoke.js
 *
 * 会在系统临时目录里复制一份 server/ 并起一个独立服务（不碰项目 data/ 里的真实数据），
 * 依次验证：登录、创建/重复编号、字段级日志、附件上传、自动备份（含附件）、
 * 权限拦截（普通用户删除）、坏备份导入拦截、一键恢复。
 * 任一项失败即以非零退出码结束，并在最后汇总失败项。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const results = [];
const ok = (name, cond, detail) => {
  results.push({ name, cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function linkModules(target) {
  const src = path.join(REPO, 'node_modules');
  const dest = path.join(target, 'node_modules');
  if (process.platform === 'win32') {
    // 用参数数组而非拼字符串，避免路径里的空格或特殊字符被 shell 解释
    execFileSync('cmd', ['/c', 'mklink', '/J', dest, src], { stdio: 'ignore' });
  } else {
    fs.symlinkSync(src, dest, 'dir');
  }
}

async function waitHealth(base, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return true;
    } catch (_) { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  return { status: res.status, body };
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-smoke-'));
  console.log('体检工作目录:', work);
  fs.cpSync(path.join(REPO, 'server'), path.join(work, 'server'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(work, 'package.json'));
  linkModules(work);

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: work,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });

  const cleanup = () => {
    try { child.kill(); } catch (_) {}
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
  };

  try {
    if (!(await waitHealth(base))) {
      ok('服务启动', false, '30 秒内未响应 /api/health');
      cleanup();
      process.exit(1);
    }
    ok('服务启动', true, base);

    // 1. 登录 + 默认密码标记
    const login = await jsonFetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    ok('管理员可登录', login.status === 200 && !!login.body.token);
    ok('默认密码标记存在', !!login.body.user && login.body.user.usingDefaultPassword === true);
    const H = { Authorization: 'Bearer ' + login.body.token, 'Content-Type': 'application/json' };

    // 2. 建合同 + 重复编号
    const mk = (no, extra = {}) => ({ contract_no: no, title: '体检合同-' + no, type: '采购', party_a: '甲', amount: 8000, status: '执行中', end_date: '2027-01-01', ...extra });
    const c1 = await jsonFetch(base + '/api/contracts', { method: 'POST', headers: H, body: JSON.stringify(mk('SMOKE-1')) });
    ok('创建合同', c1.status === 200 && !!c1.body.id);
    const cid = c1.body.id;
    const dup = await jsonFetch(base + '/api/contracts', { method: 'POST', headers: H, body: JSON.stringify(mk('SMOKE-1')) });
    ok('重复编号被中文提示拦截', dup.status === 400 && String(dup.body.error).includes('已存在'), dup.body && dup.body.error);

    // 3. 字段级日志
    await jsonFetch(base + `/api/contracts/${cid}`, { method: 'PUT', headers: H, body: JSON.stringify(mk('SMOKE-1', { amount: 9000 })) });
    const logs = await jsonFetch(base + `/api/contracts/${cid}/logs`, { headers: H });
    const diffLog = (logs.body || []).find(l => l.action === '更新');
    ok('修改记录字段差异', !!diffLog && diffLog.detail.includes('8,000 元 → 9,000 元'), diffLog && diffLog.detail);

    // 4. 附件上传
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('体检附件')], { type: 'text/plain' }), '体检附件.txt');
    const up = await jsonFetch(base + `/api/contracts/${cid}/attachments`, { method: 'POST', headers: { Authorization: H.Authorization }, body: fd });
    const att = up.body && up.body.files && up.body.files[0];
    ok('附件上传', up.status === 200 && !!att, att && att.filename);

    // 5. 自动备份（含附件）
    const bk = await jsonFetch(base + '/api/backup/auto-trigger', { method: 'POST', headers: H });
    const unitDir = bk.body && bk.body.path;
    const unitOk = unitDir && fs.existsSync(path.join(unitDir, 'contracts.db')) && fs.existsSync(path.join(unitDir, 'uploads'));
    ok('自动备份含台账与附件', !!unitOk, unitDir);

    // 6. 权限：普通用户不能删合同/附件/收付款
    await jsonFetch(base + '/api/users', { method: 'POST', headers: H, body: JSON.stringify({ username: 'smoke_user', password: 'pass1234', display_name: '体检普通用户', role: 'user' }) });
    const ulogin = await jsonFetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'smoke_user', password: 'pass1234' }) });
    const UH = { Authorization: 'Bearer ' + ulogin.body.token, 'Content-Type': 'application/json' };
    const delC = await jsonFetch(base + `/api/contracts/${cid}?confirm_no=SMOKE-1`, { method: 'DELETE', headers: UH });
    ok('普通用户删合同被拒', delC.status === 403, 'HTTP ' + delC.status);
    const delA = await jsonFetch(base + `/api/attachments/${att.id}`, { method: 'DELETE', headers: UH });
    ok('普通用户删附件被拒', delA.status === 403, 'HTTP ' + delA.status);

    // 7. 坏备份导入被拦
    const badFd = new FormData();
    badFd.append('file', new Blob([Buffer.from('NOT A DATABASE')]), 'bad.db');
    const badImp = await jsonFetch(base + '/api/backup/import', { method: 'POST', headers: { Authorization: H.Authorization }, body: badFd });
    ok('坏文件导入被拒', badImp.status === 400 && String(badImp.body.error).includes('不是有效'), badImp.body && badImp.body.error);

    // 8. 一键恢复
    const restore = await jsonFetch(base + '/api/backup/restore', { method: 'POST', headers: H, body: JSON.stringify({ source: unitDir }) });
    ok('一键恢复成功', restore.status === 200 && restore.body.success && restore.body.uploadsRestored === true);
    const after = await jsonFetch(base + `/api/contracts/${cid}/attachments`, { headers: H });
    ok('恢复后附件清单一致', Array.isArray(after.body) && after.body.length >= 1);
  } catch (e) {
    ok('体检执行', false, e.message);
  } finally {
    cleanup();
  }

  const failed = results.filter(r => !r.cond);
  console.log('\n———— 结果 ————');
  console.log(`通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach(f => console.log(' - ' + f.name + (f.detail ? '（' + f.detail + '）' : '')));
    process.exit(1);
  }
  console.log('全部通过');
}

main().catch(e => { console.error('体检脚本异常:', e); process.exit(1); });
