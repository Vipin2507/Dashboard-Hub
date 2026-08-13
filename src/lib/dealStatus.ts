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
    cardClass: "border-destructive/30 bg-destructive/5",
    badgeClass: "border-destructive/30 bg-destructive/15 text-destructive",
  },
  Cold: {
    description: "Low recent engagement",
    cardClass: "border-border bg-muted/40",
    badgeClass: "border-border bg-muted/40 text-muted-foreground",
  },
  Active: {
    description: "In motion — standard follow-up",
    cardClass: "border-primary/30 bg-primary/5",
    badgeClass: "border-primary/30 bg-primary/15 text-primary",
  },
  Pending: {
    description: "Waiting on customer or internal action",
    cardClass: "border-warning/30 bg-warning/10",
    badgeClass: "border-warning/30 bg-warning/15 text-warning-foreground",
  },
  "Closed/Won": {
    description: "Won — handoff & billing",
    cardClass: "border-success/30 bg-success/5",
    badgeClass: "border-success/30 bg-success/15 text-success",
  },
  "Closed/Lost": {
    description: "Lost — capture reason for learning",
    cardClass: "border-border bg-muted/30",
    badgeClass: "border-border bg-muted/40 text-muted-foreground",
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
