/** @typedef {{ proposalsSentTarget: number; proposalsWonTarget: number; revenueExclGstTarget: number }} SalesTargetValues */

const YM_RE = /^\d{4}-\d{2}$/;

function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysInMonth(year, month1Based) {
  return new Date(year, month1Based, 0).getDate();
}

function monthBounds(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = daysInMonth(y, m);
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${String(last).padStart(2, "0")}`,
    days: last,
  };
}

function overlapDays(rangeFrom, rangeTo, monthFrom, monthTo) {
  const start = rangeFrom > monthFrom ? rangeFrom : monthFrom;
  const end = rangeTo < monthTo ? rangeTo : monthTo;
  if (start > end) return 0;
  const d1 = ymdToDate(start);
  const d2 = ymdToDate(end);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
}

export function isValidYearMonth(value) {
  if (!value || !YM_RE.test(value)) return false;
  const [y, m] = value.split("-").map(Number);
  return m >= 1 && m <= 12 && y >= 2000 && y <= 2100;
}

export function enumerateYearMonths(fromYmd, toYmd) {
  const result = [];
  let [y, m] = fromYmd.split("-").map(Number);
  const [y2, m2] = toYmd.split("-").map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

export function formatTargetPeriodLabel(fromYmd, toYmd) {
  const months = enumerateYearMonths(fromYmd, toYmd);
  if (months.length === 1) {
    const [y, mo] = months[0].split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  const fmt = (ymd) => {
    const [y, mo, d] = ymd.split("-").map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  return `${fmt(fromYmd)} – ${fmt(toYmd)}`;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ from: string; to: string; executiveId: string | null; userById?: Record<string, { name?: string }> }} opts
 */
export function resolveTargetsForPeriod(db, { from, to, executiveId, userById = {} }) {
  if (!from || !to) {
    return {
      hasTargets: false,
      periodLabel: "",
      scopeLabel: executiveId ? userById[executiveId]?.name || "Executive" : "Organization",
      proposalsSentTarget: 0,
      proposalsWonTarget: 0,
      revenueExclGstTarget: 0,
    };
  }

  const getRow = db.prepare(
    "SELECT proposalsSentTarget, proposalsWonTarget, revenueExclGstTarget FROM executive_sales_targets WHERE yearMonth = ? AND userId = ?",
  );

  let sent = 0;
  let won = 0;
  let rev = 0;
  let hasTargets = false;

  for (const ym of enumerateYearMonths(from, to)) {
    const bounds = monthBounds(ym);
    const overlap = overlapDays(from, to, bounds.from, bounds.to);
    if (overlap <= 0) continue;
    const factor = overlap / bounds.days;

    /** @type {SalesTargetValues | undefined} */
    let row;
    if (executiveId) {
      row = getRow.get(ym, executiveId);
      if (!row) row = getRow.get(ym, "");
    } else {
      row = getRow.get(ym, "");
    }

    if (!row) continue;
    const s = Number(row.proposalsSentTarget) || 0;
    const w = Number(row.proposalsWonTarget) || 0;
    const r = Number(row.revenueExclGstTarget) || 0;
    if (s || w || r) hasTargets = true;
    sent += s * factor;
    won += w * factor;
    rev += r * factor;
  }

  return {
    hasTargets,
    periodLabel: formatTargetPeriodLabel(from, to),
    scopeLabel: executiveId ? userById[executiveId]?.name || "Executive" : "Organization",
    proposalsSentTarget: Math.round(sent),
    proposalsWonTarget: Math.round(won * 10) / 10,
    revenueExclGstTarget: Math.round(rev),
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ achieved: { proposalsSent: number; proposalsWon: number; revenueExclGst: number }; targets: SalesTargetValues; hasTargets: boolean; periodLabel: string; scopeLabel: string }} input
 */
export function buildTargetVsAchievement(input) {
  const { achieved, targets, hasTargets, periodLabel, scopeLabel } = input;

  const { metrics } = buildTargetVsAchievementMetrics({
    achieved: {
      proposalsSentTarget: achieved.proposalsSent,
      proposalsWonTarget: achieved.proposalsWon,
      revenueExclGstTarget: achieved.revenueExclGst,
    },
    targets,
    hasTargets,
  });

  return {
    hasTargets,
    periodLabel,
    scopeLabel,
    metrics,
  };
}

/**
 * @param {{ achieved: SalesTargetValues; targets: SalesTargetValues; hasTargets: boolean }} input
 */
export function buildTargetVsAchievementMetrics(input) {
  const { achieved, targets, hasTargets } = input;
  const pct = (achievedVal, targetVal) => {
    if (!hasTargets || !targetVal) return 0;
    return Math.round((achievedVal / targetVal) * 1000) / 10;
  };

  return {
    hasTargets,
    metrics: [
      {
        key: "proposalsSent",
        label: "Proposals shared",
        achieved: achieved.proposalsSentTarget,
        target: targets.proposalsSentTarget,
        pct: pct(achieved.proposalsSentTarget, targets.proposalsSentTarget),
        format: "count",
        hint: "Approved & sent/shared",
      },
      {
        key: "proposalsWon",
        label: "Won",
        achieved: achieved.proposalsWonTarget,
        target: targets.proposalsWonTarget,
        pct: pct(achieved.proposalsWonTarget, targets.proposalsWonTarget),
        format: "count",
      },
      {
        key: "revenueExclGst",
        label: "Revenue (excl. GST)",
        achieved: achieved.revenueExclGstTarget,
        target: targets.revenueExclGstTarget,
        pct: pct(achieved.revenueExclGstTarget, targets.revenueExclGstTarget),
        format: "inr",
      },
    ],
  };
}
