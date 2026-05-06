import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import { LIVE_ENTITY_POLL_MS } from '@/lib/queryKeys';
import type {
  CustomerPaymentSummary,
  PaymentAuditEntry,
  PaymentInstallment,
  PaymentPlanCatalog,
} from '@/types/payments';

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

async function apiSend<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e && (e.error || e.message)) || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function usePaymentCatalog() {
  return useQuery({
    queryKey: ['payment-plans', 'catalog'],
    queryFn: () => apiGet<PaymentPlanCatalog[]>('/api/payment-plans/catalog'),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: 'always',
  });
}

export function useCustomerPaymentSummary(customerId: string) {
  return useQuery({
    queryKey: ['payments', 'customer', customerId],
    queryFn: () => apiGet<CustomerPaymentSummary>(`/api/payments/customer/${customerId}/summary-v2`),
    enabled: !!customerId,
    staleTime: 30_000,
  });
}

export type DealPaymentSummary = {
  deal: any;
  plans: Array<{
    id: string;
    customer_id: string;
    deal_id: string;
    plan_name: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    status: string;
    start_date: string;
    installments: PaymentInstallment[];
  }>;
};

export function useDealPaymentSummary(dealId?: string | null) {
  return useQuery({
    queryKey: ['payments', 'deal', dealId],
    queryFn: () => apiGet<DealPaymentSummary>(`/api/payments/deal/${dealId}/summary-v2`),
    enabled: !!dealId,
    staleTime: 15_000,
  });
}

export function useOverduePayments() {
  return useQuery({
    queryKey: ['payments', 'overdue'],
    queryFn: () => apiGet<PaymentInstallment[]>('/api/payments/overdue'),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: 'always',
  });
}

export function usePaymentHistory(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['payments', 'history', params ?? {}],
    queryFn: async () => {
      const q = new URLSearchParams(params ?? {});
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return apiGet<PaymentInstallment[]>(`/api/payments/history-v2${suffix}`);
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: 'always',
  });
}

export function useRemainingBalances() {
  return useQuery({
    queryKey: ['payments', 'remaining'],
    queryFn: () => apiGet<any[]>('/api/payments/remaining-v2'),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: 'always',
  });
}

export function useAssignPaymentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiSend(`/api/payments/customer/${data.customerId}/assign-plan`, 'POST', data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['payments', 'customer', vars.customerId] });
      qc.invalidateQueries({ queryKey: ['payments', 'remaining'] });
    },
  });
}

export function useCreateDealPaymentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, ...data }: any) => apiSend(`/api/payments/deal/${dealId}/create-plan-v2`, 'POST', data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments', 'deal', vars.dealId] });
      qc.invalidateQueries({ queryKey: ['payments', 'remaining'] });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ installmentId, ...data }: any) =>
      apiSend(`/api/payments/installment/${installmentId}/pay`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ installmentId, ...data }: any) =>
      apiSend(`/api/payments/installment/${installmentId}/confirm`, 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function usePaymentAudit(params?: { customerId?: string; planId?: string }) {
  return useQuery({
    queryKey: ['payments', 'audit', params ?? {}],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.customerId) q.set('customerId', params.customerId);
      if (params?.planId) q.set('planId', params.planId);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return apiGet<PaymentAuditEntry[]>(`/api/payments/audit-v2${suffix}`);
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: 'always',
  });
}

