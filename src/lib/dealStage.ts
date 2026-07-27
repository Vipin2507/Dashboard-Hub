/** Sales pipeline stage labels used on deals kanban / filters. */
export const DEFAULT_SALES_STAGES = [
  "Prospecting",
  "Won",
  "Proposal",
  "Negotiation",
  "Closing",
] as const;

export type SalesStage = (typeof DEFAULT_SALES_STAGES)[number];

/**
 * Normalize legacy stage names for display/grouping.
 * Historical data may still store "Qualified" — treat it as "Won".
 */
export function normalizeDealStage(stage: string | null | undefined): string {
  const s = String(stage ?? "").trim();
  if (!s) return "Prospecting";
  if (s === "Qualified") return "Won";
  return s;
}

export function dealStageLabel(stage: string | null | undefined): string {
  return normalizeDealStage(stage);
}
