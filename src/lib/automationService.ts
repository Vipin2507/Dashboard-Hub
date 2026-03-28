import { useAppStore } from "@/store/useAppStore";
import type {
  AutomationChannel,
  AutomationLog,
  AutomationRecipient,
  AutomationSettings,
  AutomationTemplate,
  AutomationTrigger,
} from "@/types";

const RULE_STATE_KEY = "buildesk_automation_rule_state_v1";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

type RuleState = {
  followUpRuns: Record<string, number>;
  paymentDueRuns: Record<string, string>;
  invoiceOverdueRuns: Record<string, string>;
  installmentReminderRuns: Record<string, string>;
  dealFollowUpRuns: Record<string, string>;
  subscriptionRenewalRuns: Record<string, string>;
};

function getRuleState(): RuleState {
  try {
    const raw = localStorage.getItem(RULE_STATE_KEY);
    if (!raw)
      return {
        followUpRuns: {},
        paymentDueRuns: {},
        invoiceOverdueRuns: {},
        installmentReminderRuns: {},
        dealFollowUpRuns: {},
        subscriptionRenewalRuns: {},
      };
    const parsed = JSON.parse(raw) as Partial<RuleState>;
    return {
      followUpRuns: parsed.followUpRuns ?? {},
      paymentDueRuns: parsed.paymentDueRuns ?? {},
      invoiceOverdueRuns: parsed.invoiceOverdueRuns ?? {},
      installmentReminderRuns: parsed.installmentReminderRuns ?? {},
      dealFollowUpRuns: parsed.dealFollowUpRuns ?? {},
      subscriptionRenewalRuns: parsed.subscriptionRenewalRuns ?? {},
    };
  } catch {
    return {
      followUpRuns: {},
      paymentDueRuns: {},
      invoiceOverdueRuns: {},
      installmentReminderRuns: {},
      dealFollowUpRuns: {},
      subscriptionRenewalRuns: {},
    };
  }
}

function setRuleState(state: RuleState): void {
  try {
    localStorage.setItem(RULE_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures in private mode/quota issues.
  }
}

function updateAutomationLog(logId: string, updates: Partial<AutomationLog>): void {
  const { automationLogs } = useAppStore.getState();
  const updated = automationLogs.map((l) => (l.id === logId ? { ...l, ...updates } : l));
  useAppStore.setState({ automationLogs: updated });
  const target = updated.find((l) => l.id === logId);
  if (target) {
    void fetch(apiUrl(`/api/automation/logs/${logId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    }).catch(() => undefined);
  }
}

// Call this from anywhere in the app when a triggerable event occurs.
// e.g. triggerAutomation('proposal_sent', { proposalId: 'p-001' })
export async function triggerAutomation(trigger: AutomationTrigger, context: AutomationContext): Promise<void> {
  const { automationTemplates, automationSettings } = useAppStore.getState();

  const templates = automationTemplates.filter((t) => t.trigger === trigger && t.isActive);

  for (const template of templates) {
    const resolvedBody = resolveVariables(template.body, context);
    const resolvedSubject = template.subject ? resolveVariables(template.subject, context) : undefined;

    if (template.channel === "in_app") {
      await sendInAppNotification(template, resolvedBody, context);
    } else if (template.channel === "whatsapp") {
      await fireWhatsAppDirect(template, resolvedBody, context, automationSettings);
    } else if (template.channel === "email" || template.channel === "sms") {
      await fireN8nWebhook(template, resolvedBody, resolvedSubject, context, automationSettings);
    }
  }
}

export interface AutomationContext {
  // Proposal
  proposalId?: string;
  proposalNumber?: string;
  proposalTitle?: string;
  grandTotal?: number;
  validUntil?: string;
  daysSinceSent?: number;
  // Deal
  dealId?: string;
  dealTitle?: string;
  dealValue?: number;
  nextFollowUpDate?: string;
  lossReason?: string;
  // Customer
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  // Invoice
  invoiceId?: string;
  invoiceNumber?: string;
  amountDue?: number;
  dueDate?: string;
  daysUntilDue?: number;
  daysOverdue?: number;
  // Product/subscription
  productName?: string;
  planName?: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  renewalLink?: string;
  renewalAmount?: number;
  subscriptionId?: string;
  planStartDate?: string;
  // Rep/manager
  salesRepId?: string;
  salesRepName?: string;
  salesRepPhone?: string;
  salesManagerId?: string;
  approvedBy?: string;
  rejectionReason?: string;
  // Payments
  amountPaid?: number;
  paymentDate?: string;
  receiptNumber?: string;
  planName?: string;
  paymentsMadeCount?: number;
  paymentsRemainingCount?: number;
  nextDueDate?: string;
  planDetails?: string;
  // Company
  companyName?: string;
}

function formatINRInline(n?: number) {
  return n != null ? `₹${n.toLocaleString("en-IN")}` : "";
}

function normalizeIndiaPhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function resolveVariables(template: string, ctx: AutomationContext): string {
  const map: Record<string, string> = {
    "{{customer_name}}": ctx.customerName ?? "",
    "{{proposal_number}}": ctx.proposalNumber ?? "",
    "{{proposal_title}}": ctx.proposalTitle ?? "",
    "{{grand_total}}": formatINRInline(ctx.grandTotal),
    "{{valid_until}}": ctx.validUntil ?? "",
    "{{days_since_sent}}": String(ctx.daysSinceSent ?? ""),
    "{{sales_rep_name}}": ctx.salesRepName ?? "",
    "{{sales_rep_phone}}": ctx.salesRepPhone ?? "",
    "{{company_name}}": ctx.companyName ?? "Cravingcode Technologies Pvt. Ltd.",
    "{{deal_id}}": ctx.dealId ?? "",
    "{{deal_title}}": ctx.dealTitle ?? "",
    "{{deal_value}}": formatINRInline(ctx.dealValue),
    "{{next_follow_up_date}}": ctx.nextFollowUpDate ?? "",
    "{{loss_reason}}": ctx.lossReason ?? ctx.rejectionReason ?? "",
    "{{invoice_number}}": ctx.invoiceNumber ?? "",
    "{{amount_due}}": formatINRInline(ctx.amountDue),
    "{{due_date}}": ctx.dueDate ?? "",
    "{{days_until_due}}": String(ctx.daysUntilDue ?? ""),
    "{{days_overdue}}": String(ctx.daysOverdue ?? ""),
    "{{approved_by}}": ctx.approvedBy ?? "",
    "{{rejection_reason}}": ctx.rejectionReason ?? "",
    "{{amount_paid}}": formatINRInline(ctx.amountPaid),
    "{{payment_date}}": ctx.paymentDate ?? "",
    "{{customer_id}}": ctx.customerId ?? "",
    "{{receipt_number}}": ctx.receiptNumber ?? "",
    "{{payments_made_count}}": String(ctx.paymentsMadeCount ?? ""),
    "{{payments_remaining_count}}": String(ctx.paymentsRemainingCount ?? ""),
    "{{next_due_date}}": ctx.nextDueDate ?? "",
    "{{plan_details}}": ctx.planDetails ?? "",
    "{{product_name}}": ctx.productName ?? ctx.planName ?? "",
    "{{plan_name}}": ctx.planName ?? ctx.productName ?? "",
    "{{expiry_date}}": ctx.expiryDate ?? "",
    "{{days_until_expiry}}": String(ctx.daysUntilExpiry ?? ""),
    "{{renewal_link}}": ctx.renewalLink ?? "",
    "{{renewal_amount}}": formatINRInline(ctx.renewalAmount),
    "{{plan_start_date}}": ctx.planStartDate ?? "",
  };

  return Object.entries(map).reduce((text, [token, value]) => text.replaceAll(token, value), template);
}

type ResolvedRecipient = { name: string; phone?: string; email?: string; userId?: string };

function resolveRecipients(roles: AutomationRecipient[], ctx: AutomationContext): ResolvedRecipient[] {
  const { customers, users } = useAppStore.getState();
  const result: ResolvedRecipient[] = [];

  for (const role of roles) {
    if (role === "customer" && ctx.customerId) {
      const customer = customers.find((c) => c.id === ctx.customerId);
      const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts[0];
      result.push({
        name: primary?.name ?? ctx.customerName ?? "Customer",
        phone: primary?.phone ?? ctx.customerPhone,
        email: primary?.email ?? ctx.customerEmail,
      });
      continue;
    }

    if (role === "customer" && (ctx.customerPhone || ctx.customerEmail)) {
      result.push({
        name: ctx.customerName ?? "Customer",
        phone: ctx.customerPhone,
        email: ctx.customerEmail,
      });
    }

    if (role === "sales_rep" && ctx.salesRepId) {
      const rep = users.find((u) => u.id === ctx.salesRepId);
      if (rep) {
        result.push({ name: rep.name, email: rep.email, userId: rep.id });
      }
    }

    if (role === "sales_manager") {
      const managers = users.filter((u) => u.role === "sales_manager");
      managers.forEach((m) => result.push({ name: m.name, email: m.email, userId: m.id }));
    }

    if (role === "finance") {
      const finance = users.filter((u) => u.role === "finance");
      finance.forEach((f) => result.push({ name: f.name, email: f.email, userId: f.id }));
    }

    if (role === "super_admin") {
      const admins = users.filter((u) => u.role === "super_admin");
      admins.forEach((a) => result.push({ name: a.name, email: a.email, userId: a.id }));
    }
  }

  return result;
}

async function fireN8nWebhook(
  template: AutomationTemplate,
  body: string,
  subject: string | undefined,
  ctx: AutomationContext,
  settings: AutomationSettings,
): Promise<void> {
  const { appendAutomationLog } = useAppStore.getState();
  const recipients = resolveRecipients(template.recipients, ctx);

  for (const recipient of recipients) {
    const webhookPath = "buildesk-email";
    const normalizedPhone =
      template.channel === "whatsapp" || template.channel === "sms"
        ? normalizeIndiaPhone(recipient.phone)
        : recipient.phone;

    const entityType: AutomationLog["entityType"] = ctx.proposalId
      ? "proposal"
      : ctx.dealId
        ? "deal"
        : ctx.invoiceId
          ? "invoice"
          : "customer";
    const entityId = ctx.proposalId ?? ctx.dealId ?? ctx.invoiceId ?? ctx.customerId ?? "";
    const entityName = ctx.proposalTitle ?? ctx.dealTitle ?? ctx.invoiceNumber ?? ctx.customerName ?? "";

    const payload = {
      channel: (template.channel === "sms" ? "sms" : "email") as "email" | "sms",
      templateId: template.id,
      templateName: template.name,
      trigger: template.trigger,
      recipientPhone: normalizedPhone,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      messageBody: body,
      emailSubject: subject,
      wahaApiUrl: settings.wahaApiUrl,
      wahaApiKey: settings.wahaApiKey,
      wahaSession: settings.wahaSession,
      delayHours: template.delayHours ?? 0,
      entityType,
      entityId,
      entityName,
    };

    const logEntry: AutomationLog = {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      trigger: template.trigger,
      channel: template.channel,
      recipient: recipient.phone ?? recipient.email ?? "",
      recipientName: recipient.name,
      entityType,
      entityId,
      entityName,
      status: "pending",
      sentAt: new Date().toISOString(),
    };
    appendAutomationLog(logEntry);

    try {
      const res = await fetch(`${settings.n8nWebhookBase}/${webhookPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      updateAutomationLog(logEntry.id, {
        status: (res.ok ? "sent" : "failed") as AutomationLog["status"],
        errorMessage: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (err) {
      updateAutomationLog(logEntry.id, {
        status: "failed",
        errorMessage: String(err),
      });
    }
  }
}

async function fireWhatsAppDirect(
  template: AutomationTemplate,
  body: string,
  ctx: AutomationContext,
  settings: AutomationSettings,
): Promise<void> {
  const { appendAutomationLog } = useAppStore.getState();
  const recipients = resolveRecipients(template.recipients, ctx);

  for (const recipient of recipients) {
    const entityType: AutomationLog["entityType"] = ctx.proposalId
      ? "proposal"
      : ctx.dealId
        ? "deal"
        : ctx.invoiceId
          ? "invoice"
          : "customer";
    const entityId = ctx.proposalId ?? ctx.dealId ?? ctx.invoiceId ?? ctx.customerId ?? "";
    const entityName = ctx.proposalTitle ?? ctx.dealTitle ?? ctx.invoiceNumber ?? ctx.customerName ?? "";
    const phone = normalizeIndiaPhone(recipient.phone);
    const logEntry: AutomationLog = {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      trigger: template.trigger,
      channel: "whatsapp",
      recipient: phone ?? recipient.phone ?? "",
      recipientName: recipient.name,
      entityType,
      entityId,
      entityName,
      status: "pending",
      sentAt: new Date().toISOString(),
    };
    appendAutomationLog(logEntry);

    if (!phone) {
      updateAutomationLog(logEntry.id, {
        status: "failed",
        errorMessage: "Missing/invalid customer phone for WhatsApp",
      });
      continue;
    }

    try {
      const res = await fetch("/waha/api/sendText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": settings.wahaApiKey,
        },
        body: JSON.stringify({
          session: settings.wahaSession,
          chatId: `${phone}@c.us`,
          text: body,
        }),
      });
      const errBody = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 400);
      updateAutomationLog(logEntry.id, {
        status: res.ok ? "sent" : "failed",
        errorMessage: res.ok ? undefined : `${res.status} ${res.statusText}${errBody ? ` — ${errBody}` : ""}`,
      });
    } catch (err) {
      updateAutomationLog(logEntry.id, {
        status: "failed",
        errorMessage: String(err),
      });
    }
  }
}

async function sendInAppNotification(template: AutomationTemplate, body: string, ctx: AutomationContext): Promise<void> {
  const { appendAutomationLog } = useAppStore.getState();
  const recipients = resolveRecipients(template.recipients, ctx);

  const entityType: AutomationLog["entityType"] = ctx.proposalId ? "proposal" : ctx.dealId ? "deal" : "customer";
  const entityId = ctx.proposalId ?? ctx.dealId ?? ctx.customerId ?? "";
  const entityName = ctx.proposalTitle ?? ctx.dealTitle ?? ctx.customerName ?? "";

  for (const r of recipients) {
    appendAutomationLog({
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      trigger: template.trigger,
      channel: "in_app",
      recipient: r.userId ?? "",
      recipientName: r.name,
      entityType,
      entityId,
      entityName,
      status: "sent",
      sentAt: new Date().toISOString(),
    });
  }
}

// Trigger if due in 1, 3, or 7 days (frontend-only helper)
export function checkAndTriggerPaymentDue(): void {
  const { customers, users } = useAppStore.getState();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const state = getRuleState();

  customers.forEach((customer) => {
    customer.invoices
      .filter((inv) => inv.status === "unpaid")
      .forEach((inv) => {
        const due = new Date(inv.dueDate);
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const rep = users.find((u) => u.id === customer.assignedTo);

        if ([1, 3, 7].includes(daysUntilDue)) {
          const key = `${customer.id}:${inv.id}:${daysUntilDue}`;
          if (state.paymentDueRuns[key] === todayIso) return;
          void triggerAutomation("payment_due", {
            customerId: customer.id,
            customerName: customer.companyName,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amountDue: inv.totalAmount,
            dueDate: new Date(inv.dueDate).toLocaleDateString("en-IN"),
            daysUntilDue,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
          });
          state.paymentDueRuns[key] = todayIso;
        }

        if (daysUntilDue < 0) {
          const daysOverdue = Math.abs(daysUntilDue);
          const key = `${customer.id}:${inv.id}:${daysOverdue}`;
          if (state.invoiceOverdueRuns[key] === todayIso) return;
          void triggerAutomation("invoice_overdue", {
            customerId: customer.id,
            customerName: customer.companyName,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amountDue: inv.totalAmount,
            dueDate: new Date(inv.dueDate).toLocaleDateString("en-IN"),
            daysOverdue,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
          });
          state.invoiceOverdueRuns[key] = todayIso;
        }
      });
  });

  setRuleState(state);
}

export function checkAndTriggerProposalFollowUps(): void {
  const { proposals, customers, users, automationTemplates } = useAppStore.getState();
  const followUpTemplates = automationTemplates.filter(
    (t) => t.isActive && t.trigger === "proposal_follow_up",
  );
  if (followUpTemplates.length === 0) return;

  const now = Date.now();
  const state = getRuleState();
  let changed = false;

  proposals
    .filter((p) => p.status === "sent" && p.sentAt)
    .forEach((proposal) => {
      const sentTime = new Date(proposal.sentAt as string).getTime();
      if (Number.isNaN(sentTime)) return;
      const elapsedHours = (now - sentTime) / (1000 * 60 * 60);
      const daysSinceSent = Math.max(0, Math.floor(elapsedHours / 24));
      const customer = customers.find((c) => c.id === proposal.customerId);
      const rep = users.find((u) => u.id === proposal.assignedTo);

      followUpTemplates.forEach((tpl) => {
        const delay = tpl.delayHours ?? 0;
        if (elapsedHours < delay) return;
        const interval = tpl.repeatEveryHours ?? 0;
        const maxRuns = tpl.maxRepeats && tpl.maxRepeats > 0 ? tpl.maxRepeats : 1;
        const key = `${tpl.id}:${proposal.id}`;
        const already = state.followUpRuns[key] ?? 0;
        if (already >= maxRuns) return;

        if (interval > 0 && already > 0) {
          const nextAt = delay + already * interval;
          if (elapsedHours < nextAt) return;
        }
        if (interval <= 0 && already > 0) return;

        changed = true;
        state.followUpRuns[key] = already + 1;
        void triggerAutomation("proposal_follow_up", {
          proposalId: proposal.id,
          proposalNumber: proposal.proposalNumber,
          proposalTitle: proposal.title,
          grandTotal: proposal.finalQuoteValue ?? proposal.grandTotal,
          validUntil: proposal.validUntil,
          daysSinceSent,
          customerId: customer?.id,
          customerName: customer?.companyName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
        });
      });
    });

  if (changed) setRuleState(state);
}

const INSTALLMENT_REMINDER_SETTINGS_KEY = "buildesk_payment_installment_reminder_settings_v1";

export type InstallmentReminderSettings = {
  /** e.g. [1] = one day before due */
  remindDaysBefore: number[];
  remindOnDue: boolean;
  /** e.g. [3] = send on 3rd day after due (overdue nudge) */
  remindDaysAfterDue: number[];
};

export function getInstallmentReminderSettings(): InstallmentReminderSettings {
  try {
    const raw = localStorage.getItem(INSTALLMENT_REMINDER_SETTINGS_KEY);
    if (!raw) {
      return { remindDaysBefore: [1], remindOnDue: true, remindDaysAfterDue: [3] };
    }
    const p = JSON.parse(raw) as Partial<InstallmentReminderSettings>;
    return {
      remindDaysBefore: Array.isArray(p.remindDaysBefore) ? p.remindDaysBefore : [1],
      remindOnDue: p.remindOnDue !== false,
      remindDaysAfterDue: Array.isArray(p.remindDaysAfterDue) ? p.remindDaysAfterDue : [3],
    };
  } catch {
    return { remindDaysBefore: [1], remindOnDue: true, remindDaysAfterDue: [3] };
  }
}

export function saveInstallmentReminderSettings(s: InstallmentReminderSettings): void {
  localStorage.setItem(INSTALLMENT_REMINDER_SETTINGS_KEY, JSON.stringify(s));
}

function calendarDayDiff(fromIsoDate: string, toIsoDate: string): number {
  const a = new Date(`${fromIsoDate}T12:00:00`).getTime();
  const b = new Date(`${toIsoDate}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/** Call when payment plan “remaining” rows are loaded (e.g. Payment Center). Uses payment_due / invoice_overdue templates. */
export function checkInstallmentPaymentReminders(
  rows: Array<{
    customerId: string;
    customerName?: string;
    dueDate: string;
    dueAmount: number;
    category: string;
    planName?: string;
    planId?: string;
  }>,
  settings: InstallmentReminderSettings,
): void {
  const today = new Date().toISOString().slice(0, 10);
  const { customers, users } = useAppStore.getState();
  const state = getRuleState();
  if (!state.installmentReminderRuns) state.installmentReminderRuns = {};
  let changed = false;

  rows.forEach((row) => {
    if (row.category === "paid") return;
    const due = row.dueDate;
    const daysUntilDue = calendarDayDiff(today, due);
    const daysAfterDue = calendarDayDiff(due, today);

    const customer = customers.find((c) => c.id === row.customerId);
    const rep = users.find((u) => u.id === customer?.assignedTo);
    const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];

    const baseCtx = {
      customerId: row.customerId,
      customerName: customer?.companyName ?? row.customerName ?? "Customer",
      customerPhone: primary?.phone,
      customerEmail: primary?.email,
      invoiceNumber: row.planName ? `${row.planName} · installment` : "Installment",
      amountDue: row.dueAmount,
      dueDate: new Date(due + "T12:00:00").toLocaleDateString("en-IN"),
      salesRepId: rep?.id,
      salesRepName: rep?.name,
    };

    const fire = (trigger: "payment_due" | "invoice_overdue", keySuffix: string, extra: Record<string, unknown>) => {
      const key = `${row.customerId}:${row.planId ?? "plan"}:${due}:${keySuffix}:${today}`;
      if (state.installmentReminderRuns[key] === today) return;
      changed = true;
      state.installmentReminderRuns[key] = today;
      void triggerAutomation(trigger, { ...baseCtx, ...extra } as AutomationContext);
    };

    if (settings.remindDaysBefore.includes(daysUntilDue)) {
      fire("payment_due", `before:${daysUntilDue}`, { daysUntilDue });
    }
    if (settings.remindOnDue && daysUntilDue === 0) {
      fire("payment_due", "on_due", { daysUntilDue: 0 });
    }
    if (daysAfterDue >= 1 && settings.remindDaysAfterDue.includes(daysAfterDue)) {
      fire("invoice_overdue", `after:${daysAfterDue}`, { daysOverdue: daysAfterDue });
    }
  });

  if (changed) setRuleState(state);
}

/** Fire deal_follow_up templates 1 day before and on next follow-up date (per deal, once per day). */
export function checkDealFollowUpReminders(
  deals: Array<{
    id: string;
    name: string;
    customerId: string;
    ownerUserId: string;
    value: number;
    nextFollowUpDate?: string | null;
    dealStatus?: string | null;
  }>,
): void {
  const today = new Date().toISOString().slice(0, 10);
  const { customers, users } = useAppStore.getState();
  const state = getRuleState();
  if (!state.dealFollowUpRuns) state.dealFollowUpRuns = {};
  let changed = false;

  deals.forEach((deal) => {
    const fu = deal.nextFollowUpDate;
    if (!fu) return;
    if ((deal as { deletedAt?: string | null }).deletedAt) return;
    if (deal.dealStatus === "Closed/Won" || deal.dealStatus === "Closed/Lost") return;
    const daysUntil = calendarDayDiff(today, fu);
    if (daysUntil !== 1 && daysUntil !== 0) return;

    const customer = customers.find((c) => c.id === deal.customerId);
    const rep = users.find((u) => u.id === deal.ownerUserId);
    const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
    const key = `${deal.id}:${fu}:${daysUntil}:${today}`;
    if (state.dealFollowUpRuns[key] === today) return;
    changed = true;
    state.dealFollowUpRuns[key] = today;
    void triggerAutomation("deal_follow_up", {
      dealId: deal.id,
      dealTitle: deal.name,
      dealValue: deal.value,
      nextFollowUpDate: new Date(fu + "T12:00:00").toLocaleDateString("en-IN"),
      customerId: deal.customerId,
      customerName: customer?.companyName,
      customerPhone: primary?.phone,
      customerEmail: primary?.email,
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      companyName: "Cravingcode Technologies Pvt. Ltd.",
    });
  });

  if (changed) setRuleState(state);
}

export function runAutomationRules(): void {
  checkAndTriggerPaymentDue();
  checkAndTriggerProposalFollowUps();
  const { deals } = useAppStore.getState();
  checkDealFollowUpReminders(deals);
  void checkSubscriptionRenewalAutomation();
}

type RenewalSettingsApi = {
  enabled30d?: boolean;
  enabledExpiryDay?: boolean;
  enabledOverdue?: boolean;
  autoStopOnRenewal?: boolean;
  channels30d?: Array<"whatsapp" | "email" | "sms">;
  channelsExpiryDay?: Array<"whatsapp" | "email" | "sms">;
  channelsOverdue?: Array<"whatsapp" | "email" | "sms">;
  overdueRepeatDays?: number;
  template30d?: string;
  templateExpiryDay?: string;
  templateOverdue?: string;
};

/** Manual / bulk send — uses the same WhatsApp + n8n paths as templates. */
export async function sendSubscriptionReminderChannels(
  channels: Array<"whatsapp" | "email" | "sms">,
  body: string,
  subject: string,
  ctx: AutomationContext,
): Promise<void> {
  const { automationSettings, automationTemplates } = useAppStore.getState();
  const uniq = [...new Set(channels)];
  const baseFake = (): AutomationTemplate => ({
    id: "direct-renewal",
    name: "Subscription reminder",
    trigger: "subscription_renewal_30d",
    channel: "whatsapp",
    recipients: ["customer"],
    body: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  for (const ch of uniq) {
    const tpl = { ...baseFake(), channel: ch };
    if (ch === "whatsapp") {
      await fireWhatsAppDirect(tpl, body, ctx, automationSettings);
    } else {
      await fireN8nWebhook(tpl, body, subject, ctx, automationSettings);
    }
  }
}

async function recordSubscriptionReminderKind(subscriptionId: string, kind: "30d" | "expiry_day" | "overdue") {
  try {
    await fetch(apiUrl(`/api/subscriptions/${encodeURIComponent(subscriptionId)}/record-reminder`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
  } catch {
    /* ignore */
  }
}

export async function checkSubscriptionRenewalAutomation(): Promise<void> {
  try {
    const res = await fetch(apiUrl("/api/subscriptions/tracker"));
    if (!res.ok) return;
    const data = (await res.json()) as {
      rows: Array<{
        id: string;
        customerId: string;
        customerName: string;
        customerEmail?: string;
        customerPhone?: string;
        planName: string;
        expiryDate: string;
        renewalAmount: number;
        daysLeft: number;
        bucket: string;
        pendingAutomations: boolean;
      }>;
      settings: RenewalSettingsApi;
    };
    const settings = data.settings;
    const state = getRuleState();
    if (!state.subscriptionRenewalRuns) state.subscriptionRenewalRuns = {};
    const today = new Date().toISOString().slice(0, 10);
    const { customers, users, automationTemplates } = useAppStore.getState();
    let changed = false;

    const renewalBaseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/customers/`
        : "https://localhost:5173/customers/";

    for (const row of data.rows) {
      if (!row.pendingAutomations) continue;
      if (row.bucket === "renewed_month") continue;

      const customer = customers.find((c) => c.id === row.customerId);
      const rep = users.find((u) => u.id === customer?.assignedTo);
      const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
      const renewalLink = `${renewalBaseUrl}${row.customerId}?tab=payments`;

      const ctx: AutomationContext = {
        customerId: row.customerId,
        customerName: row.customerName ?? customer?.companyName,
        customerPhone: row.customerPhone ?? primary?.phone,
        customerEmail: row.customerEmail ?? primary?.email,
        planName: row.planName,
        productName: row.planName,
        expiryDate: row.expiryDate,
        daysUntilExpiry: row.daysLeft,
        renewalAmount: row.renewalAmount,
        renewalLink,
        subscriptionId: row.id,
        salesRepId: rep?.id,
        salesRepName: rep?.name,
      };

      const daysLeft = row.daysLeft;

      const fireWithFallback = async (
        trigger: AutomationTrigger,
        apiKind: "30d" | "expiry_day" | "overdue",
        tplKey: keyof RenewalSettingsApi,
        channelsKey: keyof RenewalSettingsApi,
      ) => {
        const tpls = automationTemplates.filter((t) => t.trigger === trigger && t.isActive);
        if (tpls.length > 0) {
          await triggerAutomation(trigger, { ...ctx, daysOverdue: daysLeft < 0 ? Math.abs(daysLeft) : undefined });
        } else {
          const tmpl =
            (settings[tplKey] as string) ||
            "Reminder: {{plan_name}} for {{customer_name}} expires {{expiry_date}}. {{renewal_link}}";
          const text = resolveVariables(tmpl, {
            ...ctx,
            daysOverdue: daysLeft < 0 ? Math.abs(daysLeft) : undefined,
          });
          const chs = (settings[channelsKey] as Array<"whatsapp" | "email" | "sms">) ?? ["email"];
          await sendSubscriptionReminderChannels(chs, text, "Subscription renewal", {
            ...ctx,
            daysOverdue: daysLeft < 0 ? Math.abs(daysLeft) : undefined,
          });
        }
        await recordSubscriptionReminderKind(row.id, apiKind);
      };

      if (settings.enabled30d !== false && daysLeft === 30) {
        const key = `${row.id}:pre30:${today}`;
        if (state.subscriptionRenewalRuns[key] !== today) {
          changed = true;
          state.subscriptionRenewalRuns[key] = today;
          await fireWithFallback("subscription_renewal_30d", "30d", "template30d", "channels30d");
        }
      }

      if (settings.enabledExpiryDay !== false && daysLeft === 0) {
        const key = `${row.id}:exp0:${today}`;
        if (state.subscriptionRenewalRuns[key] !== today) {
          changed = true;
          state.subscriptionRenewalRuns[key] = today;
          await fireWithFallback("subscription_expiry_day", "expiry_day", "templateExpiryDay", "channelsExpiryDay");
        }
      }

      if (settings.enabledOverdue !== false && daysLeft < 0) {
        const overdueDays = Math.abs(daysLeft);
        const interval = Math.max(1, settings.overdueRepeatDays ?? 7);
        if (overdueDays % interval === 0) {
          const key = `${row.id}:od:${overdueDays}:${today}`;
          if (state.subscriptionRenewalRuns[key] !== today) {
            changed = true;
            state.subscriptionRenewalRuns[key] = today;
            ctx.daysOverdue = overdueDays;
            await fireWithFallback("subscription_overdue", "overdue", "templateOverdue", "channelsOverdue");
          }
        }
      }
    }

    if (changed) setRuleState(state);
  } catch {
    /* offline API */
  }
}

