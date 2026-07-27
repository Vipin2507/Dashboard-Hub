/**
 * Business "Deal Date" shown in the deals list.
 * Prefer invoice/estimate date over system createdAt.
 */
export function getDealDate(
  deal: {
    invoiceDate?: string | null;
    estimateDate?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null | undefined,
): string | null {
  if (!deal) return null;
  const raw =
    deal.invoiceDate ||
    deal.estimateDate ||
    deal.createdAt ||
    deal.updatedAt ||
    null;
  if (!raw) return null;
  const s = String(raw).trim();
  return s || null;
}

/** `yyyy-MM-dd` for filtering / analytics (local calendar day when ISO). */
export function getDealDateYmd(
  deal: {
    invoiceDate?: string | null;
    estimateDate?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null | undefined,
): string | null {
  const raw = getDealDate(deal);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
