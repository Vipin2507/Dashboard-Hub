import { isoToLocalYmd, ymdInInclusiveRange } from "@/lib/dateRange";
import { isProposalOpenPipeline, isProposalWon } from "@/lib/proposalStatus";

export type ProposalKpiRow = {
  status: string;
  createdAt: string;
  updatedAt?: string;
  valueExclGst: number;
};

export type ProposalKpiData = {
  total: number;
  pending: number;
  won: number;
  totalValue: number;
};

function inCreatedRange(row: ProposalKpiRow, from: string, to: string): boolean {
  return ymdInInclusiveRange(isoToLocalYmd(row.createdAt), from, to);
}

/**
 * KPI strip for the proposals page.
 * `rows` should already be scoped (role, search, owner, team, region) but not status-filtered.
 * Date range applies to all cards via created date.
 */
export function computeProposalKpis(
  rows: ProposalKpiRow[],
  dateFrom: string,
  dateTo: string,
): ProposalKpiData {
  const inView = rows.filter((p) => inCreatedRange(p, dateFrom, dateTo));
  const pending = inView.filter((p) => p.status === "approval_pending").length;
  const won = inView.filter((p) => isProposalWon(p.status)).length;
  const totalValue = inView
    .filter((p) => isProposalOpenPipeline(p.status))
    .reduce((s, p) => s + (Number(p.valueExclGst) || 0), 0);

  return {
    total: inView.length,
    pending,
    won,
    totalValue,
  };
}
