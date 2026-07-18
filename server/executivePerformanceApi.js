/**
 * Super Admin executive performance analytics (aggregated).
 * Auth model matches the rest of the app: client-supplied actorRole === "super_admin".
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getActor(req) {
  const b = req.body || {};
  const q = req.query || {};
  return {
    actorRole: b.actorRole ?? q.actorRole,
    userId: b.userId ?? q.userId ?? q.actorUserId ?? "unknown",
    userName: b.userName ?? q.userName ?? q.actorUserName ?? "Unknown",
  };
}

function requireSuperAdmin(req, res) {
  const { actorRole } = getActor(req);
  if (actorRole !== "super_admin") {
    res.status(403).json({ error: "Only Super Admin can access Executive Performance" });
    return false;
  }
  return true;
}

function isValidYmd(value) {
  if (!value || !YMD_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

function dateToYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timestampToYmd(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (
    YMD_RE.test(trimmed.slice(0, 10)) &&
    (trimmed.length === 10 || trimmed[10] === "T" || trimmed[10] === " ")
  ) {
    const ymd = trimmed.slice(0, 10);
    return isValidYmd(ymd) ? ymd : null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateToYmd(parsed);
}

function weekdayFromYmd(ymd) {
  if (!isValidYmd(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function inRange(ymd, from, to) {
  return Boolean(ymd) && ymd >= from && ymd <= to;
}

function matchesWeekday(ymd, weekday) {
  if (weekday == null || Number.isNaN(weekday)) return true;
  return weekdayFromYmd(ymd) === weekday;
}

function normalizeReason(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "Unspecified";
  if (text.length > 80) return "Other";
  return text;
}

function winRate(won, lost) {
  const closed = won + lost;
  if (closed <= 0) return 0;
  return Math.round((won / closed) * 1000) / 10;
}

function avgDealSize(totalValue, count) {
  if (count <= 0) return 0;
  return Math.round((totalValue / count) * 100) / 100;
}

function parseWeekday(raw) {
  if (raw == null || raw === "" || raw === "all") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

function emptyExecStats() {
  return {
    proposalsCreated: 0,
    proposalsSent: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    dealsCreated: 0,
    dealsWon: 0,
    dealsLost: 0,
    wonValue: 0,
    pipelineValue: 0,
    pipelineCount: 0,
    customersNew: 0,
    collectedRevenue: 0,
    collectedPaymentCount: 0,
  };
}

function buildEmptyTrend(from, to) {
  if (!isValidYmd(from) || !isValidYmd(to) || from > to) return [];
  const [ys, ms, ds] = from.split("-").map(Number);
  const [ye, me, de] = to.split("-").map(Number);
  const start = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  const out = [];
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

function emptyWeekdayPerformance() {
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    dealsWon: 0,
    dealsLost: 0,
    wonValue: 0,
    proposalsCreated: 0,
  }));
}

function parseAuditDetail(detailJson) {
  if (!detailJson) return null;
  try {
    return typeof detailJson === "string" ? JSON.parse(detailJson) : detailJson;
  } catch {
    return null;
  }
}

function resolveWonLostEvents(deals, audits) {
  /** @type {Map<string, { dealId: string, to: string, at: string, coverage: string, lossReason?: string }>} */
  const byDeal = new Map();

  for (const a of audits) {
    if (a.action !== "deal_status_changed") continue;
    const detail = parseAuditDetail(a.detailJson);
    const to = detail?.to ? String(detail.to) : "";
    if (to !== "Closed/Won" && to !== "Closed/Lost") continue;
    const at = timestampToYmd(a.at);
    if (!at) continue;
    const prev = byDeal.get(a.dealId);
    // Prefer the latest closed transition.
    if (!prev || a.at >= (prev._rawAt || "")) {
      byDeal.set(a.dealId, {
        dealId: a.dealId,
        to,
        at,
        coverage: "exact",
        lossReason: detail?.lossReason ? String(detail.lossReason) : undefined,
        _rawAt: a.at,
      });
    }
  }

  for (const d of deals) {
    const status = String(d.dealStatus || "");
    if (status !== "Closed/Won" && status !== "Closed/Lost") continue;
    if (byDeal.has(d.id)) continue;
    const at = timestampToYmd(d.updatedAt) || timestampToYmd(d.createdAt);
    if (!at) continue;
    byDeal.set(d.id, {
      dealId: d.id,
      to: status,
      at,
      coverage: "legacy_fallback",
      lossReason: d.lossReason || undefined,
    });
  }

  return byDeal;
}

function bumpReason(map, reason, value = 0) {
  const key = normalizeReason(reason);
  const prev = map.get(key) || { reason: key, count: 0, value: 0 };
  prev.count += 1;
  prev.value += Number(value) || 0;
  map.set(key, prev);
}

function sortReasons(map) {
  return [...map.values()].sort((a, b) => b.count - a.count || b.value - a.value);
}

/**
 * @param {import("express").Express} app
 * @param {import("better-sqlite3").Database} db
 */
export function registerExecutivePerformanceApi(app, db) {
  app.get("/api/analytics/executive-performance", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    try {
      const q = req.query || {};
      const from = String(q.from || "");
      const to = String(q.to || "");
      if (!isValidYmd(from) || !isValidYmd(to)) {
        return res.status(400).json({ error: "Valid from and to dates (yyyy-MM-dd) are required" });
      }
      if (from > to) {
        return res.status(400).json({ error: "`from` must be on or before `to`" });
      }

      const executiveId = q.executiveId && q.executiveId !== "all" ? String(q.executiveId) : null;
      const teamId = q.teamId && q.teamId !== "all" ? String(q.teamId) : null;
      const regionId = q.regionId && q.regionId !== "all" ? String(q.regionId) : null;
      const weekday = parseWeekday(q.weekday);
      const reasonType =
        q.reasonType === "loss" || q.reasonType === "rejection" ? q.reasonType : null;
      const reason = q.reason && q.reason !== "all" ? normalizeReason(String(q.reason)) : null;
      const detailType = q.detailType ? String(q.detailType) : null;
      const detailPage = Math.max(1, Number(q.detailPage) || 1);
      const detailPageSize = Math.min(100, Math.max(1, Number(q.detailPageSize) || 25));

      const users = db
        .prepare("SELECT id, name, role, teamId, regionId, status FROM users")
        .all();
      const teams = db.prepare("SELECT id, name, regionId FROM teams").all();
      const regions = db.prepare("SELECT id, name FROM regions").all();
      const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
      const regionName = Object.fromEntries(regions.map((r) => [r.id, r.name]));
      const userById = Object.fromEntries(users.map((u) => [u.id, u]));

      const nameToUserIds = new Map();
      for (const u of users) {
        const key = String(u.name || "")
          .trim()
          .toLowerCase();
        if (!key) continue;
        if (!nameToUserIds.has(key)) nameToUserIds.set(key, []);
        nameToUserIds.get(key).push(u.id);
      }

      const deals = db
        .prepare(
          "SELECT * FROM deals WHERE (deletedAt IS NULL OR deletedAt = '') ORDER BY createdAt DESC",
        )
        .all();
      const audits = db
        .prepare(
          "SELECT dealId, action, detailJson, at FROM deal_audit WHERE action = 'deal_status_changed'",
        )
        .all();
      const proposalRows = db
        .prepare(
          "SELECT id, proposalNumber, title, customerId, assignedTo, status, grandTotal, finalQuoteValue, createdAt, updatedAt, data FROM proposals ORDER BY createdAt DESC",
        )
        .all();

      const customers = db
        .prepare(
          "SELECT id, name, customerName, companyName, regionId, status, createdAt, salesExecutive FROM customers",
        )
        .all();

      let paidInstallments = [];
      try {
        const pi = db
          .prepare(
            `SELECT pi.id, pi.deal_id as dealId, pi.customer_id as customerId, pi.paid_date as paidDate,
                    pi.paid_amount as paidAmount, pi.label, pi.status, c.name as companyName, d.name as dealTitle,
                    d.ownerUserId as ownerUserId
             FROM payment_installments pi
             LEFT JOIN customers c ON c.id = pi.customer_id
             LEFT JOIN deals d ON d.id = pi.deal_id
             WHERE (pi.paid_amount IS NOT NULL AND pi.paid_amount > 0)
                OR pi.status = 'paid'`,
          )
          .all();
        const di = db
          .prepare(
            `SELECT di.id, di.deal_id as dealId, di.customer_id as customerId, di.paid_date as paidDate,
                    di.paid_amount as paidAmount, di.label, di.payment_status as status, c.name as companyName,
                    d.name as dealTitle, d.ownerUserId as ownerUserId
             FROM deal_installments di
             LEFT JOIN customers c ON c.id = di.customer_id
             LEFT JOIN deals d ON d.id = di.deal_id
             WHERE (di.paid_amount IS NOT NULL AND di.paid_amount > 0)
                OR di.payment_status = 'paid'`,
          )
          .all();
        paidInstallments = [...pi, ...di];
      } catch {
        paidInstallments = [];
      }

      const wonLostByDeal = resolveWonLostEvents(deals, audits);
      let usedLegacyWonLost = false;
      for (const ev of wonLostByDeal.values()) {
        if (ev.coverage === "legacy_fallback") {
          usedLegacyWonLost = true;
          break;
        }
      }

      const execIds = new Set();
      for (const u of users) {
        if (u.role === "sales_rep" && u.status !== "disabled") execIds.add(u.id);
      }
      for (const d of deals) {
        if (d.ownerUserId) execIds.add(d.ownerUserId);
      }
      for (const p of proposalRows) {
        if (p.assignedTo) execIds.add(p.assignedTo);
      }

      /** @type {Map<string, ReturnType<typeof emptyExecStats>>} */
      const byExec = new Map();
      for (const id of execIds) {
        const u = userById[id];
        if (!u) continue;
        if (executiveId && id !== executiveId) continue;
        if (teamId && u.teamId !== teamId) continue;
        if (regionId && u.regionId !== regionId) continue;
        byExec.set(id, emptyExecStats());
      }

      const passUser = (userId) => {
        if (!userId) return false;
        if (executiveId && userId !== executiveId) return false;
        const u = userById[userId];
        if (!u) return false;
        if (teamId && u.teamId !== teamId) return false;
        if (regionId && u.regionId !== regionId) return false;
        if (!byExec.has(userId)) byExec.set(userId, emptyExecStats());
        return true;
      };

      const trendMap = new Map(buildEmptyTrend(from, to).map((t) => [t.date, t]));
      // Cap dense daily charts for very long ranges: keep points but UI can sample.
      const weekdayPerf = emptyWeekdayPerformance();
      const lossReasons = new Map();
      const rejectionReasons = new Map();
      /** @type {Array<any>} */
      const detailPool = [];

      let approxCustomer = false;
      let unlinkedPayments = 0;

      // --- Proposals ---
      for (const row of proposalRows) {
        let data = null;
        try {
          data = JSON.parse(row.data);
        } catch {
          data = null;
        }
        const assignedTo = row.assignedTo || data?.assignedTo;
        if (!passUser(assignedTo)) continue;

        const createdYmd = timestampToYmd(row.createdAt);
        const sentYmd = timestampToYmd(data?.sentAt);
        const approvedYmd = timestampToYmd(data?.approvedAt) || (row.status === "approved" ? timestampToYmd(row.updatedAt) : null);
        const rejectedYmd =
          row.status === "rejected" || data?.status === "rejected"
            ? timestampToYmd(data?.rejectedAt) || timestampToYmd(row.updatedAt)
            : null;
        const value = Number(data?.finalQuoteValue ?? row.finalQuoteValue ?? row.grandTotal) || 0;
        const rejectionReason = data?.rejectionReason || "";

        const stats = byExec.get(assignedTo);

        if (inRange(createdYmd, from, to) && matchesWeekday(createdYmd, weekday)) {
          if (!reasonType || (reasonType === "rejection" && (!reason || normalizeReason(rejectionReason) === reason))) {
            stats.proposalsCreated += 1;
            const tp = trendMap.get(createdYmd);
            if (tp) tp.proposalsCreated += 1;
            const wd = weekdayFromYmd(createdYmd);
            if (wd != null) weekdayPerf[wd].proposalsCreated += 1;
            detailPool.push({
              id: row.id,
              type: "proposal",
              detailKinds: ["proposals_created"],
              title: row.title || row.proposalNumber || row.id,
              subtitle: row.proposalNumber || undefined,
              executiveId: assignedTo,
              executiveName: userById[assignedTo]?.name,
              amount: value,
              status: row.status,
              reason: rejectionReason || undefined,
              at: row.createdAt,
              href: `/proposals?q=${encodeURIComponent(row.proposalNumber || row.id)}`,
              coverage: "exact",
            });
          }
        }

        if (inRange(sentYmd, from, to) && matchesWeekday(sentYmd, weekday)) {
          stats.proposalsSent += 1;
          detailPool.push({
            id: `${row.id}:sent`,
            type: "proposal",
            detailKinds: ["proposals_sent"],
            title: row.title || row.proposalNumber || row.id,
            subtitle: "Sent",
            executiveId: assignedTo,
            executiveName: userById[assignedTo]?.name,
            amount: value,
            status: row.status,
            at: data?.sentAt || row.updatedAt,
            href: `/proposals?q=${encodeURIComponent(row.proposalNumber || row.id)}`,
            coverage: "exact",
          });
        }

        if (inRange(approvedYmd, from, to) && matchesWeekday(approvedYmd, weekday)) {
          stats.proposalsApproved += 1;
          detailPool.push({
            id: `${row.id}:approved`,
            type: "proposal",
            detailKinds: ["proposals_approved"],
            title: row.title || row.proposalNumber || row.id,
            subtitle: "Approved",
            executiveId: assignedTo,
            executiveName: userById[assignedTo]?.name,
            amount: value,
            status: row.status,
            at: data?.approvedAt || row.updatedAt,
            href: `/proposals?q=${encodeURIComponent(row.proposalNumber || row.id)}`,
            coverage: data?.approvedAt ? "exact" : "legacy_fallback",
          });
        }

        if (inRange(rejectedYmd, from, to) && matchesWeekday(rejectedYmd, weekday)) {
          const label = normalizeReason(rejectionReason);
          if (reasonType === "loss") {
            /* skip */
          } else if (reason && label !== reason) {
            /* skip */
          } else {
            stats.proposalsRejected += 1;
            bumpReason(rejectionReasons, rejectionReason, value);
            detailPool.push({
              id: `${row.id}:rejected`,
              type: "proposal",
              detailKinds: ["proposals_rejected", "rejection_reason"],
              title: row.title || row.proposalNumber || row.id,
              subtitle: label,
              executiveId: assignedTo,
              executiveName: userById[assignedTo]?.name,
              amount: value,
              status: "rejected",
              reason: rejectionReason || label,
              at: data?.rejectedAt || row.updatedAt,
              href: `/proposals?q=${encodeURIComponent(row.proposalNumber || row.id)}`,
              coverage: "legacy_fallback",
              reasonKey: label,
            });
          }
        }
      }

      // --- Deals created + pipeline (current snapshot, not date-filtered for pipeline value) ---
      for (const d of deals) {
        if (!passUser(d.ownerUserId)) continue;
        const stats = byExec.get(d.ownerUserId);
        const createdYmd = timestampToYmd(d.createdAt);
        const status = String(d.dealStatus || "");
        const value = Number(d.value) || 0;

        if (inRange(createdYmd, from, to) && matchesWeekday(createdYmd, weekday)) {
          if (!reasonType) {
            stats.dealsCreated += 1;
            detailPool.push({
              id: d.id,
              type: "deal",
              detailKinds: ["deals_created"],
              title: d.name || d.id,
              subtitle: status,
              executiveId: d.ownerUserId,
              executiveName: userById[d.ownerUserId]?.name,
              amount: value,
              status,
              reason: d.lossReason || undefined,
              at: d.createdAt,
              href: `/deals?q=${encodeURIComponent(d.id)}`,
              coverage: "exact",
            });
          }
        }

        if (status !== "Closed/Won" && status !== "Closed/Lost") {
          // Pipeline is current open book for selected executives (not period-bound).
          if (!reasonType && (!reason)) {
            stats.pipelineValue += value;
            stats.pipelineCount += 1;
            detailPool.push({
              id: `${d.id}:pipeline`,
              type: "deal",
              detailKinds: ["pipeline"],
              title: d.name || d.id,
              subtitle: status,
              executiveId: d.ownerUserId,
              executiveName: userById[d.ownerUserId]?.name,
              amount: value,
              status,
              at: d.updatedAt || d.createdAt,
              href: `/deals?q=${encodeURIComponent(d.id)}`,
              coverage: "exact",
            });
          }
        }
      }

      // --- Won / Lost events ---
      for (const d of deals) {
        if (!passUser(d.ownerUserId)) continue;
        const ev = wonLostByDeal.get(d.id);
        if (!ev) continue;
        if (!inRange(ev.at, from, to) || !matchesWeekday(ev.at, weekday)) continue;

        const stats = byExec.get(d.ownerUserId);
        const value = Number(d.value) || 0;
        const lossLabel = normalizeReason(ev.lossReason || d.lossReason);

        if (ev.to === "Closed/Won") {
          if (reasonType === "loss" || reasonType === "rejection") continue;
          stats.dealsWon += 1;
          stats.wonValue += value;
          const tp = trendMap.get(ev.at);
          if (tp) {
            tp.dealsWon += 1;
            tp.wonValue += value;
          }
          const wd = weekdayFromYmd(ev.at);
          if (wd != null) {
            weekdayPerf[wd].dealsWon += 1;
            weekdayPerf[wd].wonValue += value;
          }
          detailPool.push({
            id: `${d.id}:won`,
            type: "deal",
            detailKinds: ["deals_won"],
            title: d.name || d.id,
            subtitle: "Closed/Won",
            executiveId: d.ownerUserId,
            executiveName: userById[d.ownerUserId]?.name,
            amount: value,
            status: "Closed/Won",
            at: ev.at,
            href: `/deals?q=${encodeURIComponent(d.id)}`,
            coverage: ev.coverage,
          });
        } else if (ev.to === "Closed/Lost") {
          if (reasonType === "rejection") continue;
          if (reason && lossLabel !== reason) continue;
          if (reasonType === "loss" && reason && lossLabel !== reason) continue;
          stats.dealsLost += 1;
          bumpReason(lossReasons, ev.lossReason || d.lossReason, value);
          const wd = weekdayFromYmd(ev.at);
          if (wd != null) weekdayPerf[wd].dealsLost += 1;
          detailPool.push({
            id: `${d.id}:lost`,
            type: "deal",
            detailKinds: ["deals_lost", "loss_reason"],
            title: d.name || d.id,
            subtitle: lossLabel,
            executiveId: d.ownerUserId,
            executiveName: userById[d.ownerUserId]?.name,
            amount: value,
            status: "Closed/Lost",
            reason: d.lossReason || lossLabel,
            at: ev.at,
            href: `/deals?q=${encodeURIComponent(d.id)}`,
            coverage: ev.coverage,
            reasonKey: lossLabel,
          });
        }
      }

      // --- Customers (approximate name match) ---
      for (const c of customers) {
        const createdYmd = timestampToYmd(c.createdAt);
        if (!inRange(createdYmd, from, to) || !matchesWeekday(createdYmd, weekday)) continue;
        if (reasonType) continue;

        const nameKey = String(c.salesExecutive || "")
          .trim()
          .toLowerCase();
        let ownerId = null;
        if (nameKey && nameToUserIds.has(nameKey)) {
          const ids = nameToUserIds.get(nameKey);
          ownerId = ids.length === 1 ? ids[0] : ids[0];
          if (ids.length > 1) approxCustomer = true;
        } else if (nameKey) {
          approxCustomer = true;
        }

        if (ownerId) {
          if (!passUser(ownerId)) continue;
        } else {
          // Unassigned / unmatched — only include when no executive filter.
          if (executiveId || teamId) continue;
          if (regionId && c.regionId !== regionId) continue;
          // Skip counting into a specific exec; still available in details via synthetic bucket.
          detailPool.push({
            id: c.id,
            type: "customer",
            detailKinds: ["customers_new"],
            title: c.companyName || c.customerName || c.name || c.id,
            subtitle: c.salesExecutive || "Unassigned",
            amount: 0,
            status: c.status,
            at: c.createdAt,
            href: `/customers/${encodeURIComponent(c.id)}`,
            coverage: "approximate_customer_assignment",
          });
          continue;
        }

        const stats = byExec.get(ownerId);
        stats.customersNew += 1;
        approxCustomer = true;
        detailPool.push({
          id: c.id,
          type: "customer",
          detailKinds: ["customers_new"],
          title: c.companyName || c.customerName || c.name || c.id,
          subtitle: c.salesExecutive || userById[ownerId]?.name,
          executiveId: ownerId,
          executiveName: userById[ownerId]?.name,
          amount: 0,
          status: c.status,
          at: c.createdAt,
          href: `/customers/${encodeURIComponent(c.id)}`,
          coverage: "approximate_customer_assignment",
        });
      }

      // --- Payments via deal owner ---
      for (const pay of paidInstallments) {
        const paidYmd = timestampToYmd(pay.paidDate);
        if (!inRange(paidYmd, from, to) || !matchesWeekday(paidYmd, weekday)) continue;
        if (reasonType) continue;
        const amount = Number(pay.paidAmount) || 0;
        if (amount <= 0) continue;

        const ownerId = pay.ownerUserId || null;
        if (!ownerId) {
          unlinkedPayments += 1;
          if (!executiveId && !teamId) {
            detailPool.push({
              id: pay.id,
              type: "payment",
              detailKinds: ["payments_collected"],
              title: pay.dealTitle || pay.label || "Payment",
              subtitle: pay.companyName || "Unlinked deal owner",
              amount,
              status: pay.status,
              at: pay.paidDate,
              href: `/payments`,
              coverage: "partial",
            });
          }
          continue;
        }
        if (!passUser(ownerId)) continue;
        const stats = byExec.get(ownerId);
        stats.collectedRevenue += amount;
        stats.collectedPaymentCount += 1;
        const tp = trendMap.get(paidYmd);
        if (tp) tp.collectedRevenue += amount;
        detailPool.push({
          id: pay.id,
          type: "payment",
          detailKinds: ["payments_collected"],
          title: pay.dealTitle || pay.label || "Payment",
          subtitle: pay.companyName || undefined,
          executiveId: ownerId,
          executiveName: userById[ownerId]?.name,
          amount,
          status: pay.status,
          at: pay.paidDate,
          href: `/payments`,
          coverage: "exact",
        });
      }

      // Aggregate summary
      const summary = emptyExecStats();
      for (const stats of byExec.values()) {
        for (const key of Object.keys(summary)) {
          summary[key] += stats[key];
        }
      }
      // When no executives matched filters, still sum unassigned customer/payment details already excluded.

      const executives = [...byExec.entries()]
        .map(([userId, stats]) => {
          const u = userById[userId];
          return {
            userId,
            name: u?.name || userId,
            teamId: u?.teamId || "",
            teamName: teamName[u?.teamId] || "",
            regionId: u?.regionId || "",
            regionName: regionName[u?.regionId] || "",
            proposalsCreated: stats.proposalsCreated,
            proposalsApproved: stats.proposalsApproved,
            proposalsRejected: stats.proposalsRejected,
            dealsCreated: stats.dealsCreated,
            dealsWon: stats.dealsWon,
            dealsLost: stats.dealsLost,
            winRate: winRate(stats.dealsWon, stats.dealsLost),
            wonValue: stats.wonValue,
            avgWonDealSize: avgDealSize(stats.wonValue, stats.dealsWon),
            pipelineValue: stats.pipelineValue,
            customersNew: stats.customersNew,
            collectedRevenue: stats.collectedRevenue,
          };
        })
        .filter((row) => {
          // Hide pure-zero rows unless a specific executive was requested.
          if (executiveId) return true;
          return (
            row.proposalsCreated ||
            row.dealsCreated ||
            row.dealsWon ||
            row.dealsLost ||
            row.pipelineValue ||
            row.customersNew ||
            row.collectedRevenue
          );
        })
        .sort((a, b) => b.wonValue - a.wonValue || b.dealsWon - a.dealsWon || a.name.localeCompare(b.name));

      const funnel = [
        { key: "proposals_created", label: "Proposals created", count: summary.proposalsCreated, value: 0 },
        { key: "proposals_sent", label: "Proposals sent", count: summary.proposalsSent, value: 0 },
        { key: "proposals_approved", label: "Proposals approved", count: summary.proposalsApproved, value: 0 },
        { key: "deals_created", label: "Deals created", count: summary.dealsCreated, value: 0 },
        { key: "deals_won", label: "Deals won", count: summary.dealsWon, value: summary.wonValue },
      ];

      // Detail filtering
      let filteredDetails = detailPool;
      if (detailType) {
        filteredDetails = filteredDetails.filter((r) => (r.detailKinds || []).includes(detailType));
      }
      if (reasonType === "loss") {
        filteredDetails = filteredDetails.filter((r) => (r.detailKinds || []).includes("loss_reason"));
      } else if (reasonType === "rejection") {
        filteredDetails = filteredDetails.filter((r) => (r.detailKinds || []).includes("rejection_reason"));
      }
      if (reason) {
        filteredDetails = filteredDetails.filter((r) => r.reasonKey === reason || normalizeReason(r.reason) === reason);
      }
      filteredDetails = filteredDetails.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      const total = filteredDetails.length;
      const start = (detailPage - 1) * detailPageSize;
      const pageRows = filteredDetails.slice(start, start + detailPageSize).map((r) => {
        const { detailKinds, reasonKey, ...rest } = r;
        return rest;
      });

      const coverageNotes = [];
      if (usedLegacyWonLost) {
        coverageNotes.push(
          "Some won/lost dates use deal updatedAt because no deal_status_changed audit was found.",
        );
      }
      if (approxCustomer) {
        coverageNotes.push(
          "New customers are attributed by matching salesExecutive name to users (approximate).",
        );
      }
      if (unlinkedPayments > 0) {
        coverageNotes.push(
          `${unlinkedPayments} paid installment(s) could not be linked to a deal owner.`,
        );
      }
      coverageNotes.push("Won value is deal value at close; collected revenue is paid installments.");
      coverageNotes.push("Pipeline value is the current open book for the selected executives.");

      // Sparse long trends: if > 92 days, roll up by week in response? Keep daily — UI can handle.
      // For very long ranges (>180 days), sample weekly to keep payload light.
      let trend = [...trendMap.values()];
      if (trend.length > 180) {
        const weekly = new Map();
        for (const p of trend) {
          const d = new Date(p.date + "T12:00:00");
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const key = dateToYmd(weekStart);
          const agg = weekly.get(key) || {
            date: key,
            proposalsCreated: 0,
            dealsWon: 0,
            wonValue: 0,
            collectedRevenue: 0,
          };
          agg.proposalsCreated += p.proposalsCreated;
          agg.dealsWon += p.dealsWon;
          agg.wonValue += p.wonValue;
          agg.collectedRevenue += p.collectedRevenue;
          weekly.set(key, agg);
        }
        trend = [...weekly.values()];
      }

      // Day-by-day activity table (counts + expandable items). Exclude pipeline snapshot rows.
      const dailyMap = new Map();
      const ensureDay = (ymd) => {
        if (!dailyMap.has(ymd)) {
          const wd = weekdayFromYmd(ymd) ?? 0;
          dailyMap.set(ymd, {
            date: ymd,
            weekday: wd,
            weekdayLabel: WEEKDAY_LABELS[wd] || "",
            proposalsCreated: 0,
            dealsCreated: 0,
            dealsWon: 0,
            dealsLost: 0,
            customersNew: 0,
            paymentsCollected: 0,
            wonValue: 0,
            collectedRevenue: 0,
            items: [],
          });
        }
        return dailyMap.get(ymd);
      };

      for (const r of detailPool) {
        const kinds = r.detailKinds || [];
        if (kinds.includes("pipeline") && !kinds.includes("deals_created")) continue;
        if (reasonType === "loss" && !kinds.includes("loss_reason") && !kinds.includes("deals_lost")) continue;
        if (reasonType === "rejection" && !kinds.includes("rejection_reason") && !kinds.includes("proposals_rejected")) continue;
        if (reason && r.reasonKey !== reason && normalizeReason(r.reason) !== reason) continue;

        const ymd = timestampToYmd(r.at);
        if (!ymd || !inRange(ymd, from, to) || !matchesWeekday(ymd, weekday)) continue;

        const day = ensureDay(ymd);
        if (kinds.includes("proposals_created")) day.proposalsCreated += 1;
        if (kinds.includes("deals_created")) day.dealsCreated += 1;
        if (kinds.includes("deals_won")) {
          day.dealsWon += 1;
          day.wonValue += Number(r.amount) || 0;
        }
        if (kinds.includes("deals_lost")) day.dealsLost += 1;
        if (kinds.includes("customers_new")) day.customersNew += 1;
        if (kinds.includes("payments_collected")) {
          day.paymentsCollected += 1;
          day.collectedRevenue += Number(r.amount) || 0;
        }

        const { detailKinds, reasonKey, ...rest } = r;
        day.items.push(rest);
      }

      const dailyBreakdown = [...dailyMap.values()]
        .map((day) => ({
          ...day,
          items: day.items
            .slice()
            .sort((a, b) => String(b.at).localeCompare(String(a.at)))
            .slice(0, 150),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      res.json({
        filters: {
          from,
          to,
          executiveId,
          teamId,
          regionId,
          weekday,
          reasonType,
          reason,
        },
        summary: {
          ...summary,
          winRate: winRate(summary.dealsWon, summary.dealsLost),
          avgWonDealSize: avgDealSize(summary.wonValue, summary.dealsWon),
        },
        trend,
        executives,
        funnel,
        weekdayPerformance: weekdayPerf,
        lossReasons: sortReasons(lossReasons),
        rejectionReasons: sortReasons(rejectionReasons),
        dailyBreakdown,
        details: {
          type: detailType,
          page: detailPage,
          pageSize: detailPageSize,
          total,
          rows: pageRows,
        },
        coverage: {
          wonLostDates: usedLegacyWonLost ? "legacy_fallback" : "exact",
          customerAssignment: approxCustomer ? "approximate_customer_assignment" : "exact",
          collectedRevenue: unlinkedPayments > 0 ? "partial" : "exact",
          notes: coverageNotes,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[executive-performance]", err);
      res.status(500).json({ error: err?.message || "Failed to build executive performance report" });
    }
  });
}
