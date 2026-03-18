import { useAppStore } from "@/store/useAppStore";
import type {
  AutomationChannel,
  AutomationLog,
  AutomationRecipient,
  AutomationSettings,
  AutomationTemplate,
  AutomationTrigger,
} from "@/types";

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
      if (primary) {
        result.push({
          name: primary.name,
          phone: primary.phone,
          email: primary.email,
        });
      }
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
    const webhookPath = template.channel === "whatsapp" ? "buildesk-whatsapp" : "buildesk-email";

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
      channel: template.channel as Exclude<AutomationChannel, "in_app">,
      templateId: template.id,
      templateName: template.name,
      trigger: template.trigger,
      recipientPhone: recipient.phone,
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

      const { automationLogs } = useAppStore.getState();
      useAppStore.setState({
        automationLogs: automationLogs.map((l) =>
          l.id === logEntry.id
            ? {
                ...l,
                status: (res.ok ? "sent" : "failed") as AutomationLog["status"],
                errorMessage: res.ok ? undefined : `HTTP ${res.status}`,
              }
            : l,
        ),
      });
    } catch (err) {
      const { automationLogs } = useAppStore.getState();
      useAppStore.setState({
        automationLogs: automationLogs.map((l) =>
          l.id === logEntry.id
            ? { ...l, status: "failed" as const, errorMessage: String(err) }
            : l,
        ),
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

  customers.forEach((customer) => {
    customer.invoices
      .filter((inv) => inv.status === "unpaid")
      .forEach((inv) => {
        const due = new Date(inv.dueDate);
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if ([1, 3, 7].includes(daysUntilDue)) {
          const rep = users.find((u) => u.id === customer.assignedTo);
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
        }
      });
  });
}

