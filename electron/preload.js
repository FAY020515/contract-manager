const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Contracts
  getContracts: (filters) => ipcRenderer.invoke('contracts:getAll', filters),
  getContractById: (id) => ipcRenderer.invoke('contracts:getById', id),
  createContract: (contract) => ipcRenderer.invoke('contracts:create', contract),
  updateContract: (id, contract) => ipcRenderer.invoke('contracts:update', id, contract),
  deleteContract: (id) => ipcRenderer.invoke('contracts:delete', id),

  // Reminders
  getReminders: (filters) => ipcRenderer.invoke('reminders:getAll', filters),
  getUpcomingReminders: (days) => ipcRenderer.invoke('reminders:getUpcoming', days),
  updateReminderStatus: (id, status) => ipcRenderer.invoke('reminders:updateStatus', id, status),

  // Logs
  getLogsByContract: (contractId) => ipcRenderer.invoke('logs:getByContract', contractId),

  // Statistics
  getDashboardStats: () => ipcRenderer.invoke('stats:getDashboard'),
  getStatsByType: () => ipcRenderer.invoke('stats:getByType'),
  getStatsByDepartment: () => ipcRenderer.invoke('stats:getByDepartment'),
  getMonthlyTrend: () => ipcRenderer.invoke('stats:getMonthlyTrend'),
  getAmountDistribution: () => ipcRenderer.invoke('stats:getAmountDistribution'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // Backup
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),

  // Shell
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // Notification
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', title, body),
};

contextBridge.exposeInMainWorld('api', api);
