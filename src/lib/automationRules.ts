import type { AutomationTrigger } from '@/types';
import type { AutomationContext } from '@/lib/automationService';
import { isAutomationGloballyEnabled, sendAutomationTemplateById } from '@/lib/automationService';
import { useAppStore } from '@/store/useAppStore';

export type AutomationConditionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'contains';

export interface AutomationRule {
  id: string;
  name: string;
  isActive: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  cooldownHours: number;
  lastFiredAt?: string;
}

export interface AutomationCondition {
  field: string;
  operator: AutomationConditionOperator;
  value: string | number;
}

export type AutomationActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'in_app_notification'
  | 'update_status'
  | 'create_task';

export interface AutomationAction {
  type: AutomationActionType;
  templateId?: string;
  targetRole?: string;
  message?: string;
  delayHours: number;
}

export const DEFAULT_RULES: Omit<AutomationRule, 'id'>[] = [
  {
    name: 'Payment Overdue — Reminder',
    isActive: true,
    trigger: 'invoice_overdue',
    conditions: [{ field: 'days_overdue', operator: 'gte', value: 1 }],
    actions: [
      { type: 'send_whatsapp', templateId: 'tpl-005', delayHours: 0 },
      {
        type: 'in_app_notification',
        targetRole: 'sales_rep',
        message: 'Payment overdue for {{customer_name}} — ₹{{amount_due}}',
        delayHours: 0,
      },
    ],
    cooldownHours: 24,
  },
  {
    name: 'Deal Won — Welcome Customer',
    isActive: true,
    trigger: 'deal_won',
    conditions: [],
    actions: [{ type: 'send_whatsapp', templateId: 'tpl-004', delayHours: 0 }],
    cooldownHours: 0,
  },
  {
    name: 'Deal invoice sent — notify sales manager (optional)',
    isActive: false,
    trigger: 'deal_invoice_sent',
    conditions: [],
    actions: [
      {
        type: 'in_app_notification',
        targetRole: 'sales_manager',
        message: 'A deal invoice was sent from Deals (buildesk-invoice webhook).',
        delayHours: 0,
      },
    ],
    cooldownHours: 0,
  },
];

const RULES_STORAGE_KEY = 'buildesk_automation_rules_v1';

function makeId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10);
}

export function loadRulesFromStore(): AutomationRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) {
      const seeded = DEFAULT_RULES.map((r) => ({ ...r, id: makeId() }));
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as AutomationRule[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveRulesToStore(rules: AutomationRule[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

export function toggleRule(ruleId: string) {
  const rules = loadRulesFromStore();
  const next = rules.map((r) => (r.id === ruleId ? { ...r, isActive: !r.isActive } : r));
  saveRulesToStore(next);
  return next;
}

function getContextValue(field: string, ctx: AutomationContext): unknown {
  // Support both snake_case and camelCase keys for convenience.
  const direct = (ctx as any)[field];
  if (direct !== undefined) return direct;

  const map: Record<string, unknown> = {
    days_since_sent: (ctx as any).daysSinceSent,
    days_overdue: (ctx as any).daysOverdue,
    amount: (ctx as any).amountDue ?? (ctx as any).amountPaid ?? (ctx as any).dealValue,
    amount_due: (ctx as any).amountDue,
    'deal.stage': (ctx as any).dealStage,
    'proposal.status': (ctx as any).proposalStatus,
  };
  return map[field];
}

function evaluateCondition(cond: AutomationCondition, ctx: AutomationContext): boolean {
  const val = getContextValue(cond.field, ctx);
  switch (cond.operator) {
    case 'eq':
      return (val as any) == cond.value;
    case 'neq':
      return (val as any) != cond.value;
    case 'gt':
      return Number(val) > Number(cond.value);
    case 'lt':
      return Number(val) < Number(cond.value);
    case 'gte':
      return Number(val) >= Number(cond.value);
    case 'contains':
      return String(val ?? '').includes(String(cond.value));
    default:
      return false;
  }
}

async function executeAction(action: AutomationAction, ctx: AutomationContext): Promise<void> {
  const run = async () => {
    if (action.type === 'send_whatsapp' || action.type === 'send_email') {
      if (!action.templateId) return;
      await sendAutomationTemplateById(action.templateId, ctx);
      return;
    }
    if (action.type === 'in_app_notification') {
      const msg = action.message ?? 'Automation notification';
      // Minimal: route as INTERNAL_EMAIL notification to keep existing UI.
      useAppStore.getState().pushNotification({
        type: 'INTERNAL_EMAIL',
        to: action.targetRole ?? 'system',
        subject: msg,
        entityId: ctx.dealId ?? ctx.proposalId ?? ctx.customerId ?? 'automation',
      });
      return;
    }
    // update_status / create_task: placeholder for future backend workflows
  };

  const delayMs = Math.max(0, Number(action.delayHours ?? 0)) * 60 * 60 * 1000;
  if (delayMs <= 0) {
    await run();
    return;
  }
  // Note: browser-only, not persistent scheduling.
  setTimeout(() => void run(), delayMs);
}

export async function evaluateAndFire(
  trigger: AutomationTrigger,
  context: AutomationContext,
  rules: AutomationRule[],
): Promise<void> {
  if (!isAutomationGloballyEnabled()) return;
  const now = Date.now();
  const matching = rules.filter((rule) => {
    if (!rule.isActive) return false;
    if (rule.trigger !== trigger) return false;
    if (rule.lastFiredAt && rule.cooldownHours > 0) {
      const hours = (now - new Date(rule.lastFiredAt).getTime()) / (1000 * 60 * 60);
      if (hours < rule.cooldownHours) return false;
    }
    return rule.conditions.every((c) => evaluateCondition(c, context));
  });

  if (matching.length === 0) return;

  const updated = rules.map((r) =>
    matching.some((m) => m.id === r.id) ? { ...r, lastFiredAt: new Date().toISOString() } : r,
  );
  saveRulesToStore(updated);

  for (const rule of matching) {
    for (const action of rule.actions) {
      await executeAction(action, context);
    }
  }
}

