/** Pure metric helpers shared by the executive performance UI and unit tests. */

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string | null | undefined): boolean {
  if (!value || !YMD_RE.test(value)) return false;
  const d = ymdToLocalDate(value);
  if (!d) return false;
  return dateToYmd(d) === value;
}

export function ymdToLocalDate(ymd: string): Date | null {
  if (!YMD_RE.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function dateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Extract local calendar day from an ISO / SQLite datetime string. */
export function timestampToYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (YMD_RE.test(trimmed.slice(0, 10)) && (trimmed.length === 10 || trimmed[10] === "T" || trimmed[10] === " ")) {
    const ymd = trimmed.slice(0, 10);
    return isValidYmd(ymd) ? ymd : null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateToYmd(parsed);
}

export function weekdayFromYmd(ymd: string): number | null {
  const d = ymdToLocalDate(ymd);
  if (!d) return null;
  return d.getDay();
}

export function inInclusiveYmdRange(
  ymd: string | null | undefined,
  from: string,
  to: string,
): boolean {
  if (!ymd) return false;
  return ymd >= from && ymd <= to;
}

export function matchesWeekdayFilter(
  ymd: string | null | undefined,
  weekday: number | null | undefined,
): boolean {
  if (weekday == null || Number.isNaN(weekday)) return true;
  if (weekday < 0 || weekday > 6) return true;
  const day = ymd ? weekdayFromYmd(ymd) : null;
  return day === weekday;
}

export function normalizeReasonLabel(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  if (!text) return "Unspecified";
  if (text.length > 80) return "Other";
  return text;
}

export function winRate(won: number, lost: number): number {
  const closed = won + lost;
  if (closed <= 0) return 0;
  return Math.round((won / closed) * 1000) / 10;
}

export function avgDealSize(totalValue: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((totalValue / count) * 100) / 100;
}

export function isClosedWon(status: string | null | undefined): boolean {
  return String(status ?? "").trim() === "Closed/Won";
}

export function isClosedLost(status: string | null | undefined): boolean {
  return String(status ?? "").trim() === "Closed/Lost";
}

export function isPipelineStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return s !== "Closed/Won" && s !== "Closed/Lost";
}

/** Build contiguous daily trend points between from/to (inclusive). */
export function buildEmptyTrend(from: string, to: string): Array<{
  date: string;
  proposalsCreated: number;
  dealsWon: number;
  wonValue: number;
  collectedRevenue: number;
}> {
  const start = ymdToLocalDate(from);
  const end = ymdToLocalDate(to);
  if (!start || !end || start > end) return [];
  const out: Array<{
    date: string;
    proposalsCreated: number;
    dealsWon: number;
    wonValue: number;
    collectedRevenue: number;
  }> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push({
      date: dateToYmd(cursor),
      proposalsCreated: 0,
      dealsWon: 0,
      wonValue: 0,
      collectedRevenue: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function emptyWeekdayPerformance(): Array<{
  weekday: number;
  label: string;
  dealsWon: number;
  dealsLost: number;
  wonValue: number;
  proposalsCreated: number;
}> {
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    dealsWon: 0,
    dealsLost: 0,
    wonValue: 0,
    proposalsCreated: 0,
  }));
}
