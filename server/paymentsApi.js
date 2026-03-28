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

function addBillingCycle(isoDate, cycle) {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDate;
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function registerPaymentsApi(app, db, helpers = {}) {
  const { getProposalById } = helpers;

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
      `INSERT INTO payment_audit (id, entityType, entityId, customerId, action, detailJson, userId, userName, at)
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

  app.get("/api/payment-plans/catalog", (_req, res) => {
    const rows = db.prepare("SELECT * FROM payment_plan_catalog ORDER BY name").all();
    res.json(rows);
  });

  app.post("/api/payment-plans/catalog", (req, res) => {
    const { name, defaultBillingCycle, defaultGraceDays, suggestedInstallments } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const row = {
      id: "ppc" + makeId(),
      name: String(name).trim(),
      defaultBillingCycle: defaultBillingCycle || "yearly",
      defaultGraceDays: Number(defaultGraceDays) || 5,
      suggestedInstallments: suggestedInstallments != null ? Number(suggestedInstallments) : null,
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO payment_plan_catalog (id, name, defaultBillingCycle, defaultGraceDays, suggestedInstallments, createdAt)
       VALUES (@id, @name, @defaultBillingCycle, @defaultGraceDays, @suggestedInstallments, @createdAt)`
    ).run(row);
    res.status(201).json(row);
  });

  app.put("/api/payment-plans/catalog/:id", (req, res) => {
    const id = req.params.id;
    const existing = db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { name, defaultBillingCycle, defaultGraceDays, suggestedInstallments } = req.body || {};
    const row = {
      ...existing,
      name: name != null ? String(name).trim() : existing.name,
      defaultBillingCycle: defaultBillingCycle ?? existing.defaultBillingCycle,
      defaultGraceDays: defaultGraceDays != null ? Number(defaultGraceDays) : existing.defaultGraceDays,
      suggestedInstallments:
        suggestedInstallments !== undefined
          ? suggestedInstallments === null
            ? null
            : Number(suggestedInstallments)
          : existing.suggestedInstallments,
    };
    db.prepare(
      `UPDATE payment_plan_catalog SET name=?, defaultBillingCycle=?, defaultGraceDays=?, suggestedInstallments=?
       WHERE id=?`
    ).run(row.name, row.defaultBillingCycle, row.defaultGraceDays, row.suggestedInstallments, id);
    res.json(db.prepare("SELECT * FROM payment_plan_catalog WHERE id = ?").get(id));
  });

  app.delete("/api/payment-plans/catalog/:id", (req, res) => {
    const id = req.params.id;
    const existing = db.prepare("SELECT id FROM payment_plan_catalog WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const inUse = db.prepare("SELECT COUNT(*) AS c FROM customer_payment_plan WHERE catalogPlanId = ?").get(id).c;
    if (inUse > 0) {
      return res.status(400).json({ error: "Plan template is assigned to customers; remove those plans first" });
    }
    db.prepare("DELETE FROM payment_plan_catalog WHERE id = ?").run(id);
    res.json({ ok: true });
  });

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
