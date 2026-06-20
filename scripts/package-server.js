/**
 * 部署打包脚本
 * 构建前端 + 准备部署目录 + 安装生产依赖
 * 
 * 使用方法: npm run package
 * 打包结果: deploy/合同管理系统/
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOY_DIR = path.join(__dirname, '../deploy/合同管理系统');

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

// 1. 清理旧部署目录
console.log('\n[1/4] 清理部署目录...');
if (fs.existsSync(DEPLOY_DIR)) {
  fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DEPLOY_DIR, { recursive: true });

// 2. 构建前端
console.log('\n[2/4] 构建前端...');
run('npx vite build', { cwd: path.join(__dirname, '..') });

// 3. 复制文件
console.log('\n[3/4] 复制项目文件...');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// server/
copyDir(path.join(__dirname, '../server'), path.join(DEPLOY_DIR, 'server'));

// dist/ (前端构建产物)
copyDir(path.join(__dirname, '../dist'), path.join(DEPLOY_DIR, 'dist'));

// package.json (只保留生产依赖)
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
const deployPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  scripts: {
    start: 'node server/index.js',
  },
  dependencies: {
    express: pkg.dependencies.express,
    cors: pkg.dependencies.cors,
    'sql.js': pkg.dependencies['sql.js'],
  },
};
fs.writeFileSync(path.join(DEPLOY_DIR, 'package.json'), JSON.stringify(deployPkg, null, 2));

// 启动脚本 (Windows)
fs.writeFileSync(path.join(DEPLOY_DIR, '启动服务.bat'), `@echo off
chcp 65001 >nul
title 合同管理系统
echo.
echo   合同管理系统 - 正在启动...
echo.
cd /d "%~dp0"
node server/index.js
echo.
echo   服务已停止，按任意键关闭窗口
pause >nul
`);

// 使用说明
fs.writeFileSync(path.join(DEPLOY_DIR, '使用说明.txt'), `合同管理系统 - 部署说明
======================

【首次部署】
1. 安装 Node.js (v18 或更高版本): https://nodejs.org/
2. 在此目录下打开命令行 (右键 → 在终端中打开)
3. 运行: npm install
4. 双击 "启动服务.bat" 启动系统
5. 按终端显示的局域网地址，发给同事即可

【日常使用】
- 双击 "启动服务.bat" 即可启动
- 本机访问: http://localhost:3000
- 同事访问: http://你的IP:3000 (终端启动时会显示)
- 关闭命令行窗口即停止服务

【数据备份】
- 数据库文件位于 data/contracts.db
- 定期复制此文件到其他位置备份即可

【常见问题】
- 端口被占用: 编辑 server/index.js 中的 PORT 值
`);

// 4. 安装生产依赖
console.log('\n[4/4] 安装生产依赖...');
run('npm install --omit=dev', { cwd: DEPLOY_DIR });

console.log('\n====================================');
console.log('  打包完成！');
console.log('  部署目录: deploy/合同管理系统/');
console.log('');
console.log('  使用方式:');
console.log('  1. 把 deploy/合同管理系统 文件夹复制到目标电脑');
console.log('  2. 在目标电脑安装 Node.js (https://nodejs.org)');
console.log('  3. 双击 "启动服务.bat" 即可运行');
console.log('====================================\n');
