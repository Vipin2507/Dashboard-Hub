/** First and last calendar day of the month containing `now` (local time). */
export function currentMonthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `yyyy-MM-dd` strings for current month (inclusive). */
export function currentMonthYmd(now = new Date()): { from: string; to: string } {
  const { start, end } = currentMonthBounds(now);
  return { from: toYmd(start), to: toYmd(end) };
}

/** Datepicker range value for the current month. */
export function currentMonthDateRange(now = new Date()): [Date, Date] {
  const { start, end } = currentMonthBounds(now);
  return [start, end];
}

/** Calendar year-to-date through today (local time). */
export function yearToDateYmd(now = new Date()): { from: string; to: string } {
  const start = new Date(now.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setHours(23, 59, 59, 999);
  return { from: toYmd(start), to: toYmd(end) };
}
