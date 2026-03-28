/**
 * Renewal & subscription tracker — SQLite-backed rows + reminder state + settings.
 */

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_SETTINGS = {
  enabled30d: true,
  enabledExpiryDay: true,
  enabledOverdue: true,
  autoStopOnRenewal: true,
  channels30d: ["whatsapp", "email"],
  channelsExpiryDay: ["whatsapp", "email", "sms"],
  channelsOverdue: ["whatsapp", "email", "sms"],
  overdueRepeatDays: 7,
  template30d:
    "Hi {{customer_name}}, your subscription {{plan_name}} renews soon. Expiry: {{expiry_date}}. Amount: {{renewal_amount}}. Renew here: {{renewal_link}}",
  templateExpiryDay:
    "URGENT: {{customer_name}} — {{plan_name}} expires today ({{expiry_date}}). Amount due: {{renewal_amount}}. Renew now: {{renewal_link}}",
  templateOverdue:
    "Overdue notice: {{customer_name}}, {{plan_name}} expired on {{expiry_date}}. Amount: {{renewal_amount}}. Please pay: {{renewal_link}}",
  templateRenewedConfirm:
    "Thank you {{customer_name}}. Your {{plan_name}} renewal is confirmed. New period starts {{plan_start_date}}, next expiry {{expiry_date}}.",
};

function calendarDayDiff(fromIsoDate, toIsoDate) {
  const a = new Date(fromIsoDate + "T12:00:00");
  const b = new Date(toIsoDate + "T12:00:00");
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function classifyRow(expiryDate, lastRenewedAt, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const d = calendarDayDiff(today, expiryDate);
  const m = now.getMonth();
  const y = now.getFullYear();
  if (lastRenewedAt) {
    const lr = new Date(lastRenewedAt);
    if (lr.getMonth() === m && lr.getFullYear() === y) return "renewed_month";
  }
  if (d < 0) return "overdue";
  if (d <= 30) return "expiring_30";
  if (d <= 90) return "upcoming_31_90";
  return "active";
}

function syncSubscriptionsFromPaymentPlans(db) {
  const plans = db.prepare("SELECT * FROM customer_payment_plan").all();
  const insert = db.prepare(`
    INSERT INTO customer_subscriptions (
      id, customerId, planName, expiryDate, renewalAmount, billingCycle, source, sourceRef, lastRenewedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, 'payment_plan', ?, NULL, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE customer_subscriptions SET planName = ?, expiryDate = ?, renewalAmount = ?, billingCycle = ?, updatedAt = ?
    WHERE id = ? AND source = 'payment_plan'
  `);
  const now = new Date().toISOString();
  for (const p of plans) {
    const sid = `sub_${p.id}`;
    const existing = db.prepare("SELECT id FROM customer_subscriptions WHERE id = ?").get(sid);
    if (existing) {
      update.run(
        p.planName,
        p.planEndDate,
        Number(p.totalPlanAmount) || 0,
        p.billingCycle,
        now,
        sid,
      );
    } else {
      insert.run(
        sid,
        p.customerId,
        p.planName,
        p.planEndDate,
        Number(p.totalPlanAmount) || 0,
        p.billingCycle,
        p.id,
        p.createdAt || now,
        p.updatedAt || now,
      );
    }
    const st = db.prepare("SELECT subscriptionId FROM subscription_reminder_state WHERE subscriptionId = ?").get(sid);
    if (!st) {
      db.prepare("INSERT INTO subscription_reminder_state (subscriptionId) VALUES (?)").run(sid);
    }
  }
}

export function registerSubscriptionRenewalApi(app, db) {
  syncSubscriptionsFromPaymentPlans(db);

  const defaultSettingsRow = db.prepare("SELECT data FROM renewal_reminder_settings WHERE id = 1").get();
  if (!defaultSettingsRow) {
    db.prepare("INSERT INTO renewal_reminder_settings (id, data, updatedAt) VALUES (1, ?, ?)").run(
      JSON.stringify(DEFAULT_SETTINGS),
      new Date().toISOString(),
    );
  }

  function getSettings() {
    const row = db.prepare("SELECT data FROM renewal_reminder_settings WHERE id = 1").get();
    if (!row?.data) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function buildTrackerRows() {
    const subs = db
      .prepare(
        `SELECT s.*, c.name AS customerName, c.email AS customerEmail, c.primaryPhone AS customerPhone
         FROM customer_subscriptions s
         JOIN customers c ON c.id = s.customerId
         ORDER BY s.expiryDate ASC`,
      )
      .all();
    const today = new Date().toISOString().slice(0, 10);
    return subs.map((s) => {
      const st =
        db.prepare("SELECT * FROM subscription_reminder_state WHERE subscriptionId = ?").get(s.id) ?? {};
      const daysLeft = calendarDayDiff(today, s.expiryDate);
      const bucket = classifyRow(s.expiryDate, s.lastRenewedAt);
      const totalReminders =
        (st.reminder30Count || 0) + (st.reminderExpiryDayCount || 0) + (st.overdueReminderCount || 0);
      let statusLabel = "Upcoming";
      if (bucket === "overdue") statusLabel = "Overdue";
      else if (bucket === "expiring_30") statusLabel = "Expiring soon";
      else if (bucket === "upcoming_31_90") statusLabel = "Upcoming";
      else if (bucket === "renewed_month") statusLabel = "Renewed";
      return {
        id: s.id,
        customerId: s.customerId,
        customerName: s.customerName,
        customerEmail: s.customerEmail,
        customerPhone: s.customerPhone,
        planName: s.planName,
        expiryDate: s.expiryDate,
        renewalAmount: s.renewalAmount,
        billingCycle: s.billingCycle,
        source: s.source,
        sourceRef: s.sourceRef,
        lastRenewedAt: s.lastRenewedAt,
        daysLeft,
        bucket,
        statusLabel,
        reminder30Count: st.reminder30Count ?? 0,
        reminderExpiryDayCount: st.reminderExpiryDayCount ?? 0,
        overdueReminderCount: st.overdueReminderCount ?? 0,
        totalRemindersSent: totalReminders,
        pendingAutomations: st.pendingAutomations !== 0,
      };
    });
  }

  app.get("/api/subscriptions/tracker", (_req, res) => {
    syncSubscriptionsFromPaymentPlans(db);
    const rows = buildTrackerRows();
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const renewedThisMonth = rows.filter((r) => {
      if (!r.lastRenewedAt) return false;
      const prefix = String(r.lastRenewedAt).slice(0, 7);
      return prefix === ym;
    }).length;
    const overdue = rows.filter((r) => r.bucket === "overdue").length;
    const exp30 = rows.filter((r) => r.bucket === "expiring_30").length;
    const up31 = rows.filter((r) => r.bucket === "upcoming_31_90").length;
    res.json({
      rows,
      summary: {
        overdue,
        expiring30: exp30,
        upcoming31to90: up31,
        renewedThisMonth,
      },
      settings: getSettings(),
    });
  });

  app.get("/api/subscriptions/settings", (req, res) => {
    const role = req.query.actorRole || req.body?.actorRole;
    if (role !== "super_admin" && role !== "sales_manager") {
      return res.status(403).json({ error: "Only Super Admin or Sales Manager can view renewal settings" });
    }
    res.json(getSettings());
  });

  app.put("/api/subscriptions/settings", (req, res) => {
    const role = req.body?.actorRole || req.query?.actorRole;
    if (role !== "super_admin" && role !== "sales_manager") {
      return res.status(403).json({ error: "Only Super Admin or Sales Manager can update renewal settings" });
    }
    const next = { ...getSettings(), ...req.body };
    delete next.actorRole;
    delete next.userId;
    delete next.userName;
    db.prepare("INSERT OR REPLACE INTO renewal_reminder_settings (id, data, updatedAt) VALUES (1, ?, ?)").run(
      JSON.stringify(next),
      new Date().toISOString(),
    );
    res.json(getSettings());
  });

  app.post("/api/subscriptions/:id/record-reminder", (req, res) => {
    const { id } = req.params;
    const { kind } = req.body || {};
    const sub = db.prepare("SELECT id FROM customer_subscriptions WHERE id = ?").get(id);
    if (!sub) return res.status(404).json({ error: "Subscription not found" });
    const st = db.prepare("SELECT * FROM subscription_reminder_state WHERE subscriptionId = ?").get(id);
    if (!st) db.prepare("INSERT INTO subscription_reminder_state (subscriptionId) VALUES (?)").run(id);
    if (kind === "30d") {
      db.prepare(
        "UPDATE subscription_reminder_state SET reminder30Count = reminder30Count + 1 WHERE subscriptionId = ?",
      ).run(id);
    } else if (kind === "expiry_day") {
      db.prepare(
        "UPDATE subscription_reminder_state SET reminderExpiryDayCount = reminderExpiryDayCount + 1 WHERE subscriptionId = ?",
      ).run(id);
    } else if (kind === "overdue") {
      db.prepare(
        "UPDATE subscription_reminder_state SET overdueReminderCount = overdueReminderCount + 1, lastOverdueReminderAt = ? WHERE subscriptionId = ?",
      ).run(new Date().toISOString(), id);
    } else {
      return res.status(400).json({ error: "kind must be 30d, expiry_day, or overdue" });
    }
    res.json({ ok: true });
  });

  app.post("/api/subscriptions/:id/mark-renewed", (req, res) => {
    const { id } = req.params;
    const { newPlanStartDate, newExpiryDate, recordPayment, userId, userName } = req.body || {};
    if (!newPlanStartDate || !newExpiryDate) {
      return res.status(400).json({ error: "newPlanStartDate and newExpiryDate required" });
    }
    const s = db.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").get(id);
    if (!s) return res.status(404).json({ error: "Not found" });
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE customer_subscriptions SET expiryDate = ?, lastRenewedAt = ?, updatedAt = ? WHERE id = ?`,
    ).run(newExpiryDate, now, now, id);
    if (s.source === "payment_plan" && s.sourceRef) {
      const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE id = ?").get(s.sourceRef);
      if (plan) {
        db.prepare(
          `UPDATE customer_payment_plan SET planStartDate = ?, planEndDate = ?, nextDueDate = ?, updatedAt = ? WHERE id = ?`,
        ).run(newPlanStartDate, newExpiryDate, newPlanStartDate, now, plan.id);
      }
    }
    db.prepare(
      `UPDATE subscription_reminder_state SET pendingAutomations = 1, reminder30Count = 0, reminderExpiryDayCount = 0, overdueReminderCount = 0, lastOverdueReminderAt = NULL WHERE subscriptionId = ?`,
    ).run(id);
    db.prepare(
      `INSERT INTO payment_audit (id, entityType, entityId, customerId, action, detailJson, userId, userName, at)
       VALUES (?, 'subscription', ?, ?, 'mark_renewed', ?, ?, ?, ?)`,
    ).run(
      "pa" + makeId(),
      id,
      s.customerId,
      JSON.stringify({ newPlanStartDate, newExpiryDate, recordPayment: !!recordPayment }),
      userId || "system",
      userName || "System",
      now,
    );
    res.json({ ok: true, subscriptionId: id, expiryDate: newExpiryDate });
  });

  app.post("/api/subscriptions/cancel-pending-reminders", (req, res) => {
    const { subscriptionId } = req.body || {};
    if (!subscriptionId) return res.status(400).json({ error: "subscriptionId required" });
    db.prepare("UPDATE subscription_reminder_state SET pendingAutomations = 0 WHERE subscriptionId = ?").run(
      subscriptionId,
    );
    res.json({ ok: true });
  });
}
