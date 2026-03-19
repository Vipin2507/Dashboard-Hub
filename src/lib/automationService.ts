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
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:4000";
const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

type RuleState = {
  followUpRuns: Record<string, number>;
  paymentDueRuns: Record<string, string>;
  invoiceOverdueRuns: Record<string, string>;
};

function getRuleState(): RuleState {
  try {
    const raw = localStorage.getItem(RULE_STATE_KEY);
    if (!raw) return { followUpRuns: {}, paymentDueRuns: {}, invoiceOverdueRuns: {} };
    const parsed = JSON.parse(raw) as Partial<RuleState>;
    return {
      followUpRuns: parsed.followUpRuns ?? {},
      paymentDueRuns: parsed.paymentDueRuns ?? {},
      invoiceOverdueRuns: parsed.invoiceOverdueRuns ?? {},
    };
  } catch {
    return { followUpRuns: {}, paymentDueRuns: {}, invoiceOverdueRuns: {} };
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
    } else {
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
  expiryDate?: string;
  daysUntilExpiry?: number;
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
    "{{deal_title}}": ctx.dealTitle ?? "",
    "{{deal_value}}": formatINRInline(ctx.dealValue),
    "{{invoice_number}}": ctx.invoiceNumber ?? "",
    "{{amount_due}}": formatINRInline(ctx.amountDue),
    "{{due_date}}": ctx.dueDate ?? "",
    "{{days_until_due}}": String(ctx.daysUntilDue ?? ""),
    "{{days_overdue}}": String(ctx.daysOverdue ?? ""),
    "{{approved_by}}": ctx.approvedBy ?? "",
    "{{rejection_reason}}": ctx.rejectionReason ?? "",
    "{{amount_paid}}": formatINRInline(ctx.amountPaid),
    "{{payment_date}}": ctx.paymentDate ?? "",
    "{{product_name}}": ctx.productName ?? "",
    "{{expiry_date}}": ctx.expiryDate ?? "",
    "{{days_until_expiry}}": String(ctx.daysUntilExpiry ?? ""),
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
      template.channel === "whatsapp"
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
      channel: "email" as const,
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

export function runAutomationRules(): void {
  checkAndTriggerPaymentDue();
  checkAndTriggerProposalFollowUps();
}

