export interface PaymentScheduleItem {
  label: string;
  percentage: number;
  due_days_after_start: number;
}

export interface PaymentPlanCatalog {
  id: string;
  name: string;
  description?: string | null;
  installments: number;
  schedule: PaymentScheduleItem[];
  isActive: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentInstallment {
  id: string;
  plan_id: string;
  customer_id: string;
  deal_id: string;
  label: string;
  amount: number;
  percentage?: number | null;
  due_date: string;
  paid_date?: string | null;
  paid_amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  payment_mode?: string | null;
  transaction_reference?: string | null;
  receipt_number?: string | null;
  receipt_sent: number;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  notes?: string | null;
}

export interface CustomerPaymentPlan {
  id: string;
  customer_id: string;
  deal_id: string;
  proposal_id?: string | null;
  plan_catalog_id?: string | null;
  plan_name: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'active' | 'completed' | 'overdue' | 'cancelled';
  start_date: string;
  installments?: PaymentInstallment[];
}

export interface PaymentAuditEntry {
  id: string;
  installment_id?: string | null;
  plan_id?: string | null;
  customer_id?: string | null;
  action: string;
  performed_by?: string | null;
  performed_by_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  notes?: string | null;
  created_at: string;
}

export type CustomerPaymentSummary = {
  plans: Array<CustomerPaymentPlan & { installments: PaymentInstallment[] }>;
  summary: {
    totalPaid: number;
    totalPending: number;
    overdueCount: number;
    overdueAmount: number;
  };
};
