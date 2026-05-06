/**
 * Payment Center API — catalog, proposal decisions, plans, payments, history, remaining.
 */

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function parseJsonSafe(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isoDateOnly(d) {
  if (!d) return null;
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function addBillingCycle(isoDate, cycle) {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDate;
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function registerPaymentsApi(app, db, helpers = {}) {
  const { getProposalById, broadcast } = helpers;

  function nextReceiptNumber() {
    const y = new Date().getFullYear();
    db.prepare("INSERT OR IGNORE INTO receipt_sequence (year, lastSeq) VALUES (?, 0)").run(y);
    const row = db.prepare("SELECT lastSeq FROM receipt_sequence WHERE year = ?").get(y);
    const next = (row?.lastSeq ?? 0) + 1;
    db.prepare("UPDATE receipt_sequence SET lastSeq = ? WHERE year = ?").run(next, y);
    return `REC-${y}-${String(next).padStart(6, "0")}`;
  }

  function audit(customerId, entityType, entityId, action, detail, userId, userName) {
    db.prepare(
      `INSERT INTO payment_audit_legacy (id, entityType, entityId, customerId, action, detailJson, userId, userName, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "pa" + makeId(),
      entityType,
      entityId,
      customerId || null,
      action,
      JSON.stringify(detail ?? {}),
      userId || "system",
      userName || "System",
      new Date().toISOString(),
    );
  }

  // ── PLAN CATALOG (MoM 19/04/2026) ──────────────────────────────────────────

  app.get("/api/payments/catalog", (_req, res) => {
    const plans = db.prepare("SELECT * FROM payment_plan_catalog ORDER BY name").all();
    res.json(
      plans.map((p) => ({
        ...p,
        schedule: parseJsonSafe(p.schedule || "[]", []),
        isActive: !!p.is_active,
      })),
    );
  });

  // Aliases used by frontend
  app.get("/api/payment-plans/catalog", (_req, res) => {
    const plans = db.prepare("SELECT * FROM payment_plan_catalog ORDER BY name").all();
    res.json(
      plans.map((p) => ({
        ...p,
        schedule: parseJsonSafe(p.schedule || "[]", []),
        isActive: !!p.is_active,
      })),
    );
  });

  app.post("/api/payments/catalog", (req, res) => {
    const { name, description, schedule, userId } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const planId = "ppc" + makeId();
    const sched = Array.isArray(schedule) ? schedule : [];
    db.prepare(
      `INSERT INTO payment_plan_catalog
       (id, name, description, installments, schedule, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
    ).run(planId, String(name).trim(), description ?? null, sched.length || 1, JSON.stringify(sched), userId ?? null);
    const row = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(planId);
    try {
      broadcast?.({ type: "change", entity: "payments", action: "catalog_created", id: planId });
    } catch {
      /* ignore */
    }
    res.status(201).json({
      ...row,
      schedule: parseJsonSafe(row.schedule || "[]", []),
      isActive: !!row.is_active,
    });
  });

  app.post("/api/payment-plans/catalog", (req, res) => {
    const { name, description, schedule, userId } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const planId = "ppc" + makeId();
    const sched = Array.isArray(schedule) ? schedule : [];
    db.prepare(
      `INSERT INTO payment_plan_catalog
       (id, name, description, installments, schedule, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
    ).run(planId, String(name).trim(), description ?? null, sched.length || 1, JSON.stringify(sched), userId ?? null);
    const row = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(planId);
    res.status(201).json({
      ...row,
      schedule: parseJsonSafe(row.schedule || "[]", []),
      isActive: !!row.is_active,
    });
  });

  app.put("/api/payments/catalog/:id", (req, res) => {
    const { name, description, schedule } = req.body || {};
    const id = req.params.id;
    const existing = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const sched = Array.isArray(schedule) ? schedule : parseJsonSafe(existing.schedule || "[]", []);
    db.prepare(
      `UPDATE payment_plan_catalog SET
        name = ?,
        description = ?,
        schedule = ?,
        installments = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      name != null ? String(name).trim() : existing.name,
      description !== undefined ? description : existing.description,
      JSON.stringify(sched),
      sched.length || 1,
      id,
    );
    const row = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(id);
    try {
      broadcast?.({ type: "change", entity: "payments", action: "catalog_updated", id });
    } catch {
      /* ignore */
    }
    res.json({ ...row, schedule: parseJsonSafe(row.schedule || "[]", []), isActive: !!row.is_active });
  });

  app.put("/api/payment-plans/catalog/:id", (req, res) => {
    const { name, description, schedule } = req.body || {};
    const id = req.params.id;
    const existing = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const sched = Array.isArray(schedule) ? schedule : parseJsonSafe(existing.schedule || "[]", []);
    db.prepare(
      `UPDATE payment_plan_catalog SET
        name = ?,
        description = ?,
        schedule = ?,
        installments = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      name != null ? String(name).trim() : existing.name,
      description !== undefined ? description : existing.description,
      JSON.stringify(sched),
      sched.length || 1,
      id,
    );
    const row = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(id);
    res.json({ ...row, schedule: parseJsonSafe(row.schedule || "[]", []), isActive: !!row.is_active });
  });

  app.delete("/api/payments/catalog/:id", (req, res) => {
    const id = req.params.id;
    const existing = db.prepare("SELECT id FROM payment_plan_catalog WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const inUse = db.prepare("SELECT COUNT(*) AS c FROM customer_payment_plans WHERE plan_catalog_id = ?").get(id).c;
    if (inUse > 0) return res.status(400).json({ error: "Plan template is assigned to deals; remove those plans first" });
    db.prepare("DELETE FROM payment_plan_catalog WHERE id = ?").run(id);
    try {
      broadcast?.({ type: "change", entity: "payments", action: "catalog_deleted", id });
    } catch {
      /* ignore */
    }
    res.json({ ok: true });
  });

  app.delete("/api/payment-plans/catalog/:id", (req, res) => {
    const id = req.params.id;
    const existing = db.prepare("SELECT id FROM payment_plan_catalog WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const inUse = db.prepare("SELECT COUNT(*) AS c FROM customer_payment_plans WHERE plan_catalog_id = ?").get(id).c;
    if (inUse > 0) return res.status(400).json({ error: "Plan template is assigned to deals; remove those plans first" });
    db.prepare("DELETE FROM payment_plan_catalog WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  // ── CUSTOMER PAYMENT PLANS (MoM 19/04/2026) ────────────────────────────────

  app.get("/api/payments/deal/:dealId/summary-v2", (req, res) => {
    const { dealId } = req.params;
    const deal = db.prepare("SELECT id, name, customerId, value, totalAmount FROM deals WHERE id = ?").get(dealId);
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    const plans = db
      .prepare(
        `SELECT cpp.*
         FROM customer_payment_plans cpp
         WHERE cpp.deal_id = ?
         ORDER BY cpp.created_at DESC`,
      )
      .all(dealId);
    const installments = db
      .prepare(`SELECT * FROM payment_installments WHERE deal_id = ? ORDER BY due_date ASC`)
      .all(dealId);
    res.json({
      deal,
      plans: plans.map((p) => ({
        ...p,
        installments: installments.filter((i) => i.plan_id === p.id),
      })),
    });
  });

  app.post("/api/payments/deal/:dealId/create-plan-v2", (req, res) => {
    const { dealId } = req.params;
    const {
      planType,
      planName,
      totalAmount,
      startDate,
      endDate,
      installmentsCount,
      schedule,
      gstApplicable,
      userId,
      userName,
    } = req.body || {};

    const deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId);
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const total = Number(totalAmount ?? deal.totalAmount ?? deal.value ?? 0);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: "totalAmount must be > 0" });
    const start = isoDateOnly(startDate) ?? isoDateOnly(new Date().toISOString());
    if (!start) return res.status(400).json({ error: "startDate invalid" });
    const end = endDate ? isoDateOnly(endDate) : null;

    const pt = String(planType || "one_time");
    const title =
      String(planName || "").trim() ||
      (pt === "monthly"
        ? "Monthly installments"
        : pt === "quarterly"
          ? "Quarterly installments"
          : pt === "custom"
            ? "Custom schedule"
            : "One time payment");

    const planId = "cpp" + makeId();
    db.prepare(
      `INSERT INTO customer_payment_plans (
        id, customer_id, deal_id, proposal_id, plan_catalog_id,
        plan_name, total_amount, paid_amount, remaining_amount,
        status, start_date, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,0,?, 'active',?,?, datetime('now'), datetime('now'))`,
    ).run(
      planId,
      deal.customerId,
      dealId,
      deal.proposalId ?? null,
      null,
      gstApplicable ? `${title} (GST)` : title,
      total,
      total,
      start,
      userId ?? null,
    );

    const stmt = db.prepare(
      `INSERT INTO payment_installments (
        id, plan_id, customer_id, deal_id, label, amount, percentage, due_date, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?, 'pending', datetime('now'), datetime('now'))`,
    );

    const makeMonthlyDates = (count) => {
      const base = new Date(start + "T12:00:00");
      const out = [];
      for (let i = 0; i < count; i++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i);
        out.push(d.toISOString().slice(0, 10));
      }
      return out;
    };
    const makeQuarterlyDates = (count) => {
      const base = new Date(start + "T12:00:00");
      const out = [];
      for (let i = 0; i < count; i++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i * 3);
        out.push(d.toISOString().slice(0, 10));
      }
      return out;
    };

    const items = (() => {
      if (pt === "custom" && Array.isArray(schedule) && schedule.length > 0) {
        return schedule
          .map((r, idx) => ({
            label: String(r.label ?? `Installment ${idx + 1}`),
            due_date: isoDateOnly(r.due_date) ?? start,
            amount: Number(r.amount ?? 0),
          }))
          .filter((r) => Number.isFinite(r.amount) && r.amount > 0);
      }
      if (pt === "monthly") {
        const n = Math.max(1, Number(installmentsCount ?? 3));
        const dates = makeMonthlyDates(n);
        const per = Math.round((total / n) * 100) / 100;
        return dates.map((d, i) => ({ label: `Installment ${i + 1}`, due_date: d, amount: i === n - 1 ? total - per * (n - 1) : per }));
      }
      if (pt === "quarterly") {
        const n = Math.max(1, Number(installmentsCount ?? 4));
        const dates = makeQuarterlyDates(n);
        const per = Math.round((total / n) * 100) / 100;
        return dates.map((d, i) => ({ label: `Installment ${i + 1}`, due_date: d, amount: i === n - 1 ? total - per * (n - 1) : per }));
      }
      return [{ label: "One time", due_date: start, amount: total }];
    })();

    if (items.length === 0) {
      db.prepare("DELETE FROM customer_payment_plans WHERE id = ?").run(planId);
      return res.status(400).json({ error: "Invalid schedule (no installments)" });
    }

    const sum = items.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    if (Math.abs(sum - total) > 0.5) {
      // Keep strict to prevent accidental mismatch.
      db.prepare("DELETE FROM customer_payment_plans WHERE id = ?").run(planId);
      return res.status(400).json({ error: `Schedule total (${sum}) must equal totalAmount (${total})` });
    }

    for (const r of items) {
      stmt.run("pi" + makeId(), planId, deal.customerId, dealId, r.label, Number(r.amount), null, r.due_date);
    }

    db.prepare(
      `INSERT INTO payment_audit (id, plan_id, customer_id, action, performed_by, performed_by_name, new_value, created_at)
       VALUES (?, ?, ?, 'created', ?, ?, ?, datetime('now'))`,
    ).run(
      "pa" + makeId(),
      planId,
      deal.customerId,
      userId ?? null,
      userName ?? null,
      JSON.stringify({ planType: pt, planName: title, totalAmount: total, startDate: start, endDate: end }),
    );

    try {
      broadcast?.({ type: "change", entity: "payments", action: "plan_created", id: planId, dealId, customerId: deal.customerId });
      broadcast?.({ type: "change", entity: "deals", action: "updated", id: dealId });
    } catch {
      /* ignore */
    }

    res.status(201).json({
      plan: db.prepare("SELECT * FROM customer_payment_plans WHERE id = ?").get(planId),
      installments: db.prepare("SELECT * FROM payment_installments WHERE plan_id = ? ORDER BY due_date ASC").all(planId),
    });
  });

  app.get("/api/payments/customer/:customerId/summary-v2", (req, res) => {
    const { customerId } = req.params;
    const plans = db
      .prepare(
        `SELECT cpp.*, d.name as deal_title, d.stage as deal_stage
         FROM customer_payment_plans cpp
         LEFT JOIN deals d ON d.id = cpp.deal_id
         WHERE cpp.customer_id = ?
         ORDER BY cpp.created_at DESC`,
      )
      .all(customerId);

    const installments = db
      .prepare(`SELECT * FROM payment_installments WHERE customer_id = ? ORDER BY due_date ASC`)
      .all(customerId);

    const totalPaid = installments
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.paid_amount ?? 0), 0);

    const totalPending = installments
      .filter((i) => i.status === "pending")
      .reduce((s, i) => s + Number(i.amount ?? 0), 0);

    const overdue = installments.filter((i) => i.status === "pending" && new Date(i.due_date) < new Date());

    res.json({
      plans: plans.map((p) => ({
        ...p,
        installments: installments.filter((i) => i.plan_id === p.id),
      })),
      summary: {
        totalPaid,
        totalPending,
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((s, i) => s + Number(i.amount ?? 0), 0),
      },
    });
  });

  app.post("/api/payments/customer/:customerId/assign-plan", (req, res) => {
    const { customerId } = req.params;
    const { dealId, proposalId, planCatalogId, planName, totalAmount, startDate, userId, userName } = req.body || {};
    if (!dealId) return res.status(400).json({ error: "dealId required" });
    if (!planCatalogId) return res.status(400).json({ error: "planCatalogId required" });
    if (!planName) return res.status(400).json({ error: "planName required" });
    const total = Number(totalAmount ?? 0);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: "totalAmount must be > 0" });
    const start = isoDateOnly(startDate) ?? isoDateOnly(new Date().toISOString());
    if (!start) return res.status(400).json({ error: "startDate invalid" });

    const catalog = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(planCatalogId);
    if (!catalog) return res.status(404).json({ error: "Catalog plan not found" });
    const schedule = parseJsonSafe(catalog.schedule || "[]", []);

    const planId = "cpp" + makeId();
    db.prepare(
      `INSERT INTO customer_payment_plans (
        id, customer_id, deal_id, proposal_id, plan_catalog_id,
        plan_name, total_amount, paid_amount, remaining_amount,
        status, start_date, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,0,?, 'active',?,?, datetime('now'), datetime('now'))`,
    ).run(planId, customerId, dealId, proposalId ?? null, planCatalogId, String(planName).trim(), total, total, start, userId ?? null);

    const stmt = db.prepare(
      `INSERT INTO payment_installments (
        id, plan_id, customer_id, deal_id, label, amount, percentage, due_date, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?, 'pending', datetime('now'), datetime('now'))`,
    );

    const base = new Date(start + "T12:00:00");
    schedule.forEach((item) => {
      const due = new Date(base);
      due.setDate(due.getDate() + Number(item.due_days_after_start ?? 0));
      const pct = Number(item.percentage ?? 0);
      const amt = (total * pct) / 100;
      stmt.run(
        "pi" + makeId(),
        planId,
        customerId,
        dealId,
        String(item.label ?? "Installment"),
        amt,
        pct,
        due.toISOString().slice(0, 10),
      );
    });

    db.prepare(
      `INSERT INTO payment_audit (id, plan_id, customer_id, action, performed_by, performed_by_name, new_value, created_at)
       VALUES (?, ?, ?, 'created', ?, ?, ?, datetime('now'))`,
    ).run("pa" + makeId(), planId, customerId, userId ?? null, userName ?? null, JSON.stringify({ planName, totalAmount: total, startDate: start }));

    try {
      broadcast?.({ type: "change", entity: "payments", action: "plan_assigned", id: planId, customerId });
      broadcast?.({ type: "change", entity: "customers", action: "updated", id: customerId });
      broadcast?.({ type: "change", entity: "deals", action: "updated", id: dealId });
    } catch {
      /* ignore */
    }
    res.status(201).json({
      plan: db.prepare("SELECT * FROM customer_payment_plans WHERE id = ?").get(planId),
      installments: db.prepare("SELECT * FROM payment_installments WHERE plan_id = ? ORDER BY due_date ASC").all(planId),
    });
  });

  app.post("/api/payments/installment/:id/pay", (req, res) => {
    const { id } = req.params;
    const { paidAmount, paidDate, paymentMode, transactionReference, notes, userId, userName } = req.body || {};
    const inst = db.prepare("SELECT * FROM payment_installments WHERE id = ?").get(id);
    if (!inst) return res.status(404).json({ error: "Not found" });
    const paid = Number(paidAmount ?? 0);
    if (!Number.isFinite(paid) || paid <= 0) return res.status(400).json({ error: "paidAmount must be > 0" });
    const payDate = isoDateOnly(paidDate) ?? isoDateOnly(new Date().toISOString());
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const before = { ...inst };
    const status = paid >= Number(inst.amount ?? 0) ? "paid" : "partial";
    db.prepare(
      `UPDATE payment_installments SET
        paid_amount = ?,
        paid_date = ?,
        payment_mode = ?,
        transaction_reference = ?,
        receipt_number = ?,
        notes = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(paid, payDate, paymentMode ?? null, transactionReference ?? null, receiptNumber, notes ?? null, status, id);

    // recompute plan totals
    const planId = inst.plan_id;
    const plan = db.prepare("SELECT * FROM customer_payment_plans WHERE id = ?").get(planId);
    const planInst = db.prepare("SELECT * FROM payment_installments WHERE plan_id = ?").all(planId);
    const totalPaid = planInst.reduce((s, r) => s + Number(r.paid_amount ?? 0), 0);
    const remaining = Math.max(0, Number(plan.total_amount ?? 0) - totalPaid);
    const planStatus = remaining <= 0 ? "completed" : "active";
    db.prepare(
      `UPDATE customer_payment_plans SET paid_amount=?, remaining_amount=?, status=?, updated_at=datetime('now') WHERE id=?`,
    ).run(totalPaid, remaining, planStatus, planId);

    const after = db.prepare("SELECT * FROM payment_installments WHERE id = ?").get(id);
    db.prepare(
      `INSERT INTO payment_audit (
        id, installment_id, plan_id, customer_id, action,
        performed_by, performed_by_name, old_value, new_value, notes, created_at
      ) VALUES (?,?,?,?, 'paid', ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      "pa" + makeId(),
      id,
      planId,
      inst.customer_id,
      userId ?? null,
      userName ?? null,
      JSON.stringify(before),
      JSON.stringify(after),
      `Paid ₹${paid} via ${paymentMode ?? "other"}`,
    );

    try {
      broadcast?.({ type: "change", entity: "payments", action: "installment_paid", id, customerId: inst.customer_id });
      broadcast?.({ type: "change", entity: "customers", action: "updated", id: inst.customer_id });
    } catch {
      /* ignore */
    }
    res.json({ installment: after, receiptNumber });
  });

  app.put("/api/payments/installment/:id/confirm", (req, res) => {
    const { id } = req.params;
    const { userId, userName } = req.body || {};
    const inst = db.prepare("SELECT * FROM payment_installments WHERE id = ?").get(id);
    if (!inst) return res.status(404).json({ error: "Not found" });
    db.prepare(
      `UPDATE payment_installments SET confirmed_by=?, confirmed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    ).run(userId ?? null, id);
    db.prepare(
      `INSERT INTO payment_audit (id, installment_id, plan_id, customer_id, action, performed_by, performed_by_name, created_at)
       VALUES (?,?,?,?, 'confirmed', ?, ?, datetime('now'))`,
    ).run("pa" + makeId(), id, inst.plan_id, inst.customer_id, userId ?? null, userName ?? null);
    try {
      broadcast?.({ type: "change", entity: "payments", action: "installment_confirmed", id, customerId: inst.customer_id });
      broadcast?.({ type: "change", entity: "customers", action: "updated", id: inst.customer_id });
    } catch {
      /* ignore */
    }
    res.json(db.prepare("SELECT * FROM payment_installments WHERE id = ?").get(id));
  });

  app.get("/api/payments/overdue", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT pi.*, c.name as company_name, c.id as customer_id, d.name as deal_title
         FROM payment_installments pi
         LEFT JOIN customers c ON c.id = pi.customer_id
         LEFT JOIN deals d ON d.id = pi.deal_id
         WHERE pi.status = 'pending' AND pi.due_date < date('now')
         ORDER BY pi.due_date ASC`,
      )
      .all();
    res.json(rows);
  });

  app.get("/api/payments/history-v2", (req, res) => {
    const { customerId, dealId, from, to, status } = req.query || {};
    let where = "1=1";
    const params = [];
    if (customerId) {
      where += " AND pi.customer_id = ?";
      params.push(customerId);
    }
    if (dealId) {
      where += " AND pi.deal_id = ?";
      params.push(dealId);
    }
    if (from) {
      where += " AND pi.due_date >= ?";
      params.push(from);
    }
    if (to) {
      where += " AND pi.due_date <= ?";
      params.push(to);
    }
    if (status) {
      where += " AND pi.status = ?";
      params.push(status);
    }
    const rows = db
      .prepare(
        `SELECT pi.*, c.name as company_name, d.name as deal_title
         FROM payment_installments pi
         LEFT JOIN customers c ON c.id = pi.customer_id
         LEFT JOIN deals d ON d.id = pi.deal_id
         WHERE ${where}
         ORDER BY pi.due_date DESC`,
      )
      .all(...params);
    res.json(rows);
  });

  app.get("/api/payments/audit-v2", (req, res) => {
    const { customerId, planId } = req.query || {};
    let where = "1=1";
    const params = [];
    if (customerId) {
      where += " AND customer_id = ?";
      params.push(customerId);
    }
    if (planId) {
      where += " AND plan_id = ?";
      params.push(planId);
    }
    const rows = db
      .prepare(`SELECT * FROM payment_audit WHERE ${where} ORDER BY created_at DESC LIMIT 100`)
      .all(...params);
    res.json(rows);
  });

  app.get("/api/payments/remaining-v2", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT
           cpp.id as plan_id,
           cpp.plan_name,
           cpp.total_amount,
           cpp.paid_amount,
           cpp.remaining_amount,
           cpp.status,
           c.id as customer_id,
           c.name as company_name,
           d.name as deal_title,
           COUNT(CASE WHEN pi.status = 'pending' AND pi.due_date < date('now') THEN 1 END) as overdue_count,
           MIN(CASE WHEN pi.status = 'pending' THEN pi.due_date END) as next_due_date
         FROM customer_payment_plans cpp
         LEFT JOIN customers c ON c.id = cpp.customer_id
         LEFT JOIN deals d ON d.id = cpp.deal_id
         LEFT JOIN payment_installments pi ON pi.plan_id = cpp.id
         WHERE cpp.remaining_amount > 0
         GROUP BY cpp.id
         ORDER BY next_due_date ASC`,
      )
      .all();
    res.json(rows);
  });

  // Keep legacy endpoints intact below.

  app.get("/api/payments/customer/:customerId/summary", (req, res) => {
    const { customerId } = req.params;
    const decision = db
      .prepare(
        `SELECT * FROM customer_proposal_decision WHERE customerId = ? ORDER BY updatedAt DESC LIMIT 1`
      )
      .get(customerId);
    const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE customerId = ?").get(customerId);
    const payments = db
      .prepare(
        `SELECT * FROM customer_payment_record WHERE customerId = ? ORDER BY paymentDate DESC, createdAt DESC`
      )
      .all(customerId);
    res.json({ decision: decision || null, plan: plan || null, payments });
  });

  app.put("/api/payments/customer/:customerId/proposal-decision", (req, res) => {
    const { customerId } = req.params;
    const {
      proposalId,
      status,
      rejectionReason,
      decisionDate,
      approvedByUserId,
      approvedByName,
      remarks,
    } = req.body || {};
    if (!proposalId || !status || !["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ error: "proposalId and status (accepted|rejected) required" });
    }
    const now = new Date().toISOString();
    const id = "cpd" + makeId();
    const existing = db
      .prepare("SELECT id FROM customer_proposal_decision WHERE customerId = ? AND proposalId = ?")
      .get(customerId, proposalId);

    const row = {
      id: existing?.id || id,
      customerId,
      proposalId,
      status,
      rejectionReason: status === "rejected" ? rejectionReason || null : null,
      decisionDate: decisionDate || now.slice(0, 10),
      approvedByUserId: approvedByUserId || null,
      approvedByName: approvedByName || null,
      remarks: remarks || null,
      updatedAt: now,
    };

    if (existing) {
      db.prepare(
        `UPDATE customer_proposal_decision SET status=@status, rejectionReason=@rejectionReason, decisionDate=@decisionDate,
         approvedByUserId=@approvedByUserId, approvedByName=@approvedByName, remarks=@remarks, updatedAt=@updatedAt
         WHERE id=@id`
      ).run(row);
    } else {
      db.prepare(
        `INSERT INTO customer_proposal_decision (id, customerId, proposalId, status, rejectionReason, decisionDate, approvedByUserId, approvedByName, remarks, updatedAt)
         VALUES (@id, @customerId, @proposalId, @status, @rejectionReason, @decisionDate, @approvedByUserId, @approvedByName, @remarks, @updatedAt)`
      ).run(row);
    }

    if (status === "rejected") {
      db.prepare("DELETE FROM customer_payment_plan WHERE customerId = ?").run(customerId);
    }

    audit(customerId, "proposal_decision", row.id, "upsert_decision", { status, proposalId }, approvedByUserId, approvedByName);
    res.json(row);
  });

  app.put("/api/payments/customer/:customerId/payment-plan", (req, res) => {
    const { customerId } = req.params;
    const decision = db
      .prepare("SELECT * FROM customer_proposal_decision WHERE customerId = ? ORDER BY updatedAt DESC LIMIT 1")
      .get(customerId);
    if (!decision || decision.status !== "accepted") {
      return res.status(400).json({ error: "Proposal must be accepted before assigning a payment plan" });
    }

    const {
      catalogPlanId,
      planName,
      billingCycle,
      totalPlanAmount,
      planStartDate,
      planEndDate,
      numInstallments,
      gracePeriodDays,
      partialAllowed,
      userId,
      userName,
    } = req.body || {};

    if (!catalogPlanId || !planName || !billingCycle || totalPlanAmount == null || !planStartDate || !planEndDate || !numInstallments) {
      return res.status(400).json({ error: "Missing required plan fields" });
    }

    const n = Math.max(1, Number(numInstallments));
    const total = Number(totalPlanAmount);
    const per = Math.round((total / n) * 100) / 100;
    const now = new Date().toISOString();
    const planId = "cpp" + makeId();

    const plan = {
      id: planId,
      customerId,
      catalogPlanId,
      planName: String(planName),
      billingCycle,
      totalPlanAmount: total,
      planStartDate,
      planEndDate,
      numInstallments: n,
      perInstallmentAmount: per,
      nextDueDate: planStartDate,
      gracePeriodDays: Number(gracePeriodDays) || 5,
      creditBalance: 0,
      amountPaidTotal: 0,
      partialAllowed: partialAllowed === false ? 0 : 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    db.prepare("DELETE FROM customer_payment_plan WHERE customerId = ?").run(customerId);
    db.prepare(
      `INSERT INTO customer_payment_plan (
        id, customerId, catalogPlanId, planName, billingCycle, totalPlanAmount, planStartDate, planEndDate,
        numInstallments, perInstallmentAmount, nextDueDate, gracePeriodDays, creditBalance, amountPaidTotal,
        partialAllowed, status, createdAt, updatedAt
      ) VALUES (
        @id, @customerId, @catalogPlanId, @planName, @billingCycle, @totalPlanAmount, @planStartDate, @planEndDate,
        @numInstallments, @perInstallmentAmount, @nextDueDate, @gracePeriodDays, @creditBalance, @amountPaidTotal,
        @partialAllowed, @status, @createdAt, @updatedAt
      )`
    ).run(plan);

    audit(customerId, "payment_plan", planId, "create_plan", { planName, total }, userId, userName);
    res.status(201).json(plan);
  });

  app.delete("/api/payments/customer/:customerId/payment-plan", (req, res) => {
    const { customerId } = req.params;
    const { userId, userName } = req.body || {};
    const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE customerId = ?").get(customerId);
    if (!plan) return res.status(404).json({ error: "No payment plan for this customer" });
    const payCount = db.prepare("SELECT COUNT(*) AS c FROM customer_payment_record WHERE planId = ?").get(plan.id).c;
    if (payCount > 0) {
      return res.status(400).json({ error: "Delete or void payment records for this plan before removing it" });
    }
    db.prepare("DELETE FROM customer_payment_plan WHERE id = ?").run(plan.id);
    audit(customerId, "payment_plan", plan.id, "delete_plan", {}, userId, userName);
    res.json({ ok: true });
  });

  app.post("/api/payments/customer/:customerId/payment", (req, res) => {
    const { customerId } = req.params;
    const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE customerId = ?").get(customerId);
    if (!plan) return res.status(400).json({ error: "No active payment plan" });

    const {
      paymentMode,
      transactionRef,
      bankName,
      chequeNumber,
      receiptFileRef,
      paymentDate,
      amountPaid,
      paymentStatus,
      internalNotes,
      isPartial,
      balanceCarriedForward,
      userId,
      userName,
    } = req.body || {};

    if (!paymentMode || amountPaid == null || !paymentDate) {
      return res.status(400).json({ error: "paymentMode, amountPaid, paymentDate required" });
    }

    /** Cash/cheque always start as pending until an admin confirms. All other modes can post as confirmed. */
    const isCashOrCheque = paymentMode === "cash" || paymentMode === "cheque";
    const requested = paymentStatus || "pending";
    const status = isCashOrCheque ? "pending" : requested;
    const confirmedNow = status === "confirmed" && !isCashOrCheque;
    const receiptNumber = confirmedNow ? nextReceiptNumber() : null;

    const now = new Date().toISOString();
    const rec = {
      id: "cpr" + makeId(),
      customerId,
      planId: plan.id,
      receiptNumber,
      paymentMode,
      transactionRef: transactionRef || null,
      bankName: bankName || null,
      chequeNumber: chequeNumber || null,
      receiptFileRef: receiptFileRef || null,
      paymentDate,
      amountPaid: Number(amountPaid),
      paymentStatus: status,
      adminConfirmed: confirmedNow ? 1 : 0,
      adminConfirmedBy: confirmedNow ? userId : null,
      adminConfirmedByName: confirmedNow ? userName : null,
      adminConfirmedAt: confirmedNow ? now : null,
      internalNotes: internalNotes || null,
      isPartial: isPartial ? 1 : 0,
      balanceCarriedForward: balanceCarriedForward != null ? Number(balanceCarriedForward) : 0,
      receiptSent: 0,
      billingCycleSnapshot: plan.billingCycle,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(
      `INSERT INTO customer_payment_record (
        id, customerId, planId, receiptNumber, paymentMode, transactionRef, bankName, chequeNumber, receiptFileRef,
        paymentDate, amountPaid, paymentStatus, adminConfirmed, adminConfirmedBy, adminConfirmedByName, adminConfirmedAt,
        internalNotes, isPartial, balanceCarriedForward, receiptSent, billingCycleSnapshot, createdAt, updatedAt
      ) VALUES (
        @id, @customerId, @planId, @receiptNumber, @paymentMode, @transactionRef, @bankName, @chequeNumber, @receiptFileRef,
        @paymentDate, @amountPaid, @paymentStatus, @adminConfirmed, @adminConfirmedBy, @adminConfirmedByName, @adminConfirmedAt,
        @internalNotes, @isPartial, @balanceCarriedForward, @receiptSent, @billingCycleSnapshot, @createdAt, @updatedAt
      )`
    ).run(rec);

    if (confirmedNow) {
      applyPaymentToPlan(db, plan, rec, audit, customerId, userId, userName);
    }

    audit(customerId, "payment", rec.id, "create_payment", { amount: rec.amountPaid, status }, userId, userName);
    res.status(201).json(rec);
  });

  app.put("/api/payments/record/:id/confirm", (req, res) => {
    const id = req.params.id;
    const rec = db.prepare("SELECT * FROM customer_payment_record WHERE id = ?").get(id);
    if (!rec) return res.status(404).json({ error: "Not found" });
    if (rec.paymentStatus === "confirmed") return res.json(rec);

    const { userId, userName } = req.body || {};
    const now = new Date().toISOString();
    const receiptNumber = rec.receiptNumber || nextReceiptNumber();

    db.prepare(
      `UPDATE customer_payment_record SET paymentStatus='confirmed', adminConfirmed=1, adminConfirmedBy=?, adminConfirmedByName=?,
       adminConfirmedAt=?, receiptNumber=?, updatedAt=? WHERE id=?`
    ).run(userId || null, userName || null, now, receiptNumber, now, id);

    const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE id = ?").get(rec.planId);
    if (plan) {
      const updatedRec = { ...rec, receiptNumber, paymentStatus: "confirmed", adminConfirmed: 1 };
      applyPaymentToPlan(db, plan, updatedRec, audit, rec.customerId, userId, userName);
    }

    audit(rec.customerId, "payment", id, "confirm_payment", { receiptNumber }, userId, userName);
    const out = db.prepare("SELECT * FROM customer_payment_record WHERE id = ?").get(id);
    res.json(out);
  });

  app.put("/api/payments/record/:id", (req, res) => {
    const id = req.params.id;
    const existing = db.prepare("SELECT * FROM customer_payment_record WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const patch = req.body || {};
    const allowed = [
      "transactionRef",
      "bankName",
      "chequeNumber",
      "receiptFileRef",
      "internalNotes",
      "paymentStatus",
    ];
    const next = { ...existing };
    for (const k of allowed) {
      if (patch[k] !== undefined) next[k] = patch[k];
    }
    next.updatedAt = new Date().toISOString();
    db.prepare(
      `UPDATE customer_payment_record SET transactionRef=?, bankName=?, chequeNumber=?, receiptFileRef=?, internalNotes=?, paymentStatus=?, updatedAt=?
       WHERE id=?`
    ).run(
      next.transactionRef,
      next.bankName,
      next.chequeNumber,
      next.receiptFileRef,
      next.internalNotes,
      next.paymentStatus,
      next.updatedAt,
      id,
    );
    audit(existing.customerId, "payment", id, "update_payment", patch, patch.userId, patch.userName);
    res.json(db.prepare("SELECT * FROM customer_payment_record WHERE id = ?").get(id));
  });

  app.put("/api/payments/record/:id/receipt-sent", (req, res) => {
    const id = req.params.id;
    db.prepare("UPDATE customer_payment_record SET receiptSent = 1, updatedAt = ? WHERE id = ?").run(
      new Date().toISOString(),
      id,
    );
    const row = db.prepare("SELECT * FROM customer_payment_record WHERE id = ?").get(id);
    res.json(row);
  });

  app.delete("/api/payments/record/:id", (req, res) => {
    const id = req.params.id;
    const { userId, userName } = req.body || {};
    const rec = db.prepare("SELECT * FROM customer_payment_record WHERE id = ?").get(id);
    if (!rec) return res.status(404).json({ error: "Not found" });
    if (rec.paymentStatus === "confirmed") {
      return res.status(400).json({ error: "Cannot delete a confirmed payment (receipt issued)" });
    }
    db.prepare("DELETE FROM customer_payment_record WHERE id = ?").run(id);
    audit(rec.customerId, "payment", id, "delete_payment", { wasStatus: rec.paymentStatus }, userId, userName);
    res.json({ ok: true });
  });

  app.get("/api/payments/history", (req, res) => {
    const { customerId, from, to, mode, cycle } = req.query;
    let sql = `SELECT r.*, c.name AS customerName, c.leadId AS customerLeadId, p.planName
      FROM customer_payment_record r
      LEFT JOIN customers c ON c.id = r.customerId
      LEFT JOIN customer_payment_plan p ON p.id = r.planId
      WHERE 1=1`;
    const params = [];
    if (customerId) {
      sql += " AND r.customerId = ?";
      params.push(customerId);
    }
    if (from) {
      sql += " AND r.paymentDate >= ?";
      params.push(from);
    }
    if (to) {
      sql += " AND r.paymentDate <= ?";
      params.push(to);
    }
    if (mode) {
      sql += " AND r.paymentMode = ?";
      params.push(mode);
    }
    if (cycle) {
      sql += " AND r.billingCycleSnapshot = ?";
      params.push(cycle);
    }
    if (req.query.status) {
      sql += " AND r.paymentStatus = ?";
      params.push(req.query.status);
    }
    sql += " ORDER BY r.paymentDate DESC, r.createdAt DESC";
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  app.get("/api/payments/remaining", (req, res) => {
    const plans = db.prepare("SELECT * FROM customer_payment_plan WHERE status = 'active'").all();
    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    const overdueOnly = req.query.overdue === "true" || req.query.overdue === "1";

    for (const plan of plans) {
      const customer = db.prepare("SELECT id, name, leadId FROM customers WHERE id = ?").get(plan.customerId);
      const total = Number(plan.totalPlanAmount);
      const paid = Number(plan.amountPaidTotal);
      const remaining = Math.max(0, total - paid);
      const due = plan.nextDueDate;
      const gd = Number(plan.gracePeriodDays) || 5;
      const dueDay = new Date(due + "T12:00:00");
      const graceUntil = new Date(dueDay);
      graceUntil.setDate(graceUntil.getDate() + gd);
      const graceEndStr = graceUntil.toISOString().slice(0, 10);
      const todayD = new Date(today + "T12:00:00");

      let category = "upcoming";
      let daysOverdue = 0;
      let daysRemaining = 0;
      if (remaining <= 0.01) {
        category = "paid";
      } else if (today > graceEndStr) {
        category = "overdue";
        daysOverdue = Math.max(1, Math.floor((todayD - graceUntil) / 86400000));
      } else if (today >= due) {
        category = "grace";
        daysRemaining = Math.max(0, Math.floor((graceUntil - todayD) / 86400000));
      } else {
        daysRemaining = Math.max(0, Math.floor((dueDay - todayD) / 86400000));
      }

      const lastPay = db
        .prepare(
          "SELECT paymentDate FROM customer_payment_record WHERE customerId = ? AND paymentStatus = 'confirmed' ORDER BY paymentDate DESC LIMIT 1"
        )
        .get(plan.customerId);

      out.push({
        customerId: plan.customerId,
        customerName: customer?.name,
        customerLeadId: customer?.leadId,
        planName: plan.planName,
        planId: plan.id,
        dueDate: due,
        dueAmount: Math.min(plan.perInstallmentAmount, remaining),
        totalRemaining: remaining,
        category,
        daysOverdue: category === "overdue" ? daysOverdue : 0,
        daysRemaining: category === "upcoming" || category === "grace" ? daysRemaining : 0,
        lastPaymentDate: lastPay?.paymentDate || null,
        billingCycle: plan.billingCycle,
        nextDueDate: plan.nextDueDate,
        planEndDate: plan.planEndDate,
      });
    }
    const filtered = overdueOnly ? out.filter((x) => x.category === "overdue") : out;
    res.json(filtered);
  });

  app.get("/api/payments/audit", (req, res) => {
    const { customerId, limit = "100" } = req.query;
    let sql = "SELECT * FROM payment_audit WHERE 1=1";
    const params = [];
    if (customerId) {
      sql += " AND customerId = ?";
      params.push(customerId);
    }
    sql += " ORDER BY at DESC LIMIT ?";
    params.push(Number(limit) || 100);
    res.json(db.prepare(sql).all(...params));
  });
}

function applyPaymentToPlan(db, plan, rec, audit, customerId, userId, userName) {
  const amt = Number(rec.amountPaid);
  let paidTotal = Number(plan.amountPaidTotal) + amt;
  let credit = Number(plan.creditBalance) || 0;
  const total = Number(plan.totalPlanAmount);
  let nextDue = plan.nextDueDate;

  if (paidTotal > total + 1e-6) {
    credit += paidTotal - total;
    paidTotal = total;
  }

  const per = Number(plan.perInstallmentAmount);
  const advanceInstallment = !rec.isPartial && amt >= per * 0.99;
  if (advanceInstallment) {
    nextDue = addBillingCycle(plan.nextDueDate, plan.billingCycle);
  }

  const obligationLeft = total - paidTotal;
  const status = obligationLeft <= 0.01 ? "completed" : "active";
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE customer_payment_plan SET amountPaidTotal = ?, creditBalance = ?, nextDueDate = ?, status = ?, updatedAt = ? WHERE id = ?`
  ).run(paidTotal, credit, nextDue, status, now, plan.id);

  audit(customerId, "payment_plan", plan.id, "apply_payment", { paidTotal, nextDue, status, credit }, userId, userName);
}
