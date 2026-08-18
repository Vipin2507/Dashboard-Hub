import type { ProposalStatus } from "@/types";

/**
 * Converting a proposal to a deal is a win. Older records used `deal_created`;
 * that is an alias of `won`.
 */
export function normalizeProposalStatus(status: string | null | undefined): ProposalStatus {
  const s = String(status ?? "").trim();
  if (s === "deal_created") return "won";
  return (s || "draft") as ProposalStatus;
}

export function isProposalWon(status: string | null | undefined): boolean {
  return normalizeProposalStatus(status) === "won";
}

/** Open pipeline: not won, rejected, or cold. */
export function isProposalOpenPipeline(status: string | null | undefined): boolean {
  const s = normalizeProposalStatus(status);
  return s !== "won" && s !== "rejected" && s !== "cold";
}

/** Best available timestamp for when a proposal was marked won. */
export function proposalWonAt(proposal: {
  status?: string | null;
  updatedAt?: string;
  createdAt?: string;
}): string | undefined {
  if (!isProposalWon(proposal.status)) return undefined;
  return proposal.updatedAt || proposal.createdAt;
}

export function proposalStatusLabel(status: string | null | undefined): string {
  const n = normalizeProposalStatus(status);
  return n.replace(/_/g, " ");
}

export function proposalStatusMatches(
  status: string | null | undefined,
  filter: ProposalStatus | "all",
): boolean {
  if (filter === "all") return true;
  if (filter === "won" || filter === "deal_created") return isProposalWon(status);
  return status === filter;
}
