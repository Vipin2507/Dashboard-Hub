/** Minimum (and default) setup & configuration charge applied to proposals (₹, excl. GST). */
export const MANDATORY_SETUP_CONFIGURATION_COST = 10_000;

export const MANDATORY_SETUP_CONFIGURATION_LABEL = "Setup & Configuration Cost";

/** GST rate applied to setup & configuration (same default as inventory / line items). */
export const SETUP_CONFIGURATION_GST_RATE = 18;

/** Default PDF "Service" column value for setup & configuration. */
export const DEFAULT_SETUP_SERVICE_LABEL = "One Time";

export function setupServiceLabelForPdf(label?: string | null): string {
  const trimmed = String(label ?? "").trim();
  return trimmed || DEFAULT_SETUP_SERVICE_LABEL;
}

/** Editable setup charge — never below the mandatory minimum. */
export function normalizeSetupConfigurationCost(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < MANDATORY_SETUP_CONFIGURATION_COST) {
    return MANDATORY_SETUP_CONFIGURATION_COST;
  }
  return n;
}

/** GST amount on setup & configuration (excl. GST base × rate). */
export function setupConfigurationGstAmount(
  setupExclGst: number,
  ratePct: number = SETUP_CONFIGURATION_GST_RATE,
): number {
  const setup = Math.max(0, Number(setupExclGst) || 0);
  const rate = Number(ratePct);
  if (setup <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(setup * (rate / 100) * 100) / 100;
}

export type ProposalMoneyTotals = {
  /**
   * Deal value excl. GST — line items + setup & configuration.
   * Setup is not shown as its own commercial row; it is folded into this subtotal.
   */
  subtotal: number;
  /** Line items only (excl. setup), excl. GST. */
  lineSubtotal: number;
  totalDiscount: number;
  /** GST on line items only. */
  lineTax: number;
  /** Setup excl. GST (stored separately for editing; included in `subtotal`). */
  setupCharges: number;
  /** GST on setup (included in `totalTax`). */
  setupTax: number;
  /** lineTax + setupTax. */
  totalTax: number;
  /** subtotal + totalTax. */
  grandTotal: number;
};

type LineMoneySource = {
  lineTotal?: number;
  taxAmount?: number;
  qty?: number;
  unitPrice?: number;
  discount?: number;
};

/** Compute proposal money totals — setup folded into subtotal, with 18% GST. */
export function computeProposalMoneyTotals(
  lineItems: LineMoneySource[] | null | undefined,
  setupExclGst: number,
): ProposalMoneyTotals {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const setupCharges = Math.max(0, Number(setupExclGst) || 0);
  const setupTax = setupConfigurationGstAmount(setupCharges);
  const lineSubtotal = items.reduce((s, li) => s + (Number(li.lineTotal) || 0), 0);
  const totalDiscount = items.reduce(
    (s, li) =>
      s + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0) * ((Number(li.discount) || 0) / 100),
    0,
  );
  const lineTax = items.reduce((s, li) => s + (Number(li.taxAmount) || 0), 0);
  const subtotal = Math.round((lineSubtotal + setupCharges) * 100) / 100;
  const totalTax = Math.round((lineTax + setupTax) * 100) / 100;
  const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;
  return { subtotal, lineSubtotal, totalDiscount, lineTax, setupCharges, setupTax, totalTax, grandTotal };
}
