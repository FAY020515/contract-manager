import { app, BrowserWindow, ipcMain, Notification, dialog, shell } from 'electron';
import * as path from 'path';
import { initDatabase, getDatabase } from './database';

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '合同管理系统',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.ts'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========== IPC Handlers ==========

function setupIpcHandlers() {
  // --- Contracts ---
  ipcMain.handle('contracts:getAll', (_event, filters?: any) => {
    const db = getDatabase();
    if (!db) return { data: [], total: 0 };
    return db.getContracts(filters);
  });

  ipcMain.handle('contracts:getById', (_event, id: number) => {
    const db = getDatabase();
    if (!db) return null;
    return db.getContractById(id);
  });

  ipcMain.handle('contracts:create', (_event, contract: any) => {
    const db = getDatabase();
    if (!db) return null;
    const id = db.createContract(contract);
    db.addLog(id, '创建', '创建合同', contract.person_in_charge || '系统');
    return id;
  });

  ipcMain.handle('contracts:update', (_event, id: number, contract: any) => {
    const db = getDatabase();
    if (!db) return false;
    db.updateContract(id, contract);
    db.addLog(id, '更新', '更新合同信息', contract.person_in_charge || '系统');
    return true;
  });

  ipcMain.handle('contracts:delete', (_event, id: number) => {
    const db = getDatabase();
    if (!db) return false;
    db.deleteContract(id);
    return true;
  });

  // --- Reminders ---
  ipcMain.handle('reminders:getAll', (_event, filters?: any) => {
    const db = getDatabase();
    if (!db) return [];
    return db.getReminders(filters);
  });

  ipcMain.handle('reminders:getUpcoming', (_event, days: number) => {
    const db = getDatabase();
    if (!db) return [];
    return db.getUpcomingReminders(days);
  });

  ipcMain.handle('reminders:updateStatus', (_event, id: number, status: string) => {
    const db = getDatabase();
    if (!db) return false;
    db.updateReminderStatus(id, status);
    return true;
  });

  // --- Logs ---
  ipcMain.handle('logs:getByContract', (_event, contractId: number) => {
    const db = getDatabase();
    if (!db) return [];
    return db.getLogsByContract(contractId);
  });

  // --- Statistics ---
  ipcMain.handle('stats:getDashboard', () => {
    const db = getDatabase();
    if (!db) return null;
    return db.getDashboardStats();
  });

  ipcMain.handle('stats:getByType', () => {
    const db = getDatabase();
    if (!db) return [];
    return db.getStatsByType();
  });

  ipcMain.handle('stats:getByDepartment', () => {
    const db = getDatabase();
    if (!db) return [];
    return db.getStatsByDepartment();
  });

  ipcMain.handle('stats:getMonthlyTrend', () => {
    const db = getDatabase();
    if (!db) return [];
    return db.getMonthlyTrend();
  });

  ipcMain.handle('stats:getAmountDistribution', () => {
    const db = getDatabase();
    if (!db) return [];
    return db.getAmountDistribution();
  });

  // --- Settings ---
  ipcMain.handle('settings:get', (key) => {
    const db = getDatabase();
    if (!db) return null;
    return db.getSetting(key);
  });

  ipcMain.handle('settings:set', (key, value) => {
    const db = getDatabase();
    if (!db) return false;
    db.setSetting(key, value);
    return true;
  });

  ipcMain.handle('settings:getAll', () => {
    const db = getDatabase();
    if (!db) return {};
    return db.getAllSettings();
  });

  // --- Backup ---
  ipcMain.handle('backup:export', async () => {
    if (!mainWindow) return false;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出数据库备份',
      defaultPath: `合同管理备份_${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: '数据库文件', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return false;
    const db = getDatabase();
    if (!db) return false;
    return db.exportBackup(result.filePath);
  });

  ipcMain.handle('backup:import', async () => {
    if (!mainWindow) return false;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入数据库备份',
      filters: [{ name: '数据库文件', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return false;
    const db = getDatabase();
    if (!db) return false;
    return db.importBackup(result.filePaths[0]);
  });

  // --- Shell ---
  ipcMain.handle('shell:openPath', (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  // --- Notification ---
  ipcMain.handle('notification:show', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
}

// ========== Reminder Scheduler ==========

let reminderInterval: NodeJS.Timeout | null = null;

function startReminderScheduler() {
  // Check reminders every hour
  const checkReminders = () => {
    const db = getDatabase();
    if (!db) return;
    const today = new Date().toISOString().slice(0, 10);
    const reminders = db.getReminders({ status: 'pending', date: today });
    for (const r of reminders) {
      if (Notification.isSupported()) {
        new Notification({
          title: '合同提醒',
          body: r.message || `${r.contract_title} - ${r.remind_type}`,
        }).show();
      }
      db.updateReminderStatus(r.id, 'processed');
    }
  };

  checkReminders();
  reminderInterval = setInterval(checkReminders, 60 * 60 * 1000);
}

// ========== App Lifecycle ==========

app.whenReady().then(async () => {
  await initDatabase();
  setupIpcHandlers();
  createWindow();
  startReminderScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (reminderInterval) clearInterval(reminderInterval);
  if (process.platform !== 'darwin') app.quit();
});
