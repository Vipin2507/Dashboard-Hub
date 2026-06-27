import type { ProposalLineItem } from "@/types";

/** Bracket suffix shown after item name in proposal PDFs, e.g. " (Up to 50 Units)". */
export function formatProposalQtyBracket(item: ProposalLineItem): string {
  return ` ${previewProposalQtyBracket(item.qty, item.qtyPrefix, item.qtyLabel)}`;
}

export function previewProposalQtyBracket(
  qty: number,
  qtyPrefix?: string,
  qtyLabel?: string,
): string {
  const n = Number(qty) || 0;
  if (n <= 0) return "";
  const label = String(qtyLabel ?? "license").trim() || "license";
  const prefix = String(qtyPrefix ?? "").trim();
  const core = prefix ? `${prefix} ${n} ${label}` : `${n} ${label}`;
  return `(${core})`;
}
