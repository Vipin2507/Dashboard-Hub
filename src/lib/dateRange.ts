/** First and last calendar day of the month containing `now` (local time). */
export function currentMonthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** `yyyy-MM-dd` strings for current month (inclusive). */
export function currentMonthYmd(now = new Date()): { from: string; to: string } {
  const { start, end } = currentMonthBounds(now);
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { from: ymd(start), to: ymd(end) };
}

/** Datepicker range value for the current month. */
export function currentMonthDateRange(now = new Date()): [Date, Date] {
  const { start, end } = currentMonthBounds(now);
  return [start, end];
}
