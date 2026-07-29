import type { Proposal, ProposalLineItem } from "@/types";

export type DealFinanceAmounts = {
  amountWithoutTax: number;
  taxAmount: number;
  totalAmount: number;
};

type ProposalFinanceSource = Pick<
  Proposal,
  "subtotal" | "totalTax" | "grandTotal" | "finalQuoteValue" | "setupDeploymentCharges" | "lineItems"
>;

function recomputeFromLineItems(proposal: ProposalFinanceSource): { sub: number; tax: number; grand: number } {
  const items = Array.isArray(proposal.lineItems) ? proposal.lineItems : [];
  const sub =
    items.reduce((s, li: ProposalLineItem) => s + (Number(li.lineTotal) || 0), 0) +
    (Number(proposal.setupDeploymentCharges) || 0);
  const tax = items.reduce((s, li: ProposalLineItem) => s + (Number(li.taxAmount) || 0), 0);
  const grand = sub + tax;
  return { sub, tax, grand };
}

/**
 * Split a deal total into amount-without-tax + tax using proposal line totals.
 * When `dealValue` differs from the proposal grand total (e.g. negotiated quote),
 * the split is scaled so without-tax + tax = dealValue.
 */
export function dealAmountsFromProposal(
  proposal: ProposalFinanceSource,
  dealValue?: number,
): DealFinanceAmounts {
  const preferredTotal =
    dealValue != null && Number.isFinite(dealValue) && dealValue > 0
      ? Number(dealValue)
      : Number(proposal.finalQuoteValue ?? proposal.grandTotal) || 0;

  let sub = Number(proposal.subtotal) || 0;
  // Setup/deployment is taxable-free add-on stored separately from line subtotal.
  const setup = Number(proposal.setupDeploymentCharges) || 0;
  let tax = Number(proposal.totalTax) || 0;
  let grand = Number(proposal.grandTotal) || 0;

  if (sub <= 0 && tax <= 0) {
    const recomputed = recomputeFromLineItems(proposal);
    sub = recomputed.sub;
    tax = recomputed.tax;
    grand = recomputed.grand || grand;
  } else {
    // Proposal.subtotal is excl. GST and excl. setup; amount without tax should include setup.
    sub = sub + setup;
    if (grand <= 0) grand = sub + tax;
  }

  const base = grand > 0 ? grand : sub + tax;
  const total = preferredTotal > 0 ? preferredTotal : base;

  if (total <= 0) {
    return { amountWithoutTax: 0, taxAmount: 0, totalAmount: 0 };
  }

  if (base <= 0) {
    return { amountWithoutTax: total, taxAmount: 0, totalAmount: total };
  }

  if (Math.abs(total - base) > 0.02) {
    const scale = total / base;
    const amountWithoutTax = Math.round(sub * scale * 100) / 100;
    const taxAmount = Math.round((total - amountWithoutTax) * 100) / 100;
    return { amountWithoutTax, taxAmount, totalAmount: total };
  }

  // Keep tax exact; absorb any 1-paisa drift into amount without tax.
  const amountWithoutTax = Math.round((total - tax) * 100) / 100;
  return {
    amountWithoutTax: Math.max(0, amountWithoutTax),
    taxAmount: Math.round(tax * 100) / 100,
    totalAmount: total,
  };
}

/** Reverse-calculate tax split when total is GST-inclusive (e.g. old deals with only `value`). */
export function dealAmountsFromInclusiveTotal(
  totalInclusive: number,
  gstRatePct = 18,
): DealFinanceAmounts {
  const total = Number(totalInclusive) || 0;
  if (total <= 0) return { amountWithoutTax: 0, taxAmount: 0, totalAmount: 0 };
  const rate = Number(gstRatePct);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { amountWithoutTax: total, taxAmount: 0, totalAmount: total };
  }
  const amountWithoutTax = Math.round((total / (1 + rate / 100)) * 100) / 100;
  const taxAmount = Math.round((total - amountWithoutTax) * 100) / 100;
  return { amountWithoutTax, taxAmount, totalAmount: total };
}

/** True when deal has a total but no usable tax / amount-without-tax split stored. */
export function dealNeedsTaxSplitFix(deal: {
  value?: number | null;
  totalAmount?: number | null;
  taxAmount?: number | null;
  amountWithoutTax?: number | null;
}): boolean {
  const total = Number(deal.totalAmount ?? deal.value ?? 0);
  if (!Number.isFinite(total) || total <= 0) return false;
  const tax = Number(deal.taxAmount ?? 0);
  const without = Number(deal.amountWithoutTax ?? 0);
  if (tax > 0 && without > 0) return false;
  // Stored without-tax equals total (or both tax/without are 0) → missing split.
  return tax <= 0 && (without <= 0 || Math.abs(without - total) < 0.02);
}
