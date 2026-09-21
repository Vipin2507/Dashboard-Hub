/** Minimum commercial total (₹) required to create or share a proposal. */
export const MIN_PROPOSAL_TOTAL_VALUE = 25_000;

export type ProposalValueSource = {
  finalQuoteValue?: number | null;
  grandTotal?: number | null;
  subtotal?: number | null;
  totalTax?: number | null;
  setupDeploymentCharges?: number | null;
};

/** Effective proposal total: final quote if set, otherwise grand total (incl. GST + setup). */
export function proposalTotalValue(source: ProposalValueSource): number {
  if (typeof source.finalQuoteValue === "number" && Number.isFinite(source.finalQuoteValue)) {
    return source.finalQuoteValue;
  }
  if (typeof source.grandTotal === "number" && Number.isFinite(source.grandTotal)) {
    return source.grandTotal;
  }
  return (
    (Number(source.subtotal) || 0) +
    (Number(source.totalTax) || 0) +
    (Number(source.setupDeploymentCharges) || 0)
  );
}

export function isProposalBelowMinimumTotal(source: ProposalValueSource): boolean {
  return proposalTotalValue(source) < MIN_PROPOSAL_TOTAL_VALUE;
}

export function proposalMinimumTotalMessage(source: ProposalValueSource): string {
  const total = proposalTotalValue(source);
  return `Proposal total must be at least ₹${MIN_PROPOSAL_TOTAL_VALUE.toLocaleString("en-IN")}. Current total: ₹${Math.round(total).toLocaleString("en-IN")}.`;
}

/** Statuses that count as generating/sharing a proposal commercially. */
export const PROPOSAL_OUTBOUND_STATUSES = new Set([
  "shared",
  "sent",
  "approval_pending",
  "approved",
]);

export function assertProposalMeetsMinimumForCreate(source: ProposalValueSource): void {
  if (isProposalBelowMinimumTotal(source)) {
    throw new Error(proposalMinimumTotalMessage(source));
  }
}

export function assertProposalMeetsMinimumForShare(source: ProposalValueSource): void {
  if (isProposalBelowMinimumTotal(source)) {
    throw new Error(proposalMinimumTotalMessage(source));
  }
}
