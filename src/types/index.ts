export interface Contract {
  id: number;
  contract_no: string;
  title: string;
  type: string;
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
}

declare global {
  interface Window {
    api: {
      getContracts: (filters?: any) => Promise<{ data: Contract[]; total: number }>;
      getContractById: (id: number) => Promise<Contract | null>;
      createContract: (contract: Partial<Contract>) => Promise<number>;
      updateContract: (id: number, contract: Partial<Contract>) => Promise<boolean>;
      deleteContract: (id: number) => Promise<boolean>;
      getReminders: (filters?: any) => Promise<Reminder[]>;
      getUpcomingReminders: (days: number) => Promise<Reminder[]>;
      updateReminderStatus: (id: number, status: string) => Promise<boolean>;
      getLogsByContract: (contractId: number) => Promise<ContractLog[]>;
      getDashboardStats: () => Promise<DashboardStats>;
      getStatsByType: () => Promise<StatItem[]>;
      getStatsByDepartment: () => Promise<StatItem[]>;
      getMonthlyTrend: () => Promise<StatItem[]>;
      getAmountDistribution: () => Promise<StatItem[]>;
      getSetting: (key: string) => Promise<any>;
      setSetting: (key: string, value: any) => Promise<boolean>;
      getAllSettings: () => Promise<AppSettings>;
      exportBackup: () => Promise<boolean>;
      importBackup: () => Promise<boolean>;
      openPath: (filePath: string) => Promise<void>;
      showNotification: (title: string, body: string) => Promise<void>;
    };
  }
}
