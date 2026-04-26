function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeRole(role) {
  return String(role || "").toLowerCase().replace(/\s+/g, "_");
}

const DELIVERY_STATUSES = [
  "not_started",
  "in_progress",
  "quality_check",
  "final_approval",
  "delivered",
];

function canTransition(role, toStatus) {
  const r = normalizeRole(role);
  if (r === "super_admin") return true;
  if (toStatus === "final_approval") return r === "finance";
  return r === "delivery_manager";
}

export function registerDeliveryApi(app, db) {
  app.get("/api/ai-memory/customer/:customerId/history", (req, res) => {
    const customerId = req.params.customerId;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
    const rows = db
      .prepare("SELECT * FROM central_history_db WHERE customerId = ? ORDER BY at DESC LIMIT ?")
      .all(customerId, limit);
    res.json(rows);
  });

  app.get("/api/delivery/deal/:dealId", (req, res) => {
    const dealId = req.params.dealId;
    const deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId);
    if (!deal) return res.status(404).json({ error: "Not found" });
    const logs = db
      .prepare("SELECT * FROM delivery_logs WHERE dealId = ? ORDER BY at DESC LIMIT 200")
      .all(dealId);
    res.json({
      dealId,
      deliveryStatus: deal.deliveryStatus || null,
      deliveryUpdatedAt: deal.deliveryUpdatedAt || null,
      deliveryFinalApprovedBy: deal.deliveryFinalApprovedBy || null,
      deliveryFinalApprovedAt: deal.deliveryFinalApprovedAt || null,
      logs,
    });
  });

  app.put("/api/delivery/deal/:dealId/status", (req, res) => {
    const dealId = req.params.dealId;
    const deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId);
    if (!deal) return res.status(404).json({ error: "Not found" });

    const { toStatus, notes, actorRole, actorUserId, actorName } = req.body || {};
    const next = String(toStatus || "").trim();
    if (!DELIVERY_STATUSES.includes(next)) {
      return res.status(400).json({ error: "Invalid delivery status" });
    }
    if (!canTransition(actorRole, next)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const from = deal.deliveryStatus || "not_started";
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        `UPDATE deals SET deliveryStatus = ?, deliveryUpdatedAt = ? WHERE id = ?`,
      ).run(next, now, dealId);

      if (next === "final_approval") {
        db.prepare(
          `UPDATE deals SET deliveryFinalApprovedBy = ?, deliveryFinalApprovedAt = ? WHERE id = ?`,
        ).run(actorUserId || null, now, dealId);
      }

      db.prepare(
        `INSERT INTO delivery_logs
         (id, dealId, customerId, fromStatus, toStatus, notes, performedBy, performedByName, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "dl" + makeId(),
        dealId,
        deal.customerId,
        from,
        next,
        notes || null,
        actorUserId || null,
        actorName || null,
        now,
      );
    })();

    // Central history (via middleware)
    try {
      req.logInteraction?.({
        customerId: deal.customerId,
        entityType: "deal",
        entityId: dealId,
        channel: "delivery",
        direction: "system",
        summary: `Delivery status changed: ${from} → ${next}`,
        payloadJson: { from, to: next, notes: notes || null },
        performedBy: actorUserId || null,
        performedByName: actorName || null,
        at: now,
      });
    } catch {
      /* ignore */
    }

    const out = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId);
    res.json({
      ok: true,
      dealId,
      deliveryStatus: out.deliveryStatus || null,
      deliveryUpdatedAt: out.deliveryUpdatedAt || null,
    });
  });
}

