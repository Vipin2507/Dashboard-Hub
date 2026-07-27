/** Sales pipeline stage labels used on deals kanban / filters. */
export const DEFAULT_SALES_STAGES = [
  "Prospecting",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Closing",
] as const;

export type SalesStage = (typeof DEFAULT_SALES_STAGES)[number];

/**
 * Normalize pipeline stage names for display/grouping.
 * - Legacy CRM "Qualified" stays Qualified
 * - Brief rename to "Won" is mapped back to Qualified so it is not confused
 *   with deal status Closed/Won (UI label "Won")
 */
export function normalizeDealStage(stage: string | null | undefined): string {
  const s = String(stage ?? "").trim();
  if (!s) return "Prospecting";
  if (s === "Won") return "Qualified";
  return s;
}

export function dealStageLabel(stage: string | null | undefined): string {
  return normalizeDealStage(stage);
}
