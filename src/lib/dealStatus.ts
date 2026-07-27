/** Deal status labels for deals (cards, filters, badges). */
export const DEAL_STATUSES = [
  "Hot",
  "Cold",
  "Active",
  "Pending",
  "Closed/Won",
  "Closed/Lost",
] as const;

export type DealPipelineStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_META: Record<
  DealPipelineStatus,
  { description: string; cardClass: string; badgeClass: string }
> = {
  Hot: {
    description: "High intent — prioritize outreach",
    cardClass:
      "border-red-300/80 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-950/60 dark:to-orange-950/45 dark:border-red-900/70",
    badgeClass: "bg-red-500/15 text-red-800 dark:text-red-300 border-red-300/50",
  },
  Cold: {
    description: "Low recent engagement",
    cardClass:
      "border-blue-300/80 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-950/60 dark:to-sky-950/45 dark:border-blue-900/70",
    badgeClass: "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-300/50",
  },
  Active: {
    description: "In motion — standard follow-up",
    cardClass:
      "border-emerald-300/80 bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-950/60 dark:to-green-950/45 dark:border-emerald-900/70",
    badgeClass: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300/50",
  },
  Pending: {
    description: "Waiting on customer or internal action",
    cardClass:
      "border-amber-300/80 bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-950/60 dark:to-yellow-950/45 dark:border-amber-900/70",
    badgeClass: "bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-300/50",
  },
  "Closed/Won": {
    description: "Won — handoff & billing",
    cardClass:
      "border-teal-300/80 bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-950/60 dark:to-cyan-950/45 dark:border-teal-900/70",
    badgeClass: "bg-teal-500/15 text-teal-900 dark:text-teal-300 border-teal-300/50",
  },
  "Closed/Lost": {
    description: "Lost — capture reason for learning",
    cardClass:
      "border-rose-300/80 bg-gradient-to-br from-rose-100 to-red-100 dark:from-rose-950/60 dark:to-red-950/45 dark:border-rose-900/70",
    badgeClass: "bg-rose-600/15 text-rose-900 dark:text-rose-300 border-rose-400/50",
  },
};

export const DEAL_SOURCES = ["Referral", "Direct", "Campaign", "Cold call", "Social media"] as const;
export type DealSource = (typeof DEAL_SOURCES)[number];

export const DEAL_PRIORITIES = ["High", "Medium", "Low"] as const;
export type DealPriority = (typeof DEAL_PRIORITIES)[number];

/** Map free-text / CRM aliases onto canonical pipeline statuses. */
export function normalizeDealStatus(s: string | null | undefined): DealPipelineStatus {
  const v = (s ?? "Active").trim();
  if ((DEAL_STATUSES as readonly string[]).includes(v)) return v as DealPipelineStatus;
  const lower = v.toLowerCase();
  if (
    lower === "won" ||
    lower === "closed won" ||
    lower === "closed/won" ||
    lower === "closed-won"
  ) {
    return "Closed/Won";
  }
  if (
    lower === "lost" ||
    lower === "closed lost" ||
    lower === "closed/lost" ||
    lower === "closed-lost"
  ) {
    return "Closed/Lost";
  }
  if (lower === "in progress" || lower === "in_progress") return "Active";
  return "Active";
}

/**
 * Effective pipeline status for filters/analytics.
 * CRM imports often keep dealStatus as Active while invoiceStatus is Paid.
 */
export function resolveDealPipelineStatus(
  dealStatus: string | null | undefined,
  invoiceStatus?: string | null,
): DealPipelineStatus {
  const raw = (dealStatus ?? "").trim();
  if ((DEAL_STATUSES as readonly string[]).includes(raw)) {
    const canonical = raw as DealPipelineStatus;
    // Explicit closed states always win.
    if (canonical === "Closed/Won" || canonical === "Closed/Lost") return canonical;
  } else if (raw) {
    const aliased = normalizeDealStatus(raw);
    if (aliased === "Closed/Won" || aliased === "Closed/Lost") return aliased;
  }

  const inv = String(invoiceStatus ?? "").trim().toLowerCase();
  if (inv === "paid" || inv === "closed won" || inv === "won") return "Closed/Won";
  if (inv === "lost" || inv === "closed lost") return "Closed/Lost";
  if (inv.includes("pending") || inv.includes("due") || inv.includes("partial") || inv === "overdue") {
    return raw && (DEAL_STATUSES as readonly string[]).includes(raw)
      ? (raw as DealPipelineStatus)
      : "Pending";
  }

  return normalizeDealStatus(dealStatus);
}

export function isDealWonStatus(
  dealStatus: string | null | undefined,
  invoiceStatus?: string | null,
): boolean {
  return resolveDealPipelineStatus(dealStatus, invoiceStatus) === "Closed/Won";
}
