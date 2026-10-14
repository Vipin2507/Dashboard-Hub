import { apiUrl } from "@/lib/api";
import { fetchN8nWebhook, fetchWahaSendText } from "@/lib/automationEndpoints";
import { resolveMergedEmailCc, resolveWahaSession } from "@/lib/automationService";
import { resolveCustomerNotifyReachability } from "@/lib/customerNotifyContacts";
import { normalizeWhatsAppPhone } from "@/lib/executiveReminder";
import { useAppStore } from "@/store/useAppStore";
import type { Proposal } from "@/types";
import type { AutomationLog } from "@/types/automation";

export type ProposalFollowUpFields = {
  customerName: string;
  companyName: string;
  proposalValue: string;
  creationDate: string;
};

export type ChannelSendResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export function formatProposalFollowUpDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatProposalFollowUpValue(amount: number | undefined): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(safe);
}

export function proposalFollowUpFields(
  proposal: Pick<Proposal, "customerName" | "customerCompanyName" | "finalQuoteValue" | "grandTotal" | "createdAt">,
  companyFallback?: string | null,
): ProposalFollowUpFields {
  const companyName = (
    proposal.customerCompanyName ||
    companyFallback ||
    proposal.customerName ||
    "your company"
  ).trim();
  const customerName = (proposal.customerName || companyName || "Customer").trim();
  return {
    customerName,
    companyName,
    proposalValue: formatProposalFollowUpValue(proposal.finalQuoteValue ?? proposal.grandTotal),
    creationDate: formatProposalFollowUpDate(proposal.createdAt),
  };
}

export function buildProposalFollowUpEmailSubject(companyName: string): string {
  return `Follow-up on your Buildesk proposal — ${companyName}`;
}

/** Plain-text email. The mail webhook sends `messageBody` as text, same as other proposal emails. */
export function buildProposalFollowUpEmailBody(fields: ProposalFollowUpFields): string {
  const { customerName, companyName, proposalValue, creationDate } = fields;
  return [
    `Dear ${customerName},`,
    ``,
    `Greetings from Buildesk!`,
    ``,
    `We are following up regarding the proposal shared with ${companyName}. Please find the proposal details below for your reference:`,
    ``,
    `- Company Name: ${companyName}`,
    `- Proposal Value: ₹${proposalValue}`,
    `- Proposal Creation Date: ${creationDate}`,
    ``,
    `We would appreciate an update on the proposal status. Please let us know if you require any additional information or assistance from our team to proceed further.`,
    ``,
    `If the deal has already been created in Buildesk, please disregard this follow-up message. We apologize for any inconvenience caused.`,
    ``,
    `Thank you for your time and consideration. We look forward to hearing from you.`,
    ``,
    `Best regards,`,
    `Team Buildesk`,
    `Customer Relationship Management System`,
  ].join("\n");
}

export function buildProposalFollowUpWhatsApp(fields: ProposalFollowUpFields): string {
  const { customerName, companyName, proposalValue, creationDate } = fields;
  return [
    `Hello ${customerName}! 👋`,
    ``,
    `Greetings from *Buildesk*.`,
    ``,
    `This is a gentle follow-up regarding the proposal for *${companyName}*.`,
    ``,
    `📋 *Proposal Details*`,
    `• *Company Name:* ${companyName}`,
    `• *Proposal Value:* ₹${proposalValue}`,
    `• *Creation Date:* ${creationDate}`,
    ``,
    `Kindly share an update on the proposal status. Please let us know if you need any assistance from our team.`,
    ``,
    `✅ *Already created?* If the deal has already been created in Buildesk, please ignore this message. We apologize for any inconvenience.`,
    ``,
    `Thank you for your time and cooperation!`,
    ``,
    `*Team Buildesk*`,
  ].join("\n");
}

function patchAutomationLog(logId: string, updates: Partial<AutomationLog>): void {
  let target: AutomationLog | undefined;
  useAppStore.setState((s) => ({
    automationLogs: s.automationLogs.map((l) => {
      if (l.id !== logId) return l;
      target = { ...l, ...updates };
      return target;
    }),
  }));
  if (target) {
    void fetch(apiUrl(`/api/automation/logs/${logId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    }).catch(() => undefined);
  }
}

async function sendFollowUpEmail(opts: {
  email: string;
  subject: string;
  body: string;
  recipientName: string;
  proposal: Proposal;
}): Promise<ChannelSendResult> {
  const email = opts.email.trim();
  if (!email || !email.includes("@")) {
    return { ok: false, skipped: true, error: "Missing or invalid email address" };
  }

  const { automationSettings, appendAutomationLog } = useAppStore.getState();
  const logId = crypto.randomUUID();
  const logEntry: AutomationLog = {
    id: logId,
    templateId: "proposal-follow-up-manual-email",
    templateName: "Proposal Follow-up (Email)",
    trigger: "proposal_follow_up",
    channel: "email",
    recipient: email,
    recipientName: opts.recipientName,
    entityType: "proposal",
    entityId: opts.proposal.id,
    entityName: opts.proposal.proposalNumber || opts.proposal.title,
    status: "pending",
    sentAt: new Date().toISOString(),
  };
  appendAutomationLog(logEntry);

  try {
    if (!import.meta.env.DEV && !automationSettings.n8nWebhookBase?.trim()) {
      const https = typeof window !== "undefined" && window.location.protocol === "https:";
      if (!https) {
        const error = "n8n webhook base is not set — open Automation → Settings and save your n8n URL.";
        patchAutomationLog(logId, { status: "failed", errorMessage: error });
        return { ok: false, error };
      }
    }

    const emailCc = resolveMergedEmailCc(automationSettings, { emailCc: "" }, {
      proposalId: opts.proposal.id,
      proposalNumber: opts.proposal.proposalNumber,
      customerName: opts.recipientName,
      customerEmail: email,
    });

    const payload = {
      channel: "email" as const,
      templateId: logEntry.templateId,
      templateName: logEntry.templateName,
      trigger: "proposal_follow_up",
      recipientPhone: "",
      recipientEmail: email,
      recipientName: opts.recipientName,
      messageBody: opts.body,
      emailSubject: opts.subject,
      emailCc,
      wahaApiUrl: automationSettings.wahaApiUrl,
      wahaApiKey: automationSettings.wahaApiKey,
      wahaSession: resolveWahaSession(null, automationSettings),
      delayHours: 0,
      entityType: "proposal",
      entityId: opts.proposal.id,
      entityName: opts.proposal.proposalNumber || opts.proposal.title,
      emailFromAddress: automationSettings.emailFromAddress,
      emailFromName: automationSettings.emailFromName,
    };

    const res = await fetchN8nWebhook(automationSettings, "buildesk-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 600);
      const errShort = errBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
      const error = `HTTP ${res.status}${errShort ? ` — ${errShort}` : ""}`;
      patchAutomationLog(logId, { status: "failed", errorMessage: error });
      return { ok: false, error };
    }

    patchAutomationLog(logId, { status: "sent", errorMessage: undefined });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    patchAutomationLog(logId, { status: "failed", errorMessage: error });
    return { ok: false, error };
  }
}

async function sendFollowUpWhatsApp(opts: {
  phone: string;
  message: string;
  recipientName: string;
  proposal: Proposal;
}): Promise<ChannelSendResult> {
  const phone = normalizeWhatsAppPhone(opts.phone);
  if (!phone) {
    return { ok: false, skipped: true, error: "Missing or invalid WhatsApp number" };
  }

  const { automationSettings, appendAutomationLog } = useAppStore.getState();
  const logId = crypto.randomUUID();
  const logEntry: AutomationLog = {
    id: logId,
    templateId: "proposal-follow-up-manual-whatsapp",
    templateName: "Proposal Follow-up (WhatsApp)",
    trigger: "proposal_follow_up",
    channel: "whatsapp",
    recipient: phone,
    recipientName: opts.recipientName,
    entityType: "proposal",
    entityId: opts.proposal.id,
    entityName: opts.proposal.proposalNumber || opts.proposal.title,
    status: "pending",
    sentAt: new Date().toISOString(),
  };
  appendAutomationLog(logEntry);

  try {
    const useHttpsProxy =
      typeof window !== "undefined" && window.location.protocol === "https:" && !import.meta.env.DEV;
    if (!useHttpsProxy && !import.meta.env.DEV && !automationSettings.wahaApiUrl?.trim()) {
      const error = "WAHA API URL is not set — open Automation → Settings and save your WAHA base URL.";
      patchAutomationLog(logId, { status: "failed", errorMessage: error });
      return { ok: false, error };
    }

    const res = await fetchWahaSendText(automationSettings, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": automationSettings.wahaApiKey,
      },
      body: JSON.stringify({
        session: resolveWahaSession(null, automationSettings),
        chatId: `${phone}@c.us`,
        text: opts.message,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 400);
      const errShort = errBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      const error = `${res.status} ${res.statusText}${errShort ? ` — ${errShort}` : ""}`;
      patchAutomationLog(logId, { status: "failed", errorMessage: error });
      return { ok: false, error };
    }

    patchAutomationLog(logId, { status: "sent", errorMessage: undefined });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    patchAutomationLog(logId, { status: "failed", errorMessage: error });
    return { ok: false, error };
  }
}

export async function sendProposalFollowUp(proposal: Proposal): Promise<{
  email: ChannelSendResult;
  whatsapp: ChannelSendResult;
  fields: ProposalFollowUpFields;
}> {
  const storeCustomer = useAppStore.getState().customers.find((c) => c.id === proposal.customerId) ?? null;
  const reach = await resolveCustomerNotifyReachability(proposal.customerId, storeCustomer);
  const fields = proposalFollowUpFields(proposal, storeCustomer?.companyName);
  if (reach.name && !proposal.customerName?.trim()) {
    fields.customerName = reach.name;
  }

  const subject = buildProposalFollowUpEmailSubject(fields.companyName);
  const emailBody = buildProposalFollowUpEmailBody(fields);
  const whatsapp = buildProposalFollowUpWhatsApp(fields);

  const [email, wa] = await Promise.all([
    sendFollowUpEmail({
      email: reach.email ?? "",
      subject,
      body: emailBody,
      recipientName: fields.customerName,
      proposal,
    }),
    sendFollowUpWhatsApp({
      phone: reach.phone ?? "",
      message: whatsapp,
      recipientName: fields.customerName,
      proposal,
    }),
  ]);

  return { email, whatsapp: wa, fields };
}
