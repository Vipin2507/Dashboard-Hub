import { apiUrl } from '@/lib/api';
import type { CustomerPaymentSummary } from '@/types/payments';

export type CentralHistoryRow = {
  id: string;
  customerId: string;
  entityType: string;
  entityId: string;
  channel: string;
  direction: string;
  summary?: string | null;
  payloadJson?: string | null;
  performedBy?: string | null;
  performedByName?: string | null;
  at: string;
};

export type CustomerBrief = {
  title: string;
  lastInteraction?: { at: string; summary: string };
  delivery?: { dealId: string; dealTitle: string; status?: string | null; updatedAt?: string | null };
  payments?: { overdueCount: number; overdueAmount: number; collected: number; pending: number };
  nextSteps: string[];
  risks: string[];
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function getCustomerBrief(args: {
  customerId: string;
  wonDeal?: { id: string; name: string } | null;
}): Promise<CustomerBrief> {
  const { customerId, wonDeal } = args;
  const history = await getJson<CentralHistoryRow[]>(
    `/api/ai-memory/customer/${encodeURIComponent(customerId)}/history?limit=20`,
  ).catch(() => []);
  const latest = history[0] ?? null;

  let paymentSummary: CustomerPaymentSummary | null = null;
  try {
    paymentSummary = await getJson<CustomerPaymentSummary>(`/api/payments/customer/${encodeURIComponent(customerId)}/summary-v2`);
  } catch {
    paymentSummary = null;
  }

  const delivery = wonDeal
    ? await getJson<any>(`/api/delivery/deal/${encodeURIComponent(wonDeal.id)}`)
        .then((del) => ({
          dealId: wonDeal.id,
          dealTitle: wonDeal.name,
          status: del.deliveryStatus ?? null,
          updatedAt: del.deliveryUpdatedAt ?? null,
        }))
        .catch(() => null)
    : null;

  const overdueCount = paymentSummary?.summary?.overdueCount ?? 0;
  const overdueAmount = paymentSummary?.summary?.overdueAmount ?? 0;
  const collected = paymentSummary?.summary?.totalPaid ?? 0;
  const pending = paymentSummary?.summary?.totalPending ?? 0;

  const nextSteps: string[] = [];
  const risks: string[] = [];
  if (delivery?.status && delivery.status !== 'delivered') nextSteps.push(`Move delivery forward (current: ${delivery.status}).`);
  if (overdueCount > 0) risks.push(`${overdueCount} overdue installments (₹${overdueAmount.toLocaleString('en-IN')}).`);
  if (!latest?.summary) nextSteps.push('Log the latest customer interaction.');

  return {
    title: 'AI Briefing',
    lastInteraction: latest?.summary ? { at: latest.at, summary: latest.summary } : undefined,
    delivery: delivery ?? undefined,
    payments: paymentSummary ? { overdueCount, overdueAmount, collected, pending } : undefined,
    nextSteps: nextSteps.length ? nextSteps : ['Review customer profile and open items.'],
    risks,
  };
}

