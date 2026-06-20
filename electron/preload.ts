import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Contracts
  getContracts: (filters?: any) => ipcRenderer.invoke('contracts:getAll', filters),
  getContractById: (id: number) => ipcRenderer.invoke('contracts:getById', id),
  createContract: (contract: any) => ipcRenderer.invoke('contracts:create', contract),
  updateContract: (id: number, contract: any) => ipcRenderer.invoke('contracts:update', id, contract),
  deleteContract: (id: number) => ipcRenderer.invoke('contracts:delete', id),

  // Reminders
  getReminders: (filters?: any) => ipcRenderer.invoke('reminders:getAll', filters),
  getUpcomingReminders: (days: number) => ipcRenderer.invoke('reminders:getUpcoming', days),
  updateReminderStatus: (id: number, status: string) => ipcRenderer.invoke('reminders:updateStatus', id, status),

  // Logs
  getLogsByContract: (contractId: number) => ipcRenderer.invoke('logs:getByContract', contractId),

  // Statistics
  getDashboardStats: () => ipcRenderer.invoke('stats:getDashboard'),
  getStatsByType: () => ipcRenderer.invoke('stats:getByType'),
  getStatsByDepartment: () => ipcRenderer.invoke('stats:getByDepartment'),
  getMonthlyTrend: () => ipcRenderer.invoke('stats:getMonthlyTrend'),
  getAmountDistribution: () => ipcRenderer.invoke('stats:getAmountDistribution'),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // Backup
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),

  // Shell
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  // Notification
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', title, body),
};

contextBridge.exposeInMainWorld('api', api);
