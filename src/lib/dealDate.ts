/**
 * Business "Deal Date" shown in the deals list and used for date filters.
 * Prefer invoice / estimate / expected close — not system createdAt.
 */
export function getDealDate(
  deal: {
    invoiceDate?: string | null;
    estimateDate?: string | null;
    expectedCloseDate?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null | undefined,
): string | null {
  if (!deal) return null;
  for (const c of [deal.invoiceDate, deal.estimateDate, deal.expectedCloseDate]) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  // Display-only fallback when no business date exists.
  const fallback = String(deal.createdAt ?? deal.updatedAt ?? "").trim();
  return fallback || null;
}

/**
 * Deal Date used for analytics / filters.
 * Does not fall back to createdAt (avoids import-timestamp skew).
 */
export function getDealDateForFilter(
  deal: {
    invoiceDate?: string | null;
    estimateDate?: string | null;
    expectedCloseDate?: string | null;
  } | null | undefined,
): string | null {
  if (!deal) return null;
  for (const c of [deal.invoiceDate, deal.estimateDate, deal.expectedCloseDate]) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return null;
}

/** `yyyy-MM-dd` for filtering / analytics (local calendar day when ISO). */
export function getDealDateYmd(
  deal: {
    invoiceDate?: string | null;
    estimateDate?: string | null;
    expectedCloseDate?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null | undefined,
  opts?: { allowCreatedFallback?: boolean },
): string | null {
  const raw = opts?.allowCreatedFallback === false ? getDealDateForFilter(deal) : getDealDate(deal);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
