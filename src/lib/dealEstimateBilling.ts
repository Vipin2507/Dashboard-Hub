import type { Customer, CustomerProductLine, InventoryItem, Proposal, ProposalLineItem } from "@/types";
import type { EstimateData, EstimateLineItem, GSTType } from "@/types/estimate";
import { determineGSTType, ESTIMATE_DEFAULTS, getStateCodeFromGSTIN, STATE_CODES } from "@/lib/estimateConfig";
import type { InstallmentPreview } from "@/lib/paymentPlanCalculator";

export type DealEstimateLineItem = {
  id: string;
  name: string;
  description: string;
  subDescription: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  taxRate: number;
};

export type DealEstimateBillingState = {
  companyName: string;
  customerFullName: string;
  billingAddress: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  email: string;
  phone: string;
  placeOfSupply: string;
  estimateNotes: string;
  items: DealEstimateLineItem[];
};

export function emptyDealEstimateBilling(): DealEstimateBillingState {
  return {
    companyName: "",
    customerFullName: "",
    billingAddress: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    gstin: "",
    email: "",
    phone: "",
    placeOfSupply: "",
    estimateNotes: ESTIMATE_DEFAULTS.notes,
    items: [],
  };
}

function mapProposalLine(
  li: ProposalLineItem,
  inventoryItems: InventoryItem[],
): DealEstimateLineItem {
  const inv = inventoryItems.find((x) => x.id === li.inventoryItemId);
  return {
    id: li.id,
    name: li.name,
    description: li.description ?? inv?.description ?? "",
    subDescription: li.sku ? `SKU: ${li.sku}` : "",
    hsnSac: inv?.hsnSacCode ?? li.sku ?? "998313",
    qty: Number(li.qty) || 1,
    unit: inv?.unitOfMeasure ?? li.qtyLabel?.trim() ?? "Licence",
    rate: Number(li.unitPrice) || 0,
    taxRate: li.taxRate ?? 18,
  };
}

function mapProductLine(
  pl: CustomerProductLine,
  inventoryItems: InventoryItem[],
): DealEstimateLineItem {
  const inv = inventoryItems.find((x) => x.id === pl.inventoryItemId);
  return {
    id: pl.id,
    name: pl.itemName,
    description: pl.usageDetails ?? inv?.description ?? "",
    subDescription: `${pl.sku}${pl.itemType ? ` · ${pl.itemType}` : ""}`,
    hsnSac: inv?.hsnSacCode ?? "998313",
    qty: pl.qty ?? 1,
    unit: inv?.unitOfMeasure ?? "Licence",
    rate: pl.unitPrice ?? inv?.sellingPrice ?? 0,
    taxRate: 18,
  };
}

export function buildDealEstimateBilling(
  customer: Customer | undefined,
  proposal: Proposal,
  inventoryItems: InventoryItem[],
): DealEstimateBillingState {
  const primary = customer?.contacts?.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
  const productLines = customer?.productLines ?? [];
  const items =
    productLines.length > 0
      ? productLines.map((pl) => mapProductLine(pl, inventoryItems))
      : (proposal.lineItems ?? []).map((li) => mapProposalLine(li, inventoryItems));

  const stateCode = getStateCodeFromGSTIN(customer?.gstin ?? "");
  const stateName = stateCode ? STATE_CODES[stateCode] : "";
  const placeOfSupply =
    customer?.address?.state?.trim() ||
    (stateName && stateCode ? `${stateName} (${stateCode})` : stateName || "");

  return {
    companyName: (customer?.companyName ?? proposal.customerCompanyName ?? "").trim(),
    customerFullName: (customer?.customerName ?? proposal.customerName ?? "").trim(),
    billingAddress: [customer?.address?.line1, customer?.address?.line2].filter(Boolean).join(", "),
    city: (customer?.address?.city ?? "").trim(),
    state: (customer?.address?.state ?? "").trim(),
    pincode: (customer?.address?.pincode ?? "").trim(),
    country: (customer?.address?.country ?? "India").trim() || "India",
    gstin: (customer?.gstin ?? "").trim(),
    email: (primary?.email ?? "").trim(),
    phone: (primary?.phone ?? "").trim(),
    placeOfSupply: placeOfSupply.trim(),
    estimateNotes: proposal.notes?.trim() || ESTIMATE_DEFAULTS.notes,
    items,
  };
}

export function billingSubTotal(items: DealEstimateLineItem[]): number {
  return items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
}

export function allocateAmountAcrossLineWeights(
  installmentAmount: number,
  weights: number[],
): number[] {
  if (!weights.length) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const n = weights.length;
    const base = Math.floor((installmentAmount / n) * 100) / 100;
    const remainder = Math.round((installmentAmount - base * n) * 100) / 100;
    return weights.map((_, i) => (i === n - 1 ? base + remainder : base));
  }
  let allocated = 0;
  return weights.map((w, i) => {
    const isLast = i === weights.length - 1;
    if (isLast) {
      return Math.round((installmentAmount - allocated) * 100) / 100;
    }
    const amt = Math.round(((installmentAmount * w) / sumW) * 100) / 100;
    allocated += amt;
    return amt;
  });
}

export function toBaseEstimateLineItems(items: DealEstimateLineItem[]): EstimateLineItem[] {
  return items.map((it) => ({
    id: it.id,
    description: [it.name, it.description].filter(Boolean).join("\n"),
    hsnSac: it.hsnSac.trim() || "998313",
    qty: Number(it.qty) || 1,
    unit: it.unit.trim() || "Licence",
    rate: Number(it.rate) || 0,
    amount: Math.round((Number(it.qty) || 0) * (Number(it.rate) || 0) * 100) / 100,
    taxRate: Number(it.taxRate) || 18,
  }));
}

export function buildInstallmentEstimateData(args: {
  billing: DealEstimateBillingState;
  baseItems: DealEstimateLineItem[];
  inst: InstallmentPreview;
  installmentIndex: number;
  installmentCount: number;
  estimateNumber: string;
  gstType: GSTType;
  customerStateCode: string;
  planLabel?: string;
}): EstimateData {
  const {
    billing,
    baseItems,
    inst,
    installmentIndex,
    installmentCount,
    estimateNumber,
    gstType,
    customerStateCode,
    planLabel,
  } = args;

  const baseLines = toBaseEstimateLineItems(baseItems);
  const weights = baseLines.map((l) => l.amount);
  const lineAmounts = allocateAmountAcrossLineWeights(inst.amount, weights);

  const customerName =
    billing.companyName.trim() || billing.customerFullName.trim() || "Customer";

  return {
    estimateNumber,
    estimateDate: inst.dueDate,
    customerName,
    customerAddress: billing.billingAddress.trim(),
    customerCity: billing.city.trim(),
    customerState: billing.state.trim(),
    customerPincode: billing.pincode.trim(),
    customerCountry: billing.country.trim() || "India",
    customerGstin: billing.gstin.trim() || undefined,
    customerStateCode: customerStateCode || getStateCodeFromGSTIN(billing.gstin) || "",
    gstType,
    lineItems: baseLines.map((li, idx) => {
      const qty = li.qty;
      const shareAmount = lineAmounts[idx] ?? 0;
      const rate = Math.round((shareAmount / qty) * 100) / 100;
      return {
        ...li,
        description: `${li.description}\n${inst.label} — ${inst.displayDate}`,
        rate,
        amount: Math.round(shareAmount * 100) / 100,
      };
    }),
    notes:
      billing.estimateNotes.trim() ||
      `${planLabel ?? "Plan"} — Installment ${installmentIndex + 1} of ${installmentCount}`,
    termsAndConditions: ESTIMATE_DEFAULTS.terms,
  };
}

export function resolveGstTypeForBilling(billing: DealEstimateBillingState): GSTType {
  return determineGSTType(getStateCodeFromGSTIN(billing.gstin));
}

export function validateDealEstimateBilling(billing: DealEstimateBillingState): string | null {
  if (!billing.companyName.trim() && !billing.customerFullName.trim()) {
    return "Company or customer name is required for the estimate.";
  }
  if (!billing.items.length) {
    return "Add at least one line item for the estimate.";
  }
  if (
    billing.items.some(
      (it) =>
        !it.name.trim() ||
        !Number.isFinite(it.qty) ||
        it.qty <= 0 ||
        !Number.isFinite(it.rate) ||
        it.rate < 0,
    )
  ) {
    return "Each line item needs a name, quantity, and rate.";
  }
  return null;
}
