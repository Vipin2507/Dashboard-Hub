export type PlanSlug =
  | "annual"
  | "half_yearly"
  | "quarterly"
  | "monthly"
  | "custom";

export type DistributionMode = "even" | "custom_percent" | "advance_then_equal";

export interface InstallmentPreview {
  number: number;
  label: string;
  dueDate: string; // YYYY-MM-DD (local calendar date)
  displayDate: string; // "15 May 2026"
  amount: number;
  percentage: number;
}

export interface PaymentPlanInput {
  slug: PlanSlug;
  planName: string;
  totalAmount: number;
  startDate: string; // ISO date — first installment date (YYYY-MM-DD recommended)
  installmentCount: number; // for custom mode
  distributionMode: DistributionMode;
  advancePercent?: number; // for advance_then_equal
  customPercentages?: number[]; // for custom_percent, must sum to 100
  intervalMonths?: number; // for custom mode
}

// ── Label generators per plan type ────────────────────────────────────────
const LABELS: Record<PlanSlug, (i: number, total: number) => string> = {
  annual: () => "Annual Payment",
  half_yearly: (i) => (i === 1 ? "First Half Payment" : "Second Half Payment"),
  quarterly: (i) => `Q${i} Payment`,
  monthly: (i) => `Month ${i} Payment`,
  custom: (i, t) => `Installment ${i} of ${t}`,
};

// ── Add months to a date (calendar months, local) ───────────────────────────
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Handle month overflow (e.g. Jan 31 + 1 month)
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

/** Local calendar date as YYYY-MM-DD — avoids UTC shifts from `toISOString()`. */
function formatIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Format date for display ────────────────────────────────────────────────
function formatDisplay(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }); // "15 May 2026"
}

function parseStartDate(startDate: string): Date {
  // Treat YYYY-MM-DD as local midnight so adding months stays on intended calendar days.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate).trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(y, mo, d);
  }
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid startDate");
  }
  return d;
}

function pctFromAmount(amount: number, totalAmount: number): number {
  if (!totalAmount || totalAmount <= 0) return 0;
  return Math.round((amount / totalAmount) * 10000) / 100;
}

// ── Main calculator ────────────────────────────────────────────────────────
export function calculateInstallments(input: PaymentPlanInput): InstallmentPreview[] {
  const {
    slug,
    totalAmount,
    startDate,
    installmentCount,
    distributionMode,
    advancePercent = 30,
    customPercentages = [],
    intervalMonths,
  } = input;

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return [];
  }

  // Determine interval from slug
  const INTERVALS: Record<PlanSlug, number> = {
    annual: 12,
    half_yearly: 6,
    quarterly: 3,
    monthly: 1,
    custom: intervalMonths ?? 1,
  };
  const interval = INTERVALS[slug];

  // Determine count from slug
  const COUNTS: Record<PlanSlug, number> = {
    annual: 1,
    half_yearly: 2,
    quarterly: 4,
    monthly: 12,
    custom: installmentCount,
  };
  const count = COUNTS[slug];

  if (!Number.isInteger(count) || count <= 0) {
    return [];
  }

  const labelFn = LABELS[slug];
  const baseDate = parseStartDate(startDate);
  const installments: InstallmentPreview[] = [];

  // ── Calculate amounts per distribution mode ──────────────────────────────

  if (distributionMode === "even") {
    const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
    const remainder = Math.round((totalAmount - baseAmount * count) * 100) / 100;

    for (let i = 0; i < count; i++) {
      const dueDate = addMonths(baseDate, i * interval);
      const isLast = i === count - 1;
      const amount = isLast ? baseAmount + remainder : baseAmount;
      installments.push({
        number: i + 1,
        label: labelFn(i + 1, count),
        dueDate: formatIsoDateLocal(dueDate),
        displayDate: formatDisplay(dueDate),
        amount: Math.round(amount * 100) / 100,
        percentage: pctFromAmount(amount, totalAmount),
      });
    }
  } else if (distributionMode === "advance_then_equal") {
    const advanceAmount =
      Math.round(((totalAmount * advancePercent) / 100) * 100) / 100;
    const remaining = totalAmount - advanceAmount;
    const restCount = count - 1;
    const baseRest =
      restCount > 0 ? Math.floor((remaining / restCount) * 100) / 100 : 0;
    const restRemainder =
      restCount > 0
        ? Math.round((remaining - baseRest * restCount) * 100) / 100
        : 0;

    for (let i = 0; i < count; i++) {
      const dueDate = addMonths(baseDate, i * interval);
      let amount: number;
      let label: string;

      if (i === 0) {
        amount = advanceAmount;
        label = `Advance (${advancePercent}%)`;
      } else {
        const isLast = i === count - 1;
        amount = isLast ? baseRest + restRemainder : baseRest;
        label = `Installment ${i} of ${restCount}`;
      }

      installments.push({
        number: i + 1,
        label,
        dueDate: formatIsoDateLocal(dueDate),
        displayDate: formatDisplay(dueDate),
        amount: Math.round(amount * 100) / 100,
        percentage: pctFromAmount(amount, totalAmount),
      });
    }
  } else if (distributionMode === "custom_percent") {
    let pcts: number[];
    if (customPercentages.length === count) {
      const sumPct = customPercentages.reduce((s, p) => s + (Number(p) || 0), 0);
      if (Math.abs(sumPct - 100) > 0.02) {
        throw new Error(`customPercentages must sum to 100 (got ${sumPct})`);
      }
      pcts = customPercentages.map((p) => Number(p) || 0);
    } else {
      const even = 100 / count;
      pcts = Array.from({ length: count }, () => even);
    }

    let allocated = 0;
    for (let i = 0; i < count; i++) {
      const dueDate = addMonths(baseDate, i * interval);
      const isLast = i === count - 1;
      const raw = Math.round(((totalAmount * pcts[i]) / 100) * 100) / 100;
      const amount = isLast ? Math.round((totalAmount - allocated) * 100) / 100 : raw;
      if (!isLast) allocated += amount;

      installments.push({
        number: i + 1,
        label: labelFn(i + 1, count),
        dueDate: formatIsoDateLocal(dueDate),
        displayDate: formatDisplay(dueDate),
        amount,
        percentage: pctFromAmount(amount, totalAmount),
      });
    }
  }

  return installments;
}
