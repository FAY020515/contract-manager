import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Contracts
  getContracts: (filters?: any) => ipcRenderer.invoke('contracts:getAll', filters),
  getContractById: (id: number) => ipcRenderer.invoke('contracts:getById', id),
  createContract: (contract: any, operator?: string) => ipcRenderer.invoke('contracts:create', contract, operator),
  updateContract: (id: number, contract: any, operator?: string) => ipcRenderer.invoke('contracts:update', id, contract, operator),
  deleteContract: (id: number) => ipcRenderer.invoke('contracts:delete', id),

  // Reminders
  getReminders: (filters?: any) => ipcRenderer.invoke('reminders:getAll', filters),
  getUpcomingReminders: (days: number) => ipcRenderer.invoke('reminders:getUpcoming', days),
  updateReminderStatus: (id: number, status: string) => ipcRenderer.invoke('reminders:updateStatus', id, status),

  // Logs
  getLogsByContract: (contractId: number) => ipcRenderer.invoke('logs:getByContract', contractId),

  // Payments
  getPaymentsByContract: (contractId: number) => ipcRenderer.invoke('payments:getByContract', contractId),
  getPaymentSummary: (contractId: number) => ipcRenderer.invoke('payments:getSummary', contractId),
  createPayment: (contractId: number, data: any) => ipcRenderer.invoke('payments:create', contractId, data),
  updatePayment: (id: number, data: any) => ipcRenderer.invoke('payments:update', id, data),
  deletePayment: (id: number) => ipcRenderer.invoke('payments:delete', id),
  uploadPaymentAttachment: async (id: number, file: File) => {
    const buffer = await file.arrayBuffer();
    return ipcRenderer.invoke('payments:uploadAttachment', id, {
      buffer,
      originalName: file.name
    });
  },
  deletePaymentAttachment: (id: number) => ipcRenderer.invoke('payments:deleteAttachment', id),

  // Attachments
  getAttachments: (contractId: number) => ipcRenderer.invoke('attachments:getByContract', contractId),
  uploadAttachments: (contractId: number, files: any) => ipcRenderer.invoke('attachments:upload', contractId, files),
  deleteAttachment: (id: number) => ipcRenderer.invoke('attachments:delete', id),
  getAttachmentDownloadUrl: (id: number) => `/api/attachments/${id}/download`,
  getAttachmentPreviewUrl: (id: number) => `/api/attachments/${id}/preview`,

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
