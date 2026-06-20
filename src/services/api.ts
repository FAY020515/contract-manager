/**
 * API 服务层 - HTTP 版本
 * 前端通过 REST API 与后端通信，支持浏览器直接访问
 */

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  const res = await fetch(`${BASE}${url}`, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.hash = '#/login';
    throw new Error('登录已过期，请重新登录');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `请求失败: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ========== Auth ==========
  login: (username: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getCurrentUser: () =>
    request<any>('/auth/me').then(res => res.user || res),

  // ========== Users ==========
  getUsers: () =>
    request<any[]>('/users'),

  createUser: (data: { username: string; password: string; display_name: string; role: string; department: string }) =>
    request<{ id: number }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id: number, data: Partial<{ username: string; display_name: string; role: string; department: string; password: string }>) =>
    request<{ success: boolean }>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    request<{ success: boolean }>(`/users/${id}`, {
      method: 'DELETE',
    }),

  // ========== Contracts ==========
  getContracts: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
    }
    return request<{ data: any[]; total: number }>(`/contracts?${params}`);
  },

  getContractById: (id: number) =>
    request<any>(`/contracts/${id}`),

  createContract: (contract: any) =>
    request<{ id: number }>('/contracts', {
      method: 'POST',
      body: JSON.stringify(contract),
    }),

  updateContract: (id: number, contract: any) =>
    request<{ success: boolean }>(`/contracts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contract),
    }),

  deleteContract: (id: number) =>
    request<{ success: boolean }>(`/contracts/${id}`, {
      method: 'DELETE',
    }),

  importContracts: (contracts: any[]) =>
    request<{ success: number; failed: number; errors: { row: number; error: string }[] }>('/contracts/import', {
      method: 'POST',
      body: JSON.stringify({ contracts }),
    }),

  // ========== Reminders ==========
  getReminders: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
    }
    return request<any[]>(`/reminders?${params}`);
  },

  getUpcomingReminders: (days: number) =>
    request<any[]>(`/reminders/upcoming/${days}`),

  updateReminderStatus: (id: number, status: string) =>
    request<{ success: boolean }>(`/reminders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  // ========== Logs ==========
  getLogsByContract: (contractId: number) =>
    request<any[]>(`/contracts/${contractId}/logs`),

  // ========== Statistics ==========
  getDashboardStats: () =>
    request<any>('/stats/dashboard'),

  getStatsByType: () =>
    request<any[]>('/stats/by-type'),

  getStatsByDepartment: () =>
    request<any[]>('/stats/by-department'),

  getMonthlyTrend: () =>
    request<any[]>('/stats/monthly-trend'),

  getAmountDistribution: () =>
    request<any[]>('/stats/amount-distribution'),

  // ========== Settings ==========
  getSetting: (key: string) =>
    request<{ value: any }>(`/settings/${key}`).then(r => r.value),

  setSetting: (key: string, value: any) =>
    request<{ success: boolean }>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  getAllSettings: () =>
    request<any>('/settings'),

  // ========== Backup ==========
  exportBackup: () => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE}/backup/export`, { headers }).then(res => {
      if (!res.ok) throw new Error('导出失败');
      return res.blob().then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `合同管理备份_${new Date().toISOString().slice(0, 10)}.db`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      });
    });
  },

  importBackup: () => Promise.resolve(false), // TODO: file upload

  // ========== Attachments ==========
  getAttachments: (contractId: number) =>
    request<any[]>(`/contracts/${contractId}/attachments`),

  uploadAttachments: (contractId: number, files: FileList | File[]) => {
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE}/contracts/${contractId}/attachments`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `上传失败 (${res.status})`);
      }
      return res.json();
    });
  },

  deleteAttachment: (id: number) =>
    request<{ success: boolean }>(`/attachments/${id}`, {
      method: 'DELETE',
    }),

  getAttachmentDownloadUrl: (id: number) =>
    `${BASE}/attachments/${id}/download`,

  getAttachmentPreviewUrl: (id: number) =>
    `${BASE}/attachments/${id}/preview`,

  // ========== Misc ==========
  openPath: (_filePath: string) => Promise.resolve(),
  showNotification: (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    return Promise.resolve();
  },
};

export default api;
