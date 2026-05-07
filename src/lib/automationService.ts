import { fetchN8nWebhook, fetchWahaSendText } from "@/lib/automationEndpoints";
import { primaryReachabilityFromUnknown } from "@/lib/customerNotifyContacts";
import { api, apiUrl } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import type {
  AutomationChannel,
  AutomationLog,
  AutomationRecipient,
  AutomationSettings,
  AutomationTemplate,
  AutomationTrigger,
} from "@/types";
import type { Proposal } from "@/types";

const RULE_STATE_KEY = "buildesk_automation_rule_state_v1";
const TEMPLATE_REFRESH_TTL_MS = 15_000;
let lastTemplateRefreshAt = 0;

async function loadProposalForPdf(proposalId: string): Promise<Proposal> {
  const list = await api.get<Proposal[]>("/proposals");
  const p = list.find((x) => x.id === proposalId);
  if (!p) throw new Error("Proposal not found");
  return p;
}

async function loadDealForEstimatePdf(dealId: string) {
  const list = await api.get<any[]>("/deals");
  const d = list.find((x) => x.id === dealId);
  if (!d) throw new Error("Deal not found");
  return d as any;
}

async function refreshTemplatesIfStale(): Promise<void> {
  const now = Date.now();
  if (now - lastTemplateRefreshAt < TEMPLATE_REFRESH_TTL_MS) return;
  lastTemplateRefreshAt = now;
  try {
    const res = await fetch(apiUrl("/api/automation/templates"));
    if (!res.ok) return;
    const items = (await res.json()) as AutomationTemplate[];
    if (Array.isArray(items) && items.length > 0) {
      useAppStore.setState({ automationTemplates: items });
    }
  } catch {
    // ignore offline API
  }
}

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
  // Ensure we don't use stale templates (common when templates are edited in backend/other tab
  // and the user sends immediately without visiting the Automation page).
  await refreshTemplatesIfStale();
  const { automationTemplates, automationSettings } = useAppStore.getState();
  const ctx = enrichAutomationContext(context);

  const templates = automationTemplates.filter((t) => t.trigger === trigger && t.isActive);

  for (const template of templates) {
    const resolvedBody = resolveVariables(template.body, ctx);
    const resolvedSubject = template.subject ? resolveVariables(template.subject, ctx) : undefined;

    if (template.channel === "in_app") {
      await sendInAppNotification(template, resolvedBody, ctx);
    } else if (template.channel === "whatsapp") {
      await fireWhatsAppDirect(template, resolvedBody, ctx, automationSettings);
    } else if (template.channel === "email" || template.channel === "sms") {
      await fireN8nWebhook(template, resolvedBody, resolvedSubject, ctx, automationSettings);
    }
  }

  // Rules engine (MoM 19/04/2026) — optional local rules that can fire additional actions.
  try {
    const { evaluateAndFire, loadRulesFromStore } = await import('@/lib/automationRules');
    await evaluateAndFire(trigger, ctx, loadRulesFromStore());
  } catch {
    // ignore
  }
}

/** Send a specific template by id (used by Rules actions). */
export async function sendAutomationTemplateById(templateId: string, context: AutomationContext): Promise<void> {
  const { automationTemplates, automationSettings } = useAppStore.getState();
  const template = automationTemplates.find((t) => t.id === templateId);
  if (!template) return;
  const ctx = enrichAutomationContext(context);
  const resolvedBody = resolveVariables(template.body, ctx);
  const resolvedSubject = template.subject ? resolveVariables(template.subject, ctx) : undefined;
  if (template.channel === 'in_app') {
    await sendInAppNotification(template, resolvedBody, ctx);
  } else if (template.channel === 'whatsapp') {
    await fireWhatsAppDirect(template, resolvedBody, ctx, automationSettings);
  } else if (template.channel === 'email' || template.channel === 'sms') {
    await fireN8nWebhook(template, resolvedBody, resolvedSubject, ctx, automationSettings);
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
  estimateNumber?: string;
  /** Optional Deal.estimateJson to build PDF without refetching the deal list. */
  estimateJson?: string;
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
  salesRepEmail?: string;
  salesManagerId?: string;
  approvedBy?: string;
  rejectionReason?: string;
  // Payments
  amountPaid?: number;
  paymentDate?: string;
  receiptNumber?: string;
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

/** Fill sales rep / customer contact fields from the store when callers pass ids only. */
function enrichAutomationContext(ctx: AutomationContext): AutomationContext {
  const { users, customers } = useAppStore.getState();
  let next: AutomationContext = { ...ctx };

  if (next.salesRepId) {
    const rep = users.find((u) => u.id === next.salesRepId);
    if (rep) {
      const phone = rep.phone != null && String(rep.phone).trim() ? String(rep.phone).trim() : undefined;
      next = {
        ...next,
        salesRepName: next.salesRepName ?? rep.name,
        salesRepPhone: next.salesRepPhone ?? phone,
        salesRepEmail: next.salesRepEmail ?? rep.email,
      };
    }
  }

  if (next.customerId) {
    const customer = customers.find((c) => c.id === next.customerId);
    if (customer) {
      const r = primaryReachabilityFromUnknown(customer);
      next = {
        ...next,
        customerName: next.customerName ?? customer.customerName ?? customer.companyName ?? r.name,
        customerPhone: next.customerPhone ?? r.phone,
        customerEmail: next.customerEmail ?? r.email,
      };
    }
  }

  return next;
}

function resolveVariables(template: string, ctx: AutomationContext): string {
  const map: Record<string, string> = {
    "{{customer_name}}": ctx.customerName ?? "",
    "{{customer_phone}}": ctx.customerPhone ?? "",
    "{{customer_email}}": ctx.customerEmail ?? "",
    "{{proposal_number}}": ctx.proposalNumber ?? "",
    "{{proposal_title}}": ctx.proposalTitle ?? "",
    "{{grand_total}}": formatINRInline(ctx.grandTotal),
    "{{valid_until}}": ctx.validUntil ?? "",
    "{{days_since_sent}}": String(ctx.daysSinceSent ?? ""),
    "{{sales_rep_name}}": ctx.salesRepName ?? "",
    "{{sales_rep_phone}}": ctx.salesRepPhone ?? "",
    "{{sales_rep_email}}": ctx.salesRepEmail ?? "",
    "{{company_name}}": ctx.companyName ?? "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
    "{{deal_id}}": ctx.dealId ?? "",
    "{{deal_title}}": ctx.dealTitle ?? "",
    "{{deal_value}}": formatINRInline(ctx.dealValue),
    "{{estimate_number}}": ctx.estimateNumber ?? "",
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

  // `String.prototype.replaceAll` isn't available on all TS lib targets in this repo.
  return Object.entries(map).reduce((text, [token, value]) => text.split(token).join(value), template);
}

type ResolvedRecipient = { name: string; phone?: string; email?: string; userId?: string };

function resolveRecipients(roles: AutomationRecipient[], ctx: AutomationContext): ResolvedRecipient[] {
  const { customers, users } = useAppStore.getState();
  const result: ResolvedRecipient[] = [];

  for (const role of roles) {
    if (role === "customer" && ctx.customerId) {
      const customer = customers.find((c) => c.id === ctx.customerId);
      const r = primaryReachabilityFromUnknown(customer);
      result.push({
        name: r.name ?? ctx.customerName ?? "Customer",
        phone: r.phone ?? ctx.customerPhone,
        email: r.email ?? ctx.customerEmail,
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
        const phone = rep.phone != null && String(rep.phone).trim() ? String(rep.phone).trim() : undefined;
        result.push({ name: rep.name, email: rep.email, phone, userId: rep.id });
      }
    }

    if (role === "sales_manager") {
      const managers = users.filter((u) => u.role === "sales_manager");
      managers.forEach((m) => {
        const phone = m.phone != null && String(m.phone).trim() ? String(m.phone).trim() : undefined;
        result.push({ name: m.name, email: m.email, phone, userId: m.id });
      });
    }

    if (role === "finance") {
      const finance = users.filter((u) => u.role === "finance");
      finance.forEach((f) => {
        const phone = f.phone != null && String(f.phone).trim() ? String(f.phone).trim() : undefined;
        result.push({ name: f.name, email: f.email, phone, userId: f.id });
      });
    }

    if (role === "super_admin") {
      const admins = users.filter((u) => u.role === "super_admin");
      admins.forEach((a) => {
        const phone = a.phone != null && String(a.phone).trim() ? String(a.phone).trim() : undefined;
        result.push({ name: a.name, email: a.email, phone, userId: a.id });
      });
    }
  }

  return result;
}

/** Merge comma/semicolon-separated address lists; dedupe case-insensitively, preserve first-seen casing. */
export function mergeEmailCcLists(...parts: (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    for (const seg of p.split(/[,;]/)) {
      const t = seg.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out.join(", ");
}

/** Resolves `{{...}}` tokens in settings + template CC, then merges (same rules as subject/body). */
export function resolveMergedEmailCc(
  settings: Pick<AutomationSettings, "emailCc">,
  template: Pick<AutomationTemplate, "emailCc">,
  ctx: AutomationContext,
): string {
  const enriched = enrichAutomationContext({ ...ctx });
  const s = resolveVariables((settings.emailCc ?? "").trim(), enriched);
  const t = resolveVariables((template.emailCc ?? "").trim(), enriched);
  return mergeEmailCcLists(s, t);
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

  // For proposal-related emails, attach the proposal PDF as binary (n8n expects `proposal_pdf`).
  const shouldAttachProposalPdf =
    template.channel === "email" &&
    !!ctx.proposalId &&
    String(template.trigger || "").toLowerCase().startsWith("proposal");

  // For estimate share emails, attach the estimate PDF as binary (n8n expects `estimate_pdf`).
  const shouldAttachEstimatePdf =
    template.channel === "email" && template.trigger === "estimate_shared" && (!!ctx.estimateJson || !!ctx.dealId);

  let proposalPdfBlob: Blob | null = null;
  let proposalPdfName = "proposal.pdf";
  if (shouldAttachProposalPdf) {
    try {
      const proposal = await loadProposalForPdf(ctx.proposalId as string);
      const { generateProposalPdfBlob } = await import("@/lib/generateProposalPdf");
      proposalPdfBlob = await generateProposalPdfBlob(proposal as never);
      const num = (ctx.proposalNumber || (proposal as unknown as { proposalNumber?: string }).proposalNumber || "").trim();
      proposalPdfName = num ? `Proposal-${num}.pdf` : `Proposal-${ctx.proposalId}.pdf`;
    } catch {
      proposalPdfBlob = null;
    }
  }

  let estimatePdfBlob: Blob | null = null;
  let estimatePdfName = "estimate.pdf";
  if (shouldAttachEstimatePdf) {
    try {
      const deal =
        ctx.estimateJson
          ? ({ id: ctx.dealId ?? "deal", estimateJson: ctx.estimateJson, estimateNumber: ctx.estimateNumber } as any)
          : await loadDealForEstimatePdf(ctx.dealId as string);
      const { generateEstimatePdfBlob } = await import("@/lib/generateEstimatePdf");
      estimatePdfBlob = await generateEstimatePdfBlob(deal);
      const num = (ctx.estimateNumber || deal.estimateNumber || "").trim();
      estimatePdfName = num ? `Estimate-${num}.pdf` : `Estimate-${ctx.dealId}.pdf`;
    } catch {
      estimatePdfBlob = null;
    }
  }

  for (const recipient of recipients) {
    const webhookPath = template.trigger === "estimate_shared" ? "buildesk-estimate" : "buildesk-email";
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

    const emailCc = resolveMergedEmailCc(settings, template, ctx);
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
      ...(template.channel === "email" ? { emailCc } : {}),
      wahaApiUrl: settings.wahaApiUrl,
      wahaApiKey: settings.wahaApiKey,
      wahaSession: settings.wahaSession,
      delayHours: template.delayHours ?? 0,
      entityType,
      entityId,
      entityName,
    };

    console.log("[fireN8nWebhook] Payload keys:", Object.keys(payload));
    console.log("[fireN8nWebhook] Payload sample:", JSON.stringify(payload).substring(0, 300));

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
      const init: RequestInit =
        (proposalPdfBlob || estimatePdfBlob) && template.channel === "email"
          ? (() => {
              const formData = new FormData();
              // Keep backward compatibility with existing n8n mappings like:
              //   {{ $json.body.delayHours }}
              // by also sending payload fields as top-level form fields.
              // `data` remains as a full JSON blob for convenience/debugging.
              formData.append("data", JSON.stringify(payload));
              for (const [k, v] of Object.entries(payload)) {
                if (v === undefined || v === null) continue;
                // n8n webhook parses multipart fields as strings
                formData.append(k, typeof v === "string" ? v : String(v));
              }
              if (proposalPdfBlob) formData.append("proposal_pdf", proposalPdfBlob, proposalPdfName);
              if (estimatePdfBlob) formData.append("estimate_pdf", estimatePdfBlob, estimatePdfName);
              return { method: "POST", body: formData };
            })()
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            };

      if (!init.body) {
        console.error("[fireN8nWebhook] CRITICAL: init.body is empty", { init });
        updateAutomationLog(logEntry.id, {
          status: "failed",
          errorMessage: "Payload was not set in init object",
        });
        continue;
      }

      const bodyPreview =
        typeof init.body === "string" ? `JSON string (${init.body.length} bytes)` : "FormData";
      console.log("[fireN8nWebhook] About to send", {
        webhookPath,
        bodyType: bodyPreview,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
      });
      console.log("[fireN8nWebhook] init.body type:", init.body ? typeof init.body : "EMPTY");

      const res = await fetchN8nWebhook(settings, webhookPath, init);
      const errBody = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 600);
      const errShort = errBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);

      updateAutomationLog(logEntry.id, {
        status: (res.ok ? "sent" : "failed") as AutomationLog["status"],
        errorMessage: res.ok ? undefined : `HTTP ${res.status}${errShort ? ` — ${errShort}` : ""}`,
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
      const useHttpsProxy =
        typeof window !== "undefined" && window.location.protocol === "https:" && !import.meta.env.DEV;
      if (!useHttpsProxy && !import.meta.env.DEV && !settings.wahaApiUrl?.trim()) {
        updateAutomationLog(logEntry.id, {
          status: "failed",
          errorMessage: "WAHA API URL is not set — open Automation → Settings and save your WAHA base URL.",
        });
        continue;
      }
      const res = await fetchWahaSendText(settings, {
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
      const errShort = errBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      updateAutomationLog(logEntry.id, {
        status: res.ok ? "sent" : "failed",
        errorMessage: res.ok
          ? undefined
          : `${res.status} ${res.statusText}${errShort ? ` — ${errShort}` : ""}`,
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
            customerName: customer.customerName ?? customer.companyName,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amountDue: inv.totalAmount,
            dueDate: new Date(inv.dueDate).toLocaleDateString("en-IN"),
            daysUntilDue,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
            salesRepPhone: rep?.phone ?? undefined,
            salesRepEmail: rep?.email,
          });
          state.paymentDueRuns[key] = todayIso;
        }

        if (daysUntilDue < 0) {
          const daysOverdue = Math.abs(daysUntilDue);
          const key = `${customer.id}:${inv.id}:${daysOverdue}`;
          if (state.invoiceOverdueRuns[key] === todayIso) return;
          void triggerAutomation("invoice_overdue", {
            customerId: customer.id,
            customerName: customer.customerName ?? customer.companyName,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amountDue: inv.totalAmount,
            dueDate: new Date(inv.dueDate).toLocaleDateString("en-IN"),
            daysOverdue,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
            salesRepPhone: rep?.phone ?? undefined,
            salesRepEmail: rep?.email,
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

      // Cold/Won/Deal-created proposals should not receive follow-ups.
      if (proposal.status === "cold" || proposal.status === "won" || proposal.status === "deal_created") return;

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
          customerName: customer?.customerName ?? customer?.companyName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          salesRepPhone: rep?.phone ?? undefined,
          salesRepEmail: rep?.email,
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
    customerName: customer?.customerName ?? row.customerName ?? customer?.companyName ?? "Customer",
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
      customerName: customer?.customerName ?? customer?.companyName,
      customerPhone: primary?.phone,
      customerEmail: primary?.email,
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
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
          const text = resolveVariables(
            tmpl,
            enrichAutomationContext({
              ...ctx,
              daysOverdue: daysLeft < 0 ? Math.abs(daysLeft) : undefined,
            }),
          );
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

