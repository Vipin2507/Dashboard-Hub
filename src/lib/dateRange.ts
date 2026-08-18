/** First and last calendar day of the month containing `now` (local time). */
export function currentMonthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar `yyyy-MM-dd` for an ISO timestamp. */
export function isoToLocalYmd(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return formatLocalYmd(d);
}

export function ymdInInclusiveRange(ymd: string, from: string, to: string): boolean {
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

/** `yyyy-MM-dd` strings for current month (inclusive). */
export function currentMonthYmd(now = new Date()): { from: string; to: string } {
  const { start, end } = currentMonthBounds(now);
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

/** Datepicker range value for the current month. */
export function currentMonthDateRange(now = new Date()): [Date, Date] {
  const { start, end } = currentMonthBounds(now);
  return [start, end];
}

export const TIME_RANGE_PRESETS = [
  "all",
  "this_week",
  "this_month",
  "this_year",
  "previous_year",
  "custom",
] as const;

export type TimeRangePreset = (typeof TIME_RANGE_PRESETS)[number];

export const TIME_RANGE_OPTIONS: { value: TimeRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "previous_year", label: "Previous year" },
  { value: "custom", label: "Custom range" },
];

export function isTimeRangePreset(value: string | null | undefined): value is TimeRangePreset {
  return TIME_RANGE_PRESETS.includes(value as TimeRangePreset);
}

export function timeRangeLabel(preset: TimeRangePreset): string {
  return TIME_RANGE_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}

/** Sunday–Saturday week containing `now` (local time). */
export function thisWeekBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function thisYearYmd(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function previousYearYmd(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear() - 1;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function ymdBoundsForTimeRange(
  preset: Exclude<TimeRangePreset, "all" | "custom">,
  now = new Date(),
): { from: string; to: string } {
  if (preset === "this_week") {
    const { start, end } = thisWeekBounds(now);
    return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
  }
  if (preset === "this_month") return currentMonthYmd(now);
  if (preset === "this_year") return thisYearYmd(now);
  return previousYearYmd(now);
}

export function resolveTimeRangeYmd(
  preset: TimeRangePreset,
  customFrom = "",
  customTo = "",
  now = new Date(),
): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  if (preset === "custom") return { from: customFrom, to: customTo };
  return ymdBoundsForTimeRange(preset, now);
}

export function inferTimeRangePreset(from: string, to: string, now = new Date()): TimeRangePreset {
  if (!from && !to) return "all";
  for (const preset of ["this_week", "this_month", "this_year", "previous_year"] as const) {
    const b = ymdBoundsForTimeRange(preset, now);
    if (b.from === from && b.to === to) return preset;
  }
  return "custom";
}

export function hydrateTimeRange(
  input: { timeRangeFilter?: string | null; dateFrom?: string; dateTo?: string },
  now = new Date(),
): { preset: TimeRangePreset; customFrom: string; customTo: string } {
  const raw = input.timeRangeFilter;
  if (raw && isTimeRangePreset(raw)) {
    if (raw === "custom") {
      return { preset: "custom", customFrom: input.dateFrom ?? "", customTo: input.dateTo ?? "" };
    }
    return { preset: raw, customFrom: "", customTo: "" };
  }
  const from = input.dateFrom ?? "";
  const to = input.dateTo ?? "";
  const inferred = inferTimeRangePreset(from, to, now);
  return {
    preset: inferred,
    customFrom: inferred === "custom" ? from : "",
    customTo: inferred === "custom" ? to : "",
  };
}

export function parseTimeRangeFromSearchParams(params: URLSearchParams): {
  preset: TimeRangePreset;
  customFrom: string;
  customTo: string;
} | null {
  const range = params.get("range");
  if (range === "custom") {
    return {
      preset: "custom",
      customFrom: params.get("from") ?? "",
      customTo: params.get("to") ?? "",
    };
  }
  if (range && isTimeRangePreset(range) && range !== "custom") {
    return { preset: range, customFrom: "", customTo: "" };
  }
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    const inferred = inferTimeRangePreset(from ?? "", to ?? "");
    return {
      preset: inferred,
      customFrom: inferred === "custom" ? (from ?? "") : "",
      customTo: inferred === "custom" ? (to ?? "") : "",
    };
  }
  return null;
}

export function timeRangeChip(preset: TimeRangePreset, from: string, to: string): string | null {
  if (preset === "all") return null;
  if (preset === "custom") {
    if (from && to) return `${from} – ${to}`;
    return from || to || "Custom range";
  }
  return timeRangeLabel(preset);
}
