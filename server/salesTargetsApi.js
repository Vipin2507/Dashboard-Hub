/**
 * Sales targets master data + helpers for executive performance.
 */

import {
  isValidYearMonth,
  resolveTargetsForPeriod,
} from "./salesTargetsLib.js";

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
    res.status(403).json({ error: "Only Super Admin can manage sales targets" });
    return false;
  }
  return true;
}

function emptyTargets() {
  return {
    proposalsSentTarget: 0,
    proposalsWonTarget: 0,
    revenueExclGstTarget: 0,
  };
}

function normalizeTargetValues(raw) {
  const n = (v) => Math.max(0, Number(v) || 0);
  return {
    proposalsSentTarget: Math.round(n(raw?.proposalsSentTarget)),
    proposalsWonTarget: Math.round(n(raw?.proposalsWonTarget) * 10) / 10,
    revenueExclGstTarget: Math.round(n(raw?.revenueExclGstTarget)),
  };
}

/**
 * @param {import("express").Express} app
 * @param {import("better-sqlite3").Database} db
 * @param {{ makeId: () => string }} opts
 */
export function registerSalesTargetsApi(app, db, { makeId }) {
  app.get("/api/masters/sales-targets", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const month = String(req.query?.month || "");
    if (!isValidYearMonth(month)) {
      return res.status(400).json({ error: "Valid month query (YYYY-MM) is required" });
    }

    const rows = db
      .prepare(
        "SELECT userId, proposalsSentTarget, proposalsWonTarget, revenueExclGstTarget FROM executive_sales_targets WHERE yearMonth = ?",
      )
      .all(month);

    const orgRow = rows.find((r) => !r.userId || r.userId === "");
    const org = orgRow
      ? normalizeTargetValues(orgRow)
      : emptyTargets();

    const users = db
      .prepare(
        "SELECT id, name, role, status FROM users WHERE role IN ('sales_rep', 'sales_manager') AND status = 'active' ORDER BY name",
      )
      .all();

    const byUser = Object.fromEntries(
      rows.filter((r) => r.userId).map((r) => [r.userId, normalizeTargetValues(r)]),
    );

    res.json({
      month,
      org,
      executives: users.map((u) => ({
        userId: u.id,
        name: u.name,
        role: u.role,
        ...normalizeTargetValues(byUser[u.id] || emptyTargets()),
      })),
    });
  });

  app.put("/api/masters/sales-targets", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const { month, org, executives } = req.body || {};
    if (!isValidYearMonth(month)) {
      return res.status(400).json({ error: "Valid month (YYYY-MM) is required" });
    }

    const actor = getActor(req);
    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO executive_sales_targets (
        id, yearMonth, userId, proposalsSentTarget, proposalsWonTarget, revenueExclGstTarget, updatedAt, updatedBy
      ) VALUES (
        @id, @yearMonth, @userId, @proposalsSentTarget, @proposalsWonTarget, @revenueExclGstTarget, @updatedAt, @updatedBy
      )
      ON CONFLICT(yearMonth, userId) DO UPDATE SET
        proposalsSentTarget = excluded.proposalsSentTarget,
        proposalsWonTarget = excluded.proposalsWonTarget,
        revenueExclGstTarget = excluded.revenueExclGstTarget,
        updatedAt = excluded.updatedAt,
        updatedBy = excluded.updatedBy
    `);

    const tx = db.transaction(() => {
      const orgValues = normalizeTargetValues(org);
      upsert.run({
        id: makeId(),
        yearMonth: month,
        userId: "",
        ...orgValues,
        updatedAt: now,
        updatedBy: actor.userId,
      });

      for (const row of executives || []) {
        if (!row?.userId) continue;
        const values = normalizeTargetValues(row);
        if (!values.proposalsSentTarget && !values.proposalsWonTarget && !values.revenueExclGstTarget) {
          db.prepare("DELETE FROM executive_sales_targets WHERE yearMonth = ? AND userId = ?").run(
            month,
            row.userId,
          );
          continue;
        }
        upsert.run({
          id: makeId(),
          yearMonth: month,
          userId: row.userId,
          ...values,
          updatedAt: now,
          updatedBy: actor.userId,
        });
      }
    });

    try {
      tx();
      res.json({ ok: true, month });
    } catch (err) {
      console.error("[sales-targets]", err);
      res.status(500).json({ error: err?.message || "Failed to save sales targets" });
    }
  });
}
