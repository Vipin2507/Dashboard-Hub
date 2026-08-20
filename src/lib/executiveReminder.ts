import { isoToLocalYmd, ymdInInclusiveRange } from "@/lib/dateRange";
import { dealAmountsFromProposal } from "@/lib/dealAmountsFromProposal";
import { formatINR } from "@/lib/rbac";
import { isProposalWon } from "@/lib/proposalStatus";
import {
  resolveAutomationTemplateText,
  resolveMergedEmailCc,
  resolveWahaSession,
  type AutomationContext,
} from "@/lib/automationService";
import { fetchWahaSendText, fetchN8nWebhook } from "@/lib/automationEndpoints";
import { apiUrl } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import type { AutomationLog, AutomationTemplate, Proposal, User } from "@/types";

/** Pipeline proposals that still need conversion to a deal. */
export function isUnconvertedProposal(p: Proposal): boolean {
  if (p.dealId) return false;
  if (isProposalWon(p.status)) return false;
  const s = String(p.status || "").trim();
  if (s === "rejected" || s === "cold" || s === "draft") return false;
  return true;
}

export function filterUnconvertedProposals(
  proposals: Proposal[],
  opts: { executiveId: string; from: string; to: string },
): Proposal[] {
  return proposals
    .filter((p) => p.assignedTo === opts.executiveId)
    .filter((p) => isUnconvertedProposal(p))
    .filter((p) => {
      if (!opts.from && !opts.to) return true;
      return ymdInInclusiveRange(isoToLocalYmd(p.createdAt), opts.from, opts.to);
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function proposalReminderValue(p: Proposal): number {
  return dealAmountsFromProposal(p).amountWithoutTax;
}

export function formatReminderPeriodLabel(from: string, to: string): string {
  if (!from && !to) return "all time";
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  return from ? `from ${fmt(from)}` : `until ${fmt(to)}`;
}

function formatProposalLine(p: Proposal, index: number): string {
  const title = (p.title || p.proposalNumber || p.id).trim();
  return `${index}. ${title}`;
}

const DEFAULT_EMAIL_SUBJECT =
  "Action needed: {{open_proposal_count}} open proposal(s) pending deal conversion ({{period_label}})";

const DEFAULT_EMAIL_BODY = `Hi {{executive_name}},

This is a gentle reminder to follow up on your open proposals that are not yet converted into deals.

Period: {{period_label}}
Open proposals: {{open_proposal_count}}
Total value (excl. GST): {{total_value}}

Please review and convert the following proposals (or update their status) at the earliest:

{{proposal_list}}

Next steps suggested:
1. Follow up with the customer on each open proposal
2. Convert approved / won outcomes into deals in Buildesk
3. Mark cold / rejected proposals with a clear reason

Thank you,
{{sender_name}}
{{company_name}}`;

const DEFAULT_WHATSAPP_BODY = `Hi {{executive_name}} 👋

Reminder from Buildesk: you have *{{open_proposal_count}}* open proposal(s) in *{{period_label}}* that are *not yet converted into deals*.

*Total value (excl. GST):* {{total_value}}

*Pending proposals:*
{{proposal_list}}

Please follow up and convert them into deals (or update status) soon.

— {{sender_name}}`;

export type ExecutiveReminderDraft = {
  executiveName: string;
  periodLabel: string;
  proposals: Proposal[];
  totalValue: number;
  emailSubject: string;
  emailBody: string;
  whatsappMessage: string;
};

function pickTemplate(
  templates: AutomationTemplate[] | undefined,
  channel: "email" | "whatsapp",
): AutomationTemplate | undefined {
  const list = (templates ?? []).filter(
    (t) => t.trigger === "executive_open_proposals_reminder" && t.channel === channel && t.isActive,
  );
  return list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
}

export function buildExecutiveReminderDraft(opts: {
  executive: Pick<User, "id" | "name" | "email" | "phone">;
  from: string;
  to: string;
  proposals: Proposal[];
  senderName?: string;
  templates?: AutomationTemplate[];
}): ExecutiveReminderDraft {
  const periodLabel = formatReminderPeriodLabel(opts.from, opts.to);
  const proposals = opts.proposals;
  const totalValue = proposals.reduce((s, p) => s + proposalReminderValue(p), 0);
  const list =
    proposals.length > 0
      ? proposals.map((p, i) => formatProposalLine(p, i + 1)).join("\n")
      : "None — no open proposals pending deal conversion for this period.";
  const count = proposals.length;
  const sender = (opts.senderName || "Buildesk Admin").trim();

  const ctx: AutomationContext = {
    salesRepId: opts.executive.id,
    salesRepName: opts.executive.name,
    salesRepEmail: opts.executive.email,
    salesRepPhone: opts.executive.phone ?? undefined,
    executiveName: opts.executive.name,
    periodLabel,
    openProposalCount: count,
    totalValue,
    proposalList: list,
    senderName: sender,
    companyName: "Buildesk Sales Hub",
  };

  const emailTpl = pickTemplate(opts.templates, "email");
  const waTpl = pickTemplate(opts.templates, "whatsapp");

  const emailSubject = resolveAutomationTemplateText(emailTpl?.subject || DEFAULT_EMAIL_SUBJECT, ctx);
  const emailBody = resolveAutomationTemplateText(emailTpl?.body || DEFAULT_EMAIL_BODY, ctx);
  const whatsappMessage = resolveAutomationTemplateText(waTpl?.body || DEFAULT_WHATSAPP_BODY, ctx);

  return {
    executiveName: opts.executive.name,
    periodLabel,
    proposals,
    totalValue,
    emailSubject,
    emailBody,
    whatsappMessage,
  };
}

/** Digits-only WhatsApp number; prepends 91 for 10-digit Indian mobiles. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const to = normalizeWhatsAppPhone(phone);
  const q = new URLSearchParams({ text: message });
  return to ? `https://wa.me/${to}?${q.toString()}` : `https://wa.me/?${q.toString()}`;
}

/** Send reminder text via WAHA (same path as Automation WhatsApp templates). */
export async function sendExecutiveReminderWhatsApp(opts: {
  phone: string;
  message: string;
  executiveName: string;
  executiveId?: string;
  templateId?: string;
  templateName?: string;
  wahaSession?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizeWhatsAppPhone(opts.phone);
  if (!phone) {
    return { ok: false, error: "Missing or invalid WhatsApp number" };
  }

  const { automationSettings, appendAutomationLog, setAutomationLogs, automationTemplates } =
    useAppStore.getState();
  const settings = automationSettings;
  const waTpl =
    automationTemplates.find((t) => t.id === opts.templateId) ||
    automationTemplates.find(
      (t) => t.trigger === "executive_open_proposals_reminder" && t.channel === "whatsapp" && t.isActive,
    ) ||
    null;
  const session = resolveWahaSession(
    { wahaSession: opts.wahaSession ?? waTpl?.wahaSession },
    settings,
  );
  const logId = crypto.randomUUID();
  const logEntry: AutomationLog = {
    id: logId,
    templateId: opts.templateId || "executive-reminder-manual",
    templateName: opts.templateName || "Executive Reminder — Open Proposals (WhatsApp)",
    trigger: "executive_open_proposals_reminder",
    channel: "whatsapp",
    recipient: phone,
    recipientName: opts.executiveName,
    entityType: "proposal",
    entityId: opts.executiveId || "",
    entityName: opts.executiveName,
    status: "pending",
    sentAt: new Date().toISOString(),
  };
  appendAutomationLog(logEntry);

  const patchLog = (updates: Partial<AutomationLog>) => {
    const current = useAppStore.getState().automationLogs;
    const updated = current.map((l) => (l.id === logId ? { ...l, ...updates } : l));
    setAutomationLogs(updated);
    const target = updated.find((l) => l.id === logId);
    if (target) {
      void fetch(apiUrl(`/api/automation/logs/${logId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      }).catch(() => undefined);
    }
  };

  try {
    const useHttpsProxy =
      typeof window !== "undefined" && window.location.protocol === "https:" && !import.meta.env.DEV;
    if (!useHttpsProxy && !import.meta.env.DEV && !settings.wahaApiUrl?.trim()) {
      const error = "WAHA API URL is not set — open Automation → Settings and save your WAHA base URL.";
      patchLog({ status: "failed", errorMessage: error });
      return { ok: false, error };
    }

    const res = await fetchWahaSendText(settings, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": settings.wahaApiKey,
      },
      body: JSON.stringify({
        session,
        chatId: `${phone}@c.us`,
        text: opts.message,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 400);
      const errShort = errBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      const error = `${res.status} ${res.statusText}${errShort ? ` — ${errShort}` : ""}`;
      patchLog({ status: "failed", errorMessage: error });
      return { ok: false, error };
    }

    patchLog({ status: "sent", errorMessage: undefined });
    return { ok: true };
  } catch (err) {
    const error = String(err);
    patchLog({ status: "failed", errorMessage: error });
    return { ok: false, error };
  }
}

/** Send reminder email via n8n `buildesk-email` (same path as Automation email templates). */
export async function sendExecutiveReminderEmail(opts: {
  email: string;
  subject: string;
  body: string;
  executiveName: string;
  executiveId?: string;
  templateId?: string;
  templateName?: string;
  emailCc?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const email = opts.email.trim();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Missing or invalid email address" };
  }

  const { automationSettings, appendAutomationLog, setAutomationLogs, automationTemplates } =
    useAppStore.getState();
  const settings = automationSettings;

  const emailTpl =
    automationTemplates.find(
      (t) =>
        t.id === opts.templateId ||
        (t.trigger === "executive_open_proposals_reminder" && t.channel === "email" && t.isActive),
    ) ?? null;

  const logId = crypto.randomUUID();
  const templateId = opts.templateId || emailTpl?.id || "executive-reminder-manual-email";
  const templateName =
    opts.templateName || emailTpl?.name || "Executive Reminder — Open Proposals (Email)";

  const logEntry: AutomationLog = {
    id: logId,
    templateId,
    templateName,
    trigger: "executive_open_proposals_reminder",
    channel: "email",
    recipient: email,
    recipientName: opts.executiveName,
    entityType: "proposal",
    entityId: opts.executiveId || "",
    entityName: opts.executiveName,
    status: "pending",
    sentAt: new Date().toISOString(),
  };
  appendAutomationLog(logEntry);

  const patchLog = (updates: Partial<AutomationLog>) => {
    const current = useAppStore.getState().automationLogs;
    const updated = current.map((l) => (l.id === logId ? { ...l, ...updates } : l));
    setAutomationLogs(updated);
    const target = updated.find((l) => l.id === logId);
    if (target) {
      void fetch(apiUrl(`/api/automation/logs/${logId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      }).catch(() => undefined);
    }
  };

  try {
    if (!import.meta.env.DEV && !settings.n8nWebhookBase?.trim()) {
      const https =
        typeof window !== "undefined" && window.location.protocol === "https:";
      if (!https) {
        const error = "n8n webhook base is not set — open Automation → Settings and save your n8n URL.";
        patchLog({ status: "failed", errorMessage: error });
        return { ok: false, error };
      }
    }

    const emailCc = resolveMergedEmailCc(
      settings,
      { emailCc: opts.emailCc ?? emailTpl?.emailCc ?? "" },
      {
        salesRepId: opts.executiveId,
        salesRepName: opts.executiveName,
        salesRepEmail: email,
        executiveName: opts.executiveName,
      },
    );

    const payload = {
      channel: "email" as const,
      templateId,
      templateName,
      trigger: "executive_open_proposals_reminder",
      recipientPhone: "",
      recipientEmail: email,
      recipientName: opts.executiveName,
      messageBody: opts.body,
      emailSubject: opts.subject,
      emailCc,
      wahaApiUrl: settings.wahaApiUrl,
      wahaApiKey: settings.wahaApiKey,
      wahaSession: resolveWahaSession(emailTpl, settings),
      delayHours: emailTpl?.delayHours ?? 0,
      entityType: "proposal",
      entityId: opts.executiveId || "",
      entityName: opts.executiveName,
      emailFromAddress: settings.emailFromAddress,
      emailFromName: settings.emailFromName,
    };

    const res = await fetchN8nWebhook(settings, "buildesk-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 600);
      const errShort = errBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
      const error = `HTTP ${res.status}${errShort ? ` — ${errShort}` : ""}`;
      patchLog({ status: "failed", errorMessage: error });
      return { ok: false, error };
    }

    patchLog({ status: "sent", errorMessage: undefined });
    return { ok: true };
  } catch (err) {
    const error = String(err);
    patchLog({ status: "failed", errorMessage: error });
    return { ok: false, error };
  }
}
