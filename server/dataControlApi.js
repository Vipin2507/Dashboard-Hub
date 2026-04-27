/**
 * Data Control Center API — super_admin only. Audit trail in `data_control_audit`.
 */

function serializeVal(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function registerDataControlApi(app, db, helpers = {}) {
  const makeId = helpers.makeId || (() => Math.random().toString(36).slice(2, 12));
  const nextDealId =
    helpers.nextDealId ||
    (() => {
      const y = new Date().getFullYear();
      return `DEAL-${y}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
    });

  function getActor(req) {
    const b = req.body || {};
    const q = req.query || {};
    return {
      actorRole: b.actorRole ?? q.actorRole,
      userId: b.userId ?? q.userId ?? "unknown",
      userName: b.userName ?? q.userName ?? "Unknown",
    };
  }

  function requireSuperAdmin(req, res) {
    const { actorRole } = getActor(req);
    if (actorRole !== "super_admin") {
      res.status(403).json({ error: "Only Super Admin can access Data Control Center" });
      return false;
    }
    return true;
  }

  function auditInsert(action, module, entityType, entityId, fieldKey, oldValue, newValue, detailJson, userId, userName) {
    const id = "dca" + makeId();
    const at = new Date().toISOString();
    db.prepare(
      `INSERT INTO data_control_audit (id, action, module, entityType, entityId, fieldKey, oldValue, newValue, detailJson, userId, userName, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      action,
      module,
      entityType,
      entityId,
      fieldKey ?? null,
      oldValue != null ? serializeVal(oldValue) : null,
      newValue != null ? serializeVal(newValue) : null,
      detailJson != null ? JSON.stringify(detailJson) : null,
      userId,
      userName,
      at,
    );
    return at;
  }

  function lastModifiedFor(entityType, entityId) {
    const row = db
      .prepare(
        `SELECT userName, at FROM data_control_audit WHERE entityType = ? AND entityId = ? AND action IN ('field_edit', 'bulk_edit') ORDER BY at DESC LIMIT 1`
      )
      .get(entityType, entityId);
    return row ? { by: row.userName, at: row.at } : null;
  }

  function latestProposalStatusByCustomer() {
    const rows = db.prepare("SELECT data FROM proposals").all();
    const best = {};
    for (const { data } of rows) {
      try {
        const p = JSON.parse(data);
        const cid = p.customerId;
        if (!cid) continue;
        const t = new Date(p.updatedAt || p.createdAt || 0).getTime();
        if (!best[cid] || t > best[cid].t) best[cid] = { status: p.status || "", t };
      } catch {
        /* skip */
      }
    }
    const out = {};
    for (const k of Object.keys(best)) out[k] = best[k].status;
    return out;
  }

  function userNameById(id) {
    const u = db.prepare("SELECT name FROM users WHERE id = ?").get(id);
    return u?.name ?? "";
  }

  function regionName(id) {
    const r = db.prepare("SELECT name FROM regions WHERE id = ?").get(id);
    return r?.name ?? "";
  }

  const META = {
    customer_management: {
      id: "customer_management",
      label: "Customer Management",
      entityType: "customer",
      fields: [
        { key: "customerName", label: "Customer name", editable: true },
        { key: "contact", label: "Contact", editable: true },
        { key: "email", label: "Email", editable: true },
        { key: "city", label: "City", editable: true },
        { key: "status", label: "Status", editable: true },
        { key: "assignedExecutive", label: "Assigned executive", editable: true },
        { key: "planName", label: "Plan name", editable: true },
        { key: "joinDate", label: "Join date", editable: true },
        { key: "proposalStatus", label: "Proposal status", editable: false },
        { key: "remarks", label: "Remarks", editable: true },
      ],
    },
    deals_section: {
      id: "deals_section",
      label: "Deals Section",
      entityType: "deal",
      fields: [
        { key: "customerName", label: "Customer name", editable: true },
        { key: "dealTitle", label: "Deal title", editable: true },
        { key: "dealValue", label: "Deal value", editable: true },
        { key: "status", label: "Status", editable: true },
        { key: "priority", label: "Priority", editable: true },
        { key: "assignedTo", label: "Assigned to", editable: true },
        { key: "dealSource", label: "Deal source", editable: true },
        { key: "expectedClose", label: "Expected close", editable: true },
        { key: "followUpDate", label: "Follow-up date", editable: true },
        { key: "remarks", label: "Remarks", editable: true },
      ],
    },
    payment_section: {
      id: "payment_section",
      label: "Payment Section",
      entityType: "payment_plan",
      fields: [
        { key: "customerName", label: "Customer name", editable: true },
        { key: "planName", label: "Plan name", editable: true },
        { key: "totalAmount", label: "Total amount", editable: true },
        { key: "amountPaid", label: "Amount paid", editable: true },
        { key: "remaining", label: "Remaining", editable: false },
        { key: "billingCycle", label: "Billing cycle", editable: true },
        { key: "lastPayment", label: "Last payment", editable: false },
        { key: "nextDueDate", label: "Next due date", editable: true },
        { key: "paymentStatus", label: "Payment status", editable: true },
        { key: "receiptNo", label: "Receipt no.", editable: false },
      ],
    },
    inventory: {
      id: "inventory",
      label: "Inventory",
      entityType: "inventory",
      fields: [
        { key: "itemName", label: "Item name", editable: true },
        { key: "category", label: "Category", editable: true },
        { key: "quantity", label: "Quantity", editable: true },
        { key: "unitPrice", label: "Unit price", editable: true },
        { key: "totalValue", label: "Total value", editable: false },
        { key: "status", label: "Status", editable: true },
        { key: "lastUpdated", label: "Last updated", editable: false },
        { key: "supplier", label: "Supplier", editable: true },
        { key: "location", label: "Location", editable: true },
        { key: "remarks", label: "Remarks", editable: true },
      ],
    },
    executives: {
      id: "executives",
      label: "Executives",
      entityType: "user",
      fields: [
        { key: "name", label: "Name", editable: true },
        { key: "email", label: "Email", editable: true },
        { key: "contact", label: "Contact", editable: true },
        { key: "role", label: "Role", editable: true },
        { key: "assignedCustomers", label: "Assigned customers", editable: false },
        { key: "activeDeals", label: "Active deals", editable: false },
        { key: "region", label: "Region", editable: true },
        { key: "joinDate", label: "Join date", editable: true },
        { key: "status", label: "Status", editable: true },
        { key: "remarks", label: "Remarks", editable: true },
      ],
    },
    proposals_section: {
      id: "proposals_section",
      label: "Proposals",
      entityType: "proposal",
      fields: [
        { key: "proposalNumber", label: "Proposal #", editable: false },
        { key: "title", label: "Title", editable: false },
        { key: "customerName", label: "Company name", editable: false },
        { key: "status", label: "Status", editable: false },
        { key: "assignedTo", label: "Assigned to", editable: true },
        { key: "createdAt", label: "Created", editable: false },
        { key: "updatedAt", label: "Updated", editable: false },
      ],
    },
  };

  function buildCustomerRows() {
    const propStatus = latestProposalStatusByCustomer();
    const customers = db.prepare("SELECT * FROM customers ORDER BY createdAt DESC").all();
    return customers.map((c) => {
      const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE customerId = ?").get(c.id);
      const lm = lastModifiedFor("customer", c.id);
      return {
        id: c.id,
        customerName: c.name,
        contact: c.primaryPhone ?? "",
        email: c.email ?? "",
        city: c.city ?? "",
        status: c.status,
        assignedExecutive: c.salesExecutive ?? "",
        planName: plan?.planName ?? "",
        joinDate: c.createdAt?.slice(0, 10) ?? "",
        proposalStatus: propStatus[c.id] ?? "",
        remarks: c.remarks ?? "",
        _lastModified: lm,
      };
    });
  }

  function toDealResponse(row) {
    if (!row) return row;
    return {
      ...row,
      value: Number(row.value) || 0,
      dealStatus: row.dealStatus || "Active",
      stage: row.stage,
      expectedCloseDate: row.expectedCloseDate ?? null,
      nextFollowUpDate: row.nextFollowUpDate ?? null,
      remarks: row.remarks ?? null,
      deletedAt: row.deletedAt ?? null,
    };
  }

  function buildDealRows() {
    let deals = db
      .prepare("SELECT * FROM deals WHERE (deletedAt IS NULL OR deletedAt = '') ORDER BY id DESC")
      .all()
      .map(toDealResponse);
    return deals.map((d) => {
      const cust = db.prepare("SELECT name FROM customers WHERE id = ?").get(d.customerId);
      const lm = lastModifiedFor("deal", d.id);
      return {
        id: d.id,
        customerName: cust?.name ?? "",
        dealTitle: d.name,
        dealValue: d.value,
        status: d.stage,
        priority: d.priority || "Medium",
        assignedTo: d.ownerUserId,
        assignedToName: userNameById(d.ownerUserId),
        dealSource: d.dealSource ?? "",
        expectedClose: d.expectedCloseDate ?? "",
        followUpDate: d.nextFollowUpDate ?? "",
        remarks: d.remarks ?? "",
        _lastModified: lm,
      };
    });
  }

  function buildPaymentRows() {
    const plans = db
      .prepare(
        `SELECT cpp.*, c.name AS customerName FROM customer_payment_plan cpp
         JOIN customers c ON c.id = cpp.customerId ORDER BY cpp.updatedAt DESC`
      )
      .all();
    return plans.map((p) => {
      const payments = db
        .prepare(
          `SELECT * FROM customer_payment_record WHERE planId = ? ORDER BY paymentDate DESC, createdAt DESC`
        )
        .all(p.id);
      const last = payments[0];
      const total = Number(p.totalPlanAmount) || 0;
      const paid = Number(p.amountPaidTotal) || 0;
      const remaining = Math.max(0, total - paid + (Number(p.creditBalance) || 0));
      const lm = lastModifiedFor("payment_plan", p.id);
      return {
        id: p.id,
        customerId: p.customerId,
        customerName: p.customerName,
        planName: p.planName,
        totalAmount: total,
        amountPaid: paid,
        remaining,
        billingCycle: p.billingCycle,
        lastPayment: last?.paymentDate?.slice(0, 10) ?? "",
        nextDueDate: p.nextDueDate?.slice(0, 10) ?? "",
        paymentStatus: p.status,
        receiptNo: last?.receiptNumber ?? "",
        _lastModified: lm,
      };
    });
  }

  function toInventoryResponse(row) {
    return {
      ...row,
      isActive: !!row.isActive,
      stockQty: Number(row.stockQty) || 0,
    };
  }

  function buildInventoryRows() {
    const rows = db.prepare("SELECT * FROM inventory ORDER BY updatedAt DESC").all().map(toInventoryResponse);
    return rows.map((r) => {
      const qty = Number(r.stockQty) || 0;
      const price = Number(r.sellingPrice) || 0;
      const lm = lastModifiedFor("inventory", r.id);
      return {
        id: r.id,
        itemName: r.name,
        category: r.category,
        quantity: qty,
        unitPrice: price,
        totalValue: qty * price,
        status: r.isActive ? "active" : "inactive",
        lastUpdated: r.updatedAt ?? "",
        supplier: r.supplier ?? "",
        location: r.location ?? "",
        remarks: r.notes ?? "",
        _lastModified: lm,
      };
    });
  }

  function buildExecutiveRows() {
    const users = db.prepare("SELECT * FROM users ORDER BY name").all();
    return users.map((u) => {
      const assignedCustomers = db
        .prepare(
          `SELECT COUNT(DISTINCT customerId) AS c FROM deals WHERE ownerUserId = ? AND (deletedAt IS NULL OR deletedAt = '')`
        )
        .get(u.id).c;
      const activeDeals = db
        .prepare(
          `SELECT COUNT(*) AS c FROM deals WHERE ownerUserId = ? AND (deletedAt IS NULL OR deletedAt = '') AND (dealStatus IS NULL OR dealStatus = '' OR dealStatus = 'Active')`
        )
        .get(u.id).c;
      const lm = lastModifiedFor("user", u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        contact: u.phone ?? "",
        role: u.role,
        assignedCustomers,
        activeDeals,
        region: regionName(u.regionId),
        regionId: u.regionId,
        joinDate: u.joinDate ?? "",
        status: u.status,
        remarks: u.remarks ?? "",
        _lastModified: lm,
      };
    });
  }

  function buildProposalRows() {
    const rows = db.prepare("SELECT id, data FROM proposals ORDER BY createdAt DESC").all();
    return rows
      .map((r) => {
        const lm = lastModifiedFor("proposal", r.id);
        try {
          const p = JSON.parse(r.data);
          const cust = p.customerId ? db.prepare("SELECT name FROM customers WHERE id = ?").get(p.customerId) : null;
          return {
            id: p.id || r.id,
            proposalNumber: p.proposalNumber ?? "",
            title: p.title ?? "",
            customerName: p.customerName ?? cust?.name ?? "",
            status: p.status ?? "",
            assignedTo: p.assignedTo ?? "",
            assignedToName: p.assignedToName ?? userNameById(p.assignedTo ?? ""),
            createdAt: (p.createdAt ?? "").slice(0, 10),
            updatedAt: (p.updatedAt ?? "").slice(0, 10),
            _lastModified: lm,
          };
        } catch {
          return {
            id: r.id,
            proposalNumber: "",
            title: "",
            customerName: "",
            status: "",
            assignedTo: "",
            assignedToName: "",
            createdAt: "",
            updatedAt: "",
            _lastModified: lm,
          };
        }
      })
      .filter(Boolean);
  }

  app.get("/api/data-control/meta", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const modules = Object.values(META).map((m) => ({
      id: m.id,
      label: m.label,
      fields: m.fields,
    }));
    const totalFields = modules.reduce((s, m) => s + m.fields.length, 0);
    res.json({
      modules,
      totalModuleCount: modules.length,
      totalFieldCount: totalFields,
    });
  });

  app.get("/api/data-control/rows", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod } = req.query || {};
    if (!mod || !META[mod]) return res.status(400).json({ error: "Invalid module" });
    let rows = [];
    if (mod === "customer_management") rows = buildCustomerRows();
    else if (mod === "deals_section") rows = buildDealRows();
    else if (mod === "payment_section") rows = buildPaymentRows();
    else if (mod === "inventory") rows = buildInventoryRows();
    else if (mod === "executives") rows = buildExecutiveRows();
    else if (mod === "proposals_section") rows = buildProposalRows();
    res.json({ module: mod, rows });
  });

  app.post("/api/data-control/log-view", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod, fieldKeys } = req.body || {};
    const { userId, userName } = getActor(req);
    if (!mod) return res.status(400).json({ error: "module required" });
    auditInsert("view", mod, "view", mod, null, null, null, { fields: fieldKeys ?? [] }, userId, userName);
    res.json({ ok: true });
  });

  app.get("/api/data-control/field-history", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod, recordId, fieldKey } = req.query || {};
    if (!recordId || !fieldKey || !mod) return res.status(400).json({ error: "module, recordId, fieldKey required" });
    const m = META[mod];
    if (!m) return res.status(400).json({ error: "Invalid module" });
    const rows = db
      .prepare(
        `SELECT oldValue, newValue, userName, at FROM data_control_audit
         WHERE module = ? AND entityId = ? AND fieldKey = ? AND action IN ('field_edit', 'bulk_edit')
         ORDER BY at DESC LIMIT 50`
      )
      .all(mod, recordId, fieldKey);
    res.json({ items: rows });
  });

  function applyCustomerPatch(c, fieldKey, raw) {
    const val = raw === undefined || raw === null ? "" : String(raw);
    if (fieldKey === "customerName") c.name = val;
    else if (fieldKey === "contact") c.primaryPhone = val || null;
    else if (fieldKey === "email") c.email = val || null;
    else if (fieldKey === "city") c.city = val || null;
    else if (fieldKey === "status") c.status = val || "active";
    else if (fieldKey === "assignedExecutive") c.salesExecutive = val || null;
    else if (fieldKey === "joinDate") c.createdAt = val ? `${val}T12:00:00.000Z` : c.createdAt;
    else if (fieldKey === "remarks") c.remarks = val || null;
    else if (fieldKey === "planName") {
      const plan = db.prepare("SELECT * FROM customer_payment_plan WHERE customerId = ?").get(c.id);
      if (!plan) throw new Error("No payment plan for customer");
      db.prepare("UPDATE customer_payment_plan SET planName = ?, updatedAt = ? WHERE id = ?").run(val, new Date().toISOString(), plan.id);
      return { skipCustomerUpdate: true };
    } else if (fieldKey === "proposalStatus") throw new Error("Field is read-only");
    else throw new Error("Unknown field");
    return { skipCustomerUpdate: false };
  }

  function persistCustomerRow(c) {
    db.prepare(
      `UPDATE customers SET leadId=@leadId, name=@name, state=@state, gstin=@gstin, regionId=@regionId, city=@city, email=@email, primaryPhone=@primaryPhone, status=@status, createdAt=@createdAt, salesExecutive=@salesExecutive, accountManager=@accountManager, deliveryExecutive=@deliveryExecutive, remarks=@remarks WHERE id=@id`,
    ).run({
      ...c,
      remarks: c.remarks ?? null,
      gstin: c.gstin ?? null,
    });
  }

  /**
   * @param {'field_edit' | 'bulk_edit'} auditAction
   */
  function performPatch(mod, recordId, fieldKey, value, userId, userName, auditAction) {
    const m = META[mod];
    const field = m?.fields.find((f) => f.key === fieldKey);
    if (!m || !field?.editable) return { error: "Invalid field", status: 400 };

    const at = new Date().toISOString();

    if (mod === "customer_management") {
      const c = db.prepare("SELECT * FROM customers WHERE id = ?").get(recordId);
      if (!c) return { error: "Not found", status: 404 };
      const oldVal = buildCustomerRows().find((r) => r.id === recordId)?.[fieldKey];
      const ctx = applyCustomerPatch(c, fieldKey, value);
      if (!ctx.skipCustomerUpdate) persistCustomerRow(c);
      auditInsert(auditAction, mod, "customer", recordId, fieldKey, oldVal, value, auditAction === "bulk_edit" ? { bulk: true } : null, userId, userName);
      return { ok: true, at };
    }

    if (mod === "deals_section") {
      const d = db.prepare("SELECT * FROM deals WHERE id = ?").get(recordId);
      if (!d) return { error: "Not found", status: 404 };
      const rowBefore = buildDealRows().find((r) => r.id === recordId);
      const oldVal = rowBefore?.[fieldKey];
      const next = { ...d };
      if (fieldKey === "customerName") {
        db.prepare("UPDATE customers SET name = ? WHERE id = ?").run(String(value), d.customerId);
      } else if (fieldKey === "dealTitle") next.name = String(value);
      else if (fieldKey === "dealValue") next.value = Number(value) || 0;
      else if (fieldKey === "status") next.stage = String(value);
      else if (fieldKey === "priority") next.priority = String(value);
      else if (fieldKey === "assignedTo") next.ownerUserId = String(value);
      else if (fieldKey === "dealSource") next.dealSource = value ? String(value) : null;
      else if (fieldKey === "expectedClose") next.expectedCloseDate = value ? String(value) : null;
      else if (fieldKey === "followUpDate") next.nextFollowUpDate = value ? String(value) : null;
      else if (fieldKey === "remarks") next.remarks = value ? String(value) : null;
      else return { error: "Unknown field", status: 400 };
      next.updatedAt = at;
      db.prepare(
        `UPDATE deals SET name=?, value=?, stage=?, priority=?, ownerUserId=?, dealSource=?, expectedCloseDate=?, nextFollowUpDate=?, remarks=?, updatedAt=? WHERE id=?`,
      ).run(
        next.name,
        next.value,
        next.stage,
        next.priority,
        next.ownerUserId,
        next.dealSource,
        next.expectedCloseDate,
        next.nextFollowUpDate,
        next.remarks,
        next.updatedAt,
        recordId,
      );
      auditInsert(auditAction, mod, "deal", recordId, fieldKey, oldVal, value, auditAction === "bulk_edit" ? { bulk: true } : null, userId, userName);
      return { ok: true, at };
    }

    if (mod === "payment_section") {
      const p = db.prepare("SELECT * FROM customer_payment_plan WHERE id = ?").get(recordId);
      if (!p) return { error: "Not found", status: 404 };
      const rowBefore = buildPaymentRows().find((r) => r.id === recordId);
      const oldVal = rowBefore?.[fieldKey];
      if (fieldKey === "customerName") db.prepare("UPDATE customers SET name = ? WHERE id = ?").run(String(value), p.customerId);
      else if (fieldKey === "planName") p.planName = String(value);
      else if (fieldKey === "totalAmount") p.totalPlanAmount = Number(value) || 0;
      else if (fieldKey === "amountPaid") p.amountPaidTotal = Number(value) || 0;
      else if (fieldKey === "billingCycle") p.billingCycle = String(value);
      else if (fieldKey === "nextDueDate") p.nextDueDate = String(value);
      else if (fieldKey === "paymentStatus") p.status = String(value);
      else return { error: "Unknown or read-only field", status: 400 };
      p.updatedAt = at;
      db.prepare(
        `UPDATE customer_payment_plan SET planName=?, totalPlanAmount=?, amountPaidTotal=?, billingCycle=?, nextDueDate=?, status=?, updatedAt=? WHERE id=?`,
      ).run(p.planName, p.totalPlanAmount, p.amountPaidTotal, p.billingCycle, p.nextDueDate, p.status, p.updatedAt, recordId);
      auditInsert(auditAction, mod, "payment_plan", recordId, fieldKey, oldVal, value, auditAction === "bulk_edit" ? { bulk: true } : null, userId, userName);
      return { ok: true, at };
    }

    if (mod === "inventory") {
      const inv = db.prepare("SELECT * FROM inventory WHERE id = ?").get(recordId);
      if (!inv) return { error: "Not found", status: 404 };
      const rowBefore = buildInventoryRows().find((r) => r.id === recordId);
      const oldVal = rowBefore?.[fieldKey];
      const next = { ...inv, stockQty: Number(inv.stockQty) || 0 };
      if (fieldKey === "itemName") next.name = String(value);
      else if (fieldKey === "category") next.category = String(value);
      else if (fieldKey === "quantity") next.stockQty = Number(value) || 0;
      else if (fieldKey === "unitPrice") next.sellingPrice = Number(value) || 0;
      else if (fieldKey === "status") next.isActive = String(value).toLowerCase() === "active" ? 1 : 0;
      else if (fieldKey === "supplier") next.supplier = value ? String(value) : null;
      else if (fieldKey === "location") next.location = value ? String(value) : null;
      else if (fieldKey === "remarks") next.notes = value ? String(value) : null;
      else return { error: "Unknown or read-only field", status: 400 };
      next.updatedAt = at;
      db.prepare(
        `UPDATE inventory SET name=?, category=?, stockQty=?, sellingPrice=?, isActive=?, supplier=?, location=?, notes=?, updatedAt=? WHERE id=?`,
      ).run(next.name, next.category, next.stockQty, next.sellingPrice, next.isActive, next.supplier, next.location, next.notes, next.updatedAt, recordId);
      auditInsert(auditAction, mod, "inventory", recordId, fieldKey, oldVal, value, auditAction === "bulk_edit" ? { bulk: true } : null, userId, userName);
      return { ok: true, at };
    }

    if (mod === "executives") {
      const u = db.prepare("SELECT * FROM users WHERE id = ?").get(recordId);
      if (!u) return { error: "Not found", status: 404 };
      const rowBefore = buildExecutiveRows().find((r) => r.id === recordId);
      const oldVal = rowBefore?.[fieldKey];
      const next = { ...u };
      if (fieldKey === "name") next.name = String(value);
      else if (fieldKey === "email") next.email = String(value);
      else if (fieldKey === "contact") next.phone = value ? String(value) : null;
      else if (fieldKey === "role") next.role = String(value);
      else if (fieldKey === "region") {
        const r = db.prepare("SELECT id FROM regions WHERE name = ? COLLATE NOCASE").get(String(value));
        if (!r) return { error: "Region not found; use exact region name", status: 400 };
        next.regionId = r.id;
      } else if (fieldKey === "joinDate") next.joinDate = value ? String(value) : null;
      else if (fieldKey === "status") next.status = String(value);
      else if (fieldKey === "remarks") next.remarks = value ? String(value) : null;
      else return { error: "Unknown or read-only field", status: 400 };
      db.prepare(`UPDATE users SET name=?, email=?, phone=?, role=?, regionId=?, joinDate=?, status=?, remarks=? WHERE id=?`).run(
        next.name,
        next.email,
        next.phone ?? null,
        next.role,
        next.regionId,
        next.joinDate ?? null,
        next.status,
        next.remarks ?? null,
        recordId,
      );
      auditInsert(auditAction, mod, "user", recordId, fieldKey, oldVal, value, auditAction === "bulk_edit" ? { bulk: true } : null, userId, userName);
      return { ok: true, at };
    }

    if (mod === "proposals_section") {
      const row = db.prepare("SELECT * FROM proposals WHERE id = ?").get(recordId);
      if (!row) return { error: "Not found", status: 404 };
      const before = buildProposalRows().find((r) => r.id === recordId);
      const oldVal = before?.[fieldKey];
      if (fieldKey !== "assignedTo") return { error: "Only assignedTo is editable here", status: 400 };
      const newUserId = String(value || "").trim();
      const u = db.prepare("SELECT * FROM users WHERE id = ?").get(newUserId);
      if (!u) return { error: "User not found", status: 400 };
      const now = new Date().toISOString();
      const data = JSON.parse(row.data);
      data.assignedTo = newUserId;
      data.assignedToName = u.name;
      data.teamId = u.teamId;
      data.regionId = u.regionId;
      data.updatedAt = now;
      db.prepare(
        `UPDATE proposals SET assignedTo=?, updatedAt=?, data=? WHERE id=?`,
      ).run(newUserId, now, JSON.stringify(data), recordId);
      auditInsert(auditAction, mod, "proposal", recordId, fieldKey, oldVal, newUserId, auditAction === "bulk_edit" ? { bulk: true } : null, userId, userName);
      return { ok: true, at: now };
    }

    return { error: "Unsupported module", status: 400 };
  }

  app.patch("/api/data-control/cell", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod, recordId, fieldKey, value } = req.body || {};
    const { userId, userName } = getActor(req);
    if (!mod || !recordId || !fieldKey) return res.status(400).json({ error: "module, recordId, fieldKey required" });
    try {
      const result = performPatch(mod, recordId, fieldKey, value, userId, userName, "field_edit");
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.json({ ok: true, at: result.at });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Update failed" });
    }
  });

  app.post("/api/data-control/bulk", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod, fieldKey, value, recordIds } = req.body || {};
    const { userId, userName } = getActor(req);
    if (!mod || !fieldKey || value === undefined || !Array.isArray(recordIds)) {
      return res.status(400).json({ error: "module, fieldKey, value, recordIds required" });
    }
    const m = META[mod];
    if (!m) return res.status(400).json({ error: "Invalid module" });
    const field = m.fields.find((f) => f.key === fieldKey);
    if (!field?.editable) return res.status(400).json({ error: "Field is not editable" });

    const at = new Date().toISOString();
    let updated = 0;
    const errors = [];
    for (const rid of recordIds) {
      const result = performPatch(mod, rid, fieldKey, value, userId, userName, "bulk_edit");
      if (result.ok) updated++;
      else errors.push({ id: rid, error: result.error });
    }
    res.json({ ok: true, updated, at, errors: errors.length ? errors : undefined });
  });

  /**
   * Apply multiple field updates to many records (one round of patches per field per row).
   * Body: { module, recordIds, fields: { fieldKey: value, ... } }
   */
  app.post("/api/data-control/bulk-patch", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod, recordIds, fields } = req.body || {};
    const { userId, userName } = getActor(req);
    if (!mod || !Array.isArray(recordIds) || !fields || typeof fields !== "object") {
      return res.status(400).json({ error: "module, recordIds[], and fields{} required" });
    }
    const m = META[mod];
    if (!m) return res.status(400).json({ error: "Invalid module" });
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return res.status(400).json({ error: "fields must not be empty" });
    for (const [fk] of entries) {
      const field = m.fields.find((f) => f.key === fk);
      if (!field?.editable) return res.status(400).json({ error: `Field is not editable: ${fk}` });
    }
    let updatedRows = 0;
    const errors = [];
    for (const rid of recordIds) {
      let rowOk = true;
      for (const [fieldKey, value] of entries) {
        const result = performPatch(mod, rid, fieldKey, value, userId, userName, "bulk_edit");
        if (!result.ok) {
          errors.push({ id: rid, fieldKey, error: result.error });
          rowOk = false;
          break;
        }
      }
      if (rowOk) updatedRows++;
    }
    res.json({
      ok: true,
      updated: updatedRows,
      at: new Date().toISOString(),
      errors: errors.length ? errors : undefined,
    });
  });

  function regionIdExists(rid) {
    return !!db.prepare("SELECT id FROM regions WHERE id = ?").get(rid);
  }

  function importCustomers(rows, userId, userName) {
    const insert = db.prepare(`
      INSERT INTO customers (id, leadId, name, state, gstin, regionId, city, email, primaryPhone, status, createdAt, salesExecutive, accountManager, deliveryExecutive, remarks, tags)
      VALUES (@id, @leadId, @name, @state, @gstin, @regionId, @city, @email, @primaryPhone, @status, @createdAt, @salesExecutive, @accountManager, @deliveryExecutive, @remarks, @tags)
    `);
    let created = 0;
    const rowErrors = [];
    const at = new Date().toISOString();
    rows.forEach((raw, index) => {
      try {
        const customerName = raw.customerName != null ? String(raw.customerName).trim() : "";
        const regionId = raw.regionId != null ? String(raw.regionId).trim() : "";
        if (!customerName || !regionId) throw new Error("customerName and regionId are required");
        if (!regionIdExists(regionId)) throw new Error("regionId not found");
        const id = "c" + makeId();
        const join = raw.joinDate != null && String(raw.joinDate).trim() ? String(raw.joinDate).trim() : "";
        const createdAt = join ? `${join}T12:00:00.000Z` : at;
        const row = {
          id,
          leadId: raw.leadId != null && String(raw.leadId).trim() ? String(raw.leadId).trim() : `L-${makeId()}`,
          name: customerName,
          state: raw.state != null && String(raw.state).trim() ? String(raw.state).trim() : "Unknown",
          gstin: raw.gstin != null && String(raw.gstin).trim() ? String(raw.gstin).trim() : null,
          regionId,
          city: raw.city != null && String(raw.city).trim() ? String(raw.city).trim() : null,
          email: raw.email != null && String(raw.email).trim() ? String(raw.email).trim() : null,
          primaryPhone: raw.contact != null && String(raw.contact).trim() ? String(raw.contact).trim() : null,
          status: raw.status != null && String(raw.status).trim() ? String(raw.status).trim() : "active",
          createdAt,
          salesExecutive:
            raw.assignedExecutive != null && String(raw.assignedExecutive).trim()
              ? String(raw.assignedExecutive).trim()
              : null,
          accountManager: null,
          deliveryExecutive: null,
          remarks: raw.remarks != null && String(raw.remarks).trim() ? String(raw.remarks).trim() : null,
          tags: "[]",
        };
        insert.run(row);
        auditInsert("bulk_import", "customer_management", "customer", id, null, null, null, { index }, userId, userName);
        created++;
      } catch (e) {
        rowErrors.push({ index, error: e.message || "failed" });
      }
    });
    return { created, errors: rowErrors.length ? rowErrors : undefined };
  }

  function importInventoryRows(rows, userId, userName) {
    const insert = db.prepare(`
      INSERT INTO inventory (id, name, description, itemType, sku, hsnSacCode, category, unitOfMeasure, costPrice, sellingPrice, taxRate, isActive, createdAt, updatedAt, createdBy, notes, stockQty, supplier, location)
      VALUES (@id, @name, @description, @itemType, @sku, @hsnSacCode, @category, @unitOfMeasure, @costPrice, @sellingPrice, @taxRate, @isActive, @createdAt, @updatedAt, @createdBy, @notes, @stockQty, @supplier, @location)
    `);
    let created = 0;
    const rowErrors = [];
    const now = new Date().toISOString();
    rows.forEach((raw, index) => {
      try {
        const name = raw.itemName != null ? String(raw.itemName).trim() : "";
        const codeRaw = raw.itemCode != null ? raw.itemCode : raw.sku;
        const sku = codeRaw != null ? String(codeRaw).trim() : "";
        const category = raw.category != null ? String(raw.category).trim() : "";
        const unitOfMeasure = raw.unitOfMeasure != null && String(raw.unitOfMeasure).trim() ? String(raw.unitOfMeasure).trim() : "unit";
        if (!name || !sku || !category) throw new Error("itemName, item code, and category are required");
        if (db.prepare("SELECT id FROM inventory WHERE UPPER(sku) = UPPER(?)").get(sku)) throw new Error("duplicate item code");
        const id = "inv" + makeId();
        const statusStr = raw.status != null ? String(raw.status).toLowerCase() : "active";
        const row = {
          id,
          name,
          description: raw.description != null && String(raw.description).trim() ? String(raw.description).trim() : null,
          itemType: "product",
          sku,
          hsnSacCode: null,
          category,
          unitOfMeasure,
          costPrice: Number(raw.costPrice) || 0,
          sellingPrice: Number(raw.unitPrice) || 0,
          taxRate: Number(raw.taxRate) || 18,
          isActive: statusStr === "inactive" ? 0 : 1,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          notes: raw.remarks != null && String(raw.remarks).trim() ? String(raw.remarks).trim() : null,
          stockQty: Number(raw.quantity) || 0,
          supplier: raw.supplier != null && String(raw.supplier).trim() ? String(raw.supplier).trim() : null,
          location: raw.location != null && String(raw.location).trim() ? String(raw.location).trim() : null,
        };
        insert.run(row);
        auditInsert("bulk_import", "inventory", "inventory", id, null, null, null, { index }, userId, userName);
        created++;
      } catch (e) {
        rowErrors.push({ index, error: e.message || "failed" });
      }
    });
    return { created, errors: rowErrors.length ? rowErrors : undefined };
  }

  function importDeals(rows, userId, userName) {
    const insert = db.prepare(`
      INSERT INTO deals (
        id, name, customerId, ownerUserId, teamId, regionId, stage, value, locked, proposalId,
        dealStatus, dealSource, expectedCloseDate, priority, lastActivityAt, nextFollowUpDate, lossReason,
        contactPhone, remarks, createdByUserId, createdByName, createdAt, updatedAt
      ) VALUES (
        @id, @name, @customerId, @ownerUserId, @teamId, @regionId, @stage, @value, @locked, @proposalId,
        @dealStatus, @dealSource, @expectedCloseDate, @priority, @lastActivityAt, @nextFollowUpDate, @lossReason,
        @contactPhone, @remarks, @createdByUserId, @createdByName, @createdAt, @updatedAt
      )
    `);
    let created = 0;
    const rowErrors = [];
    const now = new Date().toISOString();
    rows.forEach((raw, index) => {
      try {
        const customerId = raw.customerId != null ? String(raw.customerId).trim() : "";
        const ownerUserId = raw.ownerUserId != null ? String(raw.ownerUserId).trim() : "";
        const dealTitle = raw.dealTitle != null ? String(raw.dealTitle).trim() : "";
        if (!customerId || !ownerUserId || !dealTitle) throw new Error("customerId, ownerUserId, and dealTitle are required");
        const cust = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
        if (!cust) throw new Error("customer not found");
        const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(ownerUserId);
        if (!owner) throw new Error("owner user not found");
        const val = Number(raw.dealValue);
        if (!Number.isFinite(val) || val <= 0) throw new Error("dealValue must be a positive number");
        const stage = raw.status != null && String(raw.status).trim() ? String(raw.status).trim() : "Qualification";
        const id = nextDealId();
        const deal = {
          id,
          name: dealTitle,
          customerId,
          ownerUserId,
          teamId: owner.teamId,
          regionId: cust.regionId,
          stage,
          value: val,
          locked: 0,
          proposalId: null,
          dealStatus: "Active",
          dealSource: raw.dealSource != null && String(raw.dealSource).trim() ? String(raw.dealSource).trim() : null,
          expectedCloseDate:
            raw.expectedClose != null && String(raw.expectedClose).trim() ? String(raw.expectedClose).trim() : null,
          priority: raw.priority != null && String(raw.priority).trim() ? String(raw.priority).trim() : "Medium",
          lastActivityAt: now,
          nextFollowUpDate:
            raw.followUpDate != null && String(raw.followUpDate).trim() ? String(raw.followUpDate).trim() : null,
          lossReason: null,
          contactPhone: null,
          remarks: raw.remarks != null && String(raw.remarks).trim() ? String(raw.remarks).trim() : null,
          createdByUserId: userId,
          createdByName: userName,
          createdAt: now,
          updatedAt: now,
        };
        insert.run(deal);
        auditInsert("bulk_import", "deals_section", "deal", id, null, null, null, { index }, userId, userName);
        created++;
      } catch (e) {
        rowErrors.push({ index, error: e.message || "failed" });
      }
    });
    return { created, errors: rowErrors.length ? rowErrors : undefined };
  }

  /**
   * Super-admin bulk create. Supported modules: customer_management, inventory, deals_section.
   * Rows use the same keys as Data Control fields plus regionId (customers), sku (inventory), etc.
   */
  app.post("/api/data-control/bulk-import", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { module: mod, rows } = req.body || {};
    const { userId, userName } = getActor(req);
    if (!mod || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "module and non-empty rows[] required" });
    }
    if (rows.length > 5000) return res.status(400).json({ error: "Maximum 5000 rows per import" });
    let result;
    if (mod === "customer_management") result = importCustomers(rows, userId, userName);
    else if (mod === "inventory") result = importInventoryRows(rows, userId, userName);
    else if (mod === "deals_section") result = importDeals(rows, userId, userName);
    else {
      return res.status(400).json({
        error: "Bulk import for this module is not supported here. Use customer_management, inventory, or deals_section.",
      });
    }
    res.json({ ok: true, ...result });
  });
}
