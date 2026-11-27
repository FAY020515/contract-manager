export interface Contract {
  id: number;
  contract_no: string;
  title: string;
  type: string;
  company?: string | null;
  party_a: string;
  party_b: string;
  amount: number;
  currency: string;
  sign_date: string;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  department: string;
  person_in_charge: string;
  description: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  occurred_amount?: number;
  approval_status?: string;
  approval_by?: string | null;
  approval_at?: string | null;
  last_operator?: string | null;
  last_updated_at?: string | null;
}

export type ContractStatus = '草稿' | '执行中' | '已到期' | '已终止' | '已续签';

export const CONTRACT_STATUSES: ContractStatus[] = ['草稿', '执行中', '已到期', '已终止', '已续签'];

export const STATUS_COLORS: Record<ContractStatus, string> = {
  '草稿': 'default',
  '执行中': 'processing',
  '已到期': 'warning',
  '已终止': 'error',
  '已续签': 'success',
};

export interface Reminder {
  id: number;
  contract_id: number;
  contract_title: string;
  contract_no?: string;
  contract_end_date?: string;
  remind_date: string;
  remind_type: string;
  message: string;
  status: 'pending' | 'processed' | 'ignored';
  created_at: string;
}

export interface ContractLog {
  id: number;
  contract_id: number;
  action: string;
  detail: string;
  operator: string;
  created_at: string;
}

export type PaymentType = '收入' | '支出';
export type PaymentStatus = '待收' | '待付' | '已收' | '已付';

export interface Payment {
  id: number;
  contract_id: number;
  type: PaymentType;
  amount: number;
  payment_date: string;
  status: PaymentStatus;
  description: string;
  attachment: string;
  attachment_name: string;
  created_at: string;
}

export interface PaymentSummary {
  contractAmount: number;
  occurredAmount: number;
  pendingAmount: number | null;
}

export interface DashboardStats {
  total: number;
  thisMonth: number;
  active: number;
  expiringSoon: number;
  totalAmount: number;
}

export interface StatItem {
  type?: string;
  department?: string;
  range_name?: string;
  month?: string;
  count: number;
  total_amount: number;
}

export interface AppSettings {
  contract_types: string[];
  departments: string[];
  reminder_days: number[];
  companies?: { name: string; abbr: string }[];
}

// 一份备份的概览：台账文件大小、是否含附件、附件数量与体积
export interface BackupUnit {
  name: string;
  path: string;
  time: string;
  isFolder: boolean;
  hasDatabase: boolean;
  hasUploads: boolean;
  attachmentCount: number;
  uploadsBytes: number;
  dbBytes: number;
}

declare global {
  interface Window {
    api: {
      getContracts: (filters?: any) => Promise<{ data: Contract[]; total: number }>;
      getContractById: (id: number) => Promise<Contract | null>;
      createContract: (contract: Partial<Contract>) => Promise<Contract>;
      updateContract: (id: number, contract: Partial<Contract>) => Promise<boolean>;
      deleteContract: (id: number, confirmNo: string) => Promise<boolean>;
      importContracts: (contracts: any[]) => Promise<{ success: number; failed: number; errors: { row: number; error: string }[] }>;
      getCurrentUser: () => Promise<any>;
      getUsers: () => Promise<any[]>;
      createUser: (data: { username: string; password: string; display_name: string; role: string; department: string }) => Promise<{ id: number }>;
      updateUser: (id: number, data: Partial<{ username: string; display_name: string; role: string; department: string; password: string }>) => Promise<{ success: boolean }>;
      deleteUser: (id: number) => Promise<{ success: boolean }>;
      setApprovalStatus: (id: number, status: string) => Promise<{ success: boolean }>;
      getNextContractNo: (company?: string) => Promise<{ contract_no: string; abbr: string; year: number; sequence: number }>;
      getReminders: (filters?: any) => Promise<Reminder[]>;
      getUpcomingReminders: (days: number) => Promise<Reminder[]>;
      updateReminderStatus: (id: number, status: string) => Promise<boolean>;
      getLogsByContract: (contractId: number) => Promise<ContractLog[]>;
      getPaymentsByContract: (contractId: number) => Promise<Payment[]>;
      getPaymentSummary: (contractId: number) => Promise<PaymentSummary>;
      createPayment: (contractId: number, data: Partial<Payment>) => Promise<{ id: number }>;
      updatePayment: (id: number, data: Partial<Payment>) => Promise<boolean>;
      deletePayment: (id: number) => Promise<boolean>;
      uploadPaymentAttachment: (id: number, file: File) => Promise<any>;
      deletePaymentAttachment: (id: number) => Promise<boolean>;
      getAttachments: (contractId: number) => Promise<any[]>;
      uploadAttachments: (contractId: number, files: FileList | File[], category?: 'contract' | 'approval') => Promise<any>;
      deleteAttachment: (id: number) => Promise<boolean>;
      getAttachmentDownloadUrl: (id: number) => string;
      getAttachmentPreviewUrl: (id: number) => string;
      getDashboardStats: () => Promise<DashboardStats>;
      getStatsByType: () => Promise<StatItem[]>;
      getStatsByDepartment: () => Promise<StatItem[]>;
      getMonthlyTrend: () => Promise<StatItem[]>;
      getAmountDistribution: () => Promise<StatItem[]>;
      getSetting: (key: string) => Promise<any>;
      setSetting: (key: string, value: any) => Promise<boolean>;
      getAllSettings: () => Promise<AppSettings>;
      exportBackup: () => Promise<boolean>;
      importBackup: (file: File) => Promise<boolean>;
      getAutoBackupConfig: () => Promise<{
        enabled: boolean;
        backupDir: string;
        frequency: 'daily' | 'weekly';
        keepCount: number;
        lastBackupTime: string | null;
        lastError?: string | null;
        defaultDir: string;
      }>;
      setAutoBackupConfig: (config: {
        enabled?: boolean;
        backupDir?: string;
        frequency?: 'daily' | 'weekly';
        keepCount?: number;
      }) => Promise<{ success: boolean; config: any }>;
      triggerAutoBackup: () => Promise<{ success: boolean; path: string; time: string }>;
      listBackupUnits: (dir?: string) => Promise<{ dir: string; units: BackupUnit[] }>;
      exportFullBackup: (destDir: string) => Promise<{ success: boolean; path: string }>;
      restoreFromUnit: (source: string) => Promise<{ success: boolean; restoreFile: string; uploadsRestored: boolean }>;
      openPath: (filePath: string) => Promise<void>;
      showNotification: (title: string, body: string) => Promise<void>;
    };
  }
}
