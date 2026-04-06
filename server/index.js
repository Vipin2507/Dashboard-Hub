import express from "express";
import cors from "cors";
import { db, SQLITE_PATH } from "./db.js";
import { registerPaymentsApi } from "./paymentsApi.js";
import { registerDataControlApi } from "./dataControlApi.js";
import { registerSubscriptionRenewalApi } from "./subscriptionRenewalApi.js";
import { registerIntegrationProxies } from "./integrationsProxy.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
registerIntegrationProxies(app, { db });

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function nextDealId() {
  return db.transaction(() => {
    const year = new Date().getFullYear();
    db.prepare("INSERT INTO deal_sequence (year, lastSeq) VALUES (?, 0) ON CONFLICT(year) DO NOTHING").run(year);
    db.prepare("UPDATE deal_sequence SET lastSeq = lastSeq + 1 WHERE year = ?").run(year);
    const row = db.prepare("SELECT lastSeq FROM deal_sequence WHERE year = ?").get(year);
    return `DEAL-${year}-${String(row.lastSeq).padStart(4, "0")}`;
  })();
}

function isSuperAdminRole(role) {
  return role === "super_admin";
}

function serializeDealField(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return String(v);
}

function logDealFieldChanges(dbConn, dealId, before, after, userId, userName) {
  const keys = [
    "name",
    "customerId",
    "ownerUserId",
    "teamId",
    "regionId",
    "stage",
    "value",
    "locked",
    "proposalId",
    "dealSource",
    "expectedCloseDate",
    "priority",
    "nextFollowUpDate",
    "lossReason",
    "contactPhone",
    "remarks",
  ];
  for (const field of keys) {
    const oldVal = serializeDealField(before[field]);
    const newVal = serializeDealField(after[field]);
    if (oldVal !== newVal) {
      logDealAudit(dbConn, dealId, "deal_field_changed", { field, oldValue: oldVal, newValue: newVal }, userId, userName);
    }
  }
}

function toInventoryResponse(row) {
  return {
    ...row,
    isActive: !!row.isActive,
    stockQty: row.stockQty != null ? Number(row.stockQty) : 0,
    supplier: row.supplier ?? null,
    location: row.location ?? null,
  };
}

function toProposalRow(proposal) {
  return {
    id: proposal.id,
    proposalNumber: proposal.proposalNumber,
    title: proposal.title,
    customerId: proposal.customerId,
    assignedTo: proposal.assignedTo,
    status: proposal.status,
    grandTotal: Number(proposal.grandTotal) || 0,
    finalQuoteValue:
      proposal.finalQuoteValue == null ? null : Number(proposal.finalQuoteValue),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    data: JSON.stringify(proposal),
  };
}

function toDealResponse(row) {
  if (!row) return row;
  return {
    ...row,
    value: Number(row.value) || 0,
    locked: !!row.locked,
    dealStatus: row.dealStatus || "Active",
    dealSource: row.dealSource ?? null,
    expectedCloseDate: row.expectedCloseDate ?? null,
    priority: row.priority || "Medium",
    lastActivityAt: row.lastActivityAt ?? null,
    nextFollowUpDate: row.nextFollowUpDate ?? null,
    lossReason: row.lossReason ?? null,
    contactPhone: row.contactPhone ?? null,
    remarks: row.remarks ?? null,
    createdByUserId: row.createdByUserId ?? null,
    createdByName: row.createdByName ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    deletedByUserId: row.deletedByUserId ?? null,
    deletedByName: row.deletedByName ?? null,
  };
}

function logDealAudit(db, dealId, action, detail, userId, userName) {
  db.prepare(
    `INSERT INTO deal_audit (id, dealId, action, detailJson, userId, userName, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "da" + makeId(),
    dealId,
    action,
    JSON.stringify(detail ?? {}),
    userId || "system",
    userName || "System",
    new Date().toISOString(),
  );
}

function parseJsonSafe(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: "sqlite", dbPath: SQLITE_PATH });
});

app.get("/api/regions", (_req, res) => {
  res.json(db.prepare("SELECT * FROM regions ORDER BY name").all());
});

app.post("/api/regions", (req, res) => {
  const { id, name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const region = { id: id || "r" + makeId(), name };
  db.prepare("INSERT INTO regions (id, name) VALUES (@id, @name)").run(region);
  res.status(201).json(region);
});

app.put("/api/regions/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM regions WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = { ...existing, ...(req.body || {}), id: req.params.id };
  db.prepare("UPDATE regions SET name = ? WHERE id = ?").run(updated.name, updated.id);
  res.json(updated);
});

app.delete("/api/regions/:id", (req, res) => {
  const info = db.prepare("DELETE FROM regions WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/teams", (_req, res) => {
  res.json(db.prepare("SELECT * FROM teams ORDER BY name").all());
});

app.post("/api/teams", (req, res) => {
  const { id, name, regionId } = req.body || {};
  if (!name || !regionId) return res.status(400).json({ error: "name and regionId are required" });
  const team = { id: id || "t" + makeId(), name, regionId };
  db.prepare("INSERT INTO teams (id, name, regionId) VALUES (@id, @name, @regionId)").run(team);
  res.status(201).json(team);
});

app.put("/api/teams/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = { ...existing, ...(req.body || {}), id: req.params.id };
  db.prepare("UPDATE teams SET name = ?, regionId = ? WHERE id = ?").run(
    updated.name,
    updated.regionId,
    updated.id,
  );
  res.json(updated);
});

app.delete("/api/teams/:id", (req, res) => {
  const info = db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/users", (_req, res) => {
  res.json(db.prepare("SELECT * FROM users ORDER BY name").all());
});

app.post("/api/users", (req, res) => {
  const { id, name, email, password, role, teamId, regionId, status } = req.body || {};
  if (!name || !email || !password || !role || !teamId || !regionId) {
    return res.status(400).json({ error: "name, email, password, role, teamId, regionId are required" });
  }
  const user = { id: id || "u" + makeId(), name, email, password, role, teamId, regionId, status: status || "active" };
  db.prepare(
    "INSERT INTO users (id, name, email, password, role, teamId, regionId, status) VALUES (@id, @name, @email, @password, @role, @teamId, @regionId, @status)"
  ).run(user);
  res.status(201).json(user);
});

app.put("/api/users/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = { ...existing, ...(req.body || {}), id: req.params.id };
  db.prepare(
    "UPDATE users SET name=@name, email=@email, password=@password, role=@role, teamId=@teamId, regionId=@regionId, status=@status, phone=@phone, joinDate=@joinDate, remarks=@remarks WHERE id=@id"
  ).run({
    ...updated,
    phone: updated.phone ?? null,
    joinDate: updated.joinDate ?? null,
    remarks: updated.remarks ?? null,
  });
  res.json(updated);
});

app.delete("/api/users/:id", (req, res) => {
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/notifications", (_req, res) => {
  const rows = db.prepare("SELECT * FROM notifications ORDER BY at DESC").all();
  res.json(rows);
});

app.post("/api/notifications", (req, res) => {
  const { id, type, to, subject, entityId, at } = req.body || {};
  if (!type || !to || !subject || !entityId || !at) {
    return res.status(400).json({ error: "type, to, subject, entityId, at are required" });
  }
  const notification = { id: id || "n" + makeId(), type, to, subject, entityId, at };
  db.prepare(
    'INSERT INTO notifications (id, type, "to", subject, entityId, at) VALUES (@id, @type, @to, @subject, @entityId, @at)'
  ).run(notification);
  res.status(201).json(notification);
});

app.get("/api/customers", (_req, res) => {
  const rows = db.prepare("SELECT * FROM customers ORDER BY createdAt DESC").all();
  res.json(rows);
});

app.get("/api/customers/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

app.post("/api/customers", (req, res) => {
  const { name, state, gstin, regionId, leadId, city, email, primaryPhone, status, salesExecutive, accountManager, deliveryExecutive, remarks } = req.body || {};
  if (!name || !regionId) return res.status(400).json({ error: "name and regionId are required" });

  const customer = {
    id: req.body?.id || "c" + makeId(),
    leadId: leadId || `L-${makeId()}`,
    name,
    state: state || "Unknown",
    gstin: gstin ?? null,
    regionId,
    city: city || null,
    email: email || null,
    primaryPhone: primaryPhone || null,
    status: status || "active",
    createdAt: new Date().toISOString(),
    salesExecutive: salesExecutive || null,
    accountManager: accountManager || null,
    deliveryExecutive: deliveryExecutive || null,
    remarks: remarks ?? null,
  };

  db.prepare(`
    INSERT INTO customers (id, leadId, name, state, gstin, regionId, city, email, primaryPhone, status, createdAt, salesExecutive, accountManager, deliveryExecutive, remarks)
    VALUES (@id, @leadId, @name, @state, @gstin, @regionId, @city, @email, @primaryPhone, @status, @createdAt, @salesExecutive, @accountManager, @deliveryExecutive, @remarks)
  `).run(customer);

  res.status(201).json(customer);
});

app.post("/api/customers/bulk", (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, leadId, name, state, gstin, regionId, city, email, primaryPhone, status, createdAt, salesExecutive, accountManager, deliveryExecutive)
    VALUES (@id, @leadId, @name, @state, @gstin, @regionId, @city, @email, @primaryPhone, @status, @createdAt, @salesExecutive, @accountManager, @deliveryExecutive)
  `);

  const created = items.filter((it) => it && it.name && it.regionId).map((it) => ({
    id: it.id || "c" + makeId(),
      leadId: it.leadId || `L-${makeId()}`,
      name: it.name,
      state: it.state || "Unknown",
      gstin: it.gstin ?? null,
      regionId: it.regionId,
      city: it.city || null,
      email: it.email || null,
      primaryPhone: it.primaryPhone || null,
      status: it.status || "active",
      createdAt: new Date().toISOString(),
      salesExecutive: it.salesExecutive || null,
      accountManager: it.accountManager || null,
      deliveryExecutive: it.deliveryExecutive || null,
    }));

  db.transaction((rows) => rows.forEach((r) => insertCustomer.run(r)))(created);
  res.status(201).json(created);
});

app.get("/api/proposals", (req, res) => {
  const rows = db
    .prepare("SELECT data FROM proposals ORDER BY createdAt DESC")
    .all();
  let items = rows
    .map((r) => {
      try {
        return JSON.parse(r.data);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const { customerId, status } = req.query || {};
  if (customerId) {
    items = items.filter((p) => p && p.customerId === customerId);
  }
  if (status) {
    items = items.filter((p) => p && p.status === status);
  }
  res.json(items);
});

app.post("/api/proposals", (req, res) => {
  const proposal = req.body || {};
  if (!proposal.id || !proposal.proposalNumber || !proposal.title || !proposal.customerId) {
    return res
      .status(400)
      .json({ error: "id, proposalNumber, title and customerId are required" });
  }
  const row = toProposalRow(proposal);
  db.prepare(`
    INSERT INTO proposals (id, proposalNumber, title, customerId, assignedTo, status, grandTotal, finalQuoteValue, createdAt, updatedAt, data)
    VALUES (@id, @proposalNumber, @title, @customerId, @assignedTo, @status, @grandTotal, @finalQuoteValue, @createdAt, @updatedAt, @data)
  `).run(row);
  res.status(201).json(proposal);
});

app.put("/api/proposals/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM proposals WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const proposal = req.body || {};
  if (!proposal.id) proposal.id = req.params.id;
  const row = toProposalRow(proposal);
  db.prepare(`
    UPDATE proposals SET
      proposalNumber=@proposalNumber, title=@title, customerId=@customerId, assignedTo=@assignedTo,
      status=@status, grandTotal=@grandTotal, finalQuoteValue=@finalQuoteValue, createdAt=@createdAt,
      updatedAt=@updatedAt, data=@data
    WHERE id=@id
  `).run(row);
  res.json(proposal);
});

app.delete("/api/proposals/:id", (req, res) => {
  const info = db.prepare("DELETE FROM proposals WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/deals", (req, res) => {
  const includeDeleted = req.query.includeDeleted === "1" && req.query.actorRole === "super_admin";
  let rows = (
    includeDeleted
      ? db.prepare("SELECT * FROM deals ORDER BY id DESC").all()
      : db
          .prepare("SELECT * FROM deals WHERE (deletedAt IS NULL OR deletedAt = '') ORDER BY id DESC")
          .all()
  ).map(toDealResponse);
  const { customerId, stage } = req.query || {};
  if (customerId) {
    rows = rows.filter((d) => d.customerId === customerId);
  }
  if (stage) {
    const sl = String(stage).toLowerCase();
    rows = rows.filter((d) => String(d.stage).toLowerCase() === sl);
  }
  res.json(rows);
});

app.post("/api/deals", (req, res) => {
  const {
    name,
    customerId,
    ownerUserId,
    teamId,
    regionId,
    stage,
    value,
    locked,
    proposalId,
    dealStatus,
    dealSource,
    expectedCloseDate,
    priority,
    nextFollowUpDate,
    lossReason,
    contactPhone,
    remarks,
    changedByUserId,
    changedByName,
    createdByUserId,
    createdByName,
    actorRole,
  } = req.body || {};
  if (!name || !customerId || !ownerUserId || !teamId || !regionId || !stage) {
    return res
      .status(400)
      .json({ error: "name, customerId, ownerUserId, teamId, regionId and stage are required" });
  }
  const numVal = Number(value);
  if (!Number.isFinite(numVal) || numVal <= 0) {
    return res.status(400).json({ error: "value must be a positive number" });
  }
  const ds = dealStatus || "Active";
  if (ds === "Closed/Lost" && !isSuperAdminRole(actorRole)) {
    return res.status(403).json({ error: "Only super admin can create a deal with status Closed/Lost" });
  }
  const now = new Date().toISOString();
  const creatorId = createdByUserId || changedByUserId;
  const creatorName = createdByName || changedByName;
  const deal = {
    id: nextDealId(),
    name,
    customerId,
    ownerUserId,
    teamId,
    regionId,
    stage,
    value: Number(value) || 0,
    locked: locked ? 1 : 0,
    proposalId: proposalId || null,
    dealStatus: ds,
    dealSource: dealSource || null,
    expectedCloseDate: expectedCloseDate || null,
    priority: priority || "Medium",
    lastActivityAt: now,
    nextFollowUpDate: nextFollowUpDate || null,
    lossReason: lossReason || null,
    contactPhone: contactPhone != null && String(contactPhone).trim() ? String(contactPhone).trim() : null,
    remarks: remarks != null && String(remarks).trim() ? String(remarks).trim() : null,
    createdByUserId: creatorId || null,
    createdByName: creatorName || null,
    createdAt: now,
    updatedAt: now,
  };
  if (deal.dealStatus === "Closed/Lost" && (!deal.lossReason || !String(deal.lossReason).trim())) {
    return res.status(400).json({ error: "lossReason is required when status is Closed/Lost" });
  }
  db.prepare(`
    INSERT INTO deals (
      id, name, customerId, ownerUserId, teamId, regionId, stage, value, locked, proposalId,
      dealStatus, dealSource, expectedCloseDate, priority, lastActivityAt, nextFollowUpDate, lossReason,
      contactPhone, remarks, createdByUserId, createdByName, createdAt, updatedAt
    ) VALUES (
      @id, @name, @customerId, @ownerUserId, @teamId, @regionId, @stage, @value, @locked, @proposalId,
      @dealStatus, @dealSource, @expectedCloseDate, @priority, @lastActivityAt, @nextFollowUpDate, @lossReason,
      @contactPhone, @remarks, @createdByUserId, @createdByName, @createdAt, @updatedAt
    )
  `).run(deal);
  logDealAudit(
    db,
    deal.id,
    "deal_created",
    {
      dealId: deal.id,
      dealStatus: deal.dealStatus,
      name: deal.name,
      value: deal.value,
      customerId: deal.customerId,
      ownerUserId: deal.ownerUserId,
    },
    changedByUserId,
    changedByName,
  );
  res.status(201).json(toDealResponse(deal));
});

app.put("/api/deals/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.deletedAt) return res.status(410).json({ error: "Deal has been deleted" });

  const { actorRole, changedByUserId, changedByName } = req.body || {};
  if (!isSuperAdminRole(actorRole)) {
    return res.status(403).json({ error: "Only super admin can update deals" });
  }

  const {
    name,
    customerId,
    ownerUserId,
    teamId,
    regionId,
    stage,
    value,
    locked,
    proposalId,
    dealStatus,
    dealSource,
    expectedCloseDate,
    priority,
    nextFollowUpDate,
    lossReason,
    contactPhone,
    remarks,
  } = req.body || {};

  const prevStatus = existing.dealStatus || "Active";
  const mergedStatus = dealStatus !== undefined ? dealStatus : prevStatus;
  const mergedLossReason =
    mergedStatus === "Closed/Lost"
      ? lossReason !== undefined
        ? lossReason
        : existing.lossReason
      : null;

  if (mergedStatus === "Closed/Lost" && (!mergedLossReason || !String(mergedLossReason).trim())) {
    return res.status(400).json({ error: "lossReason is required when status is Closed/Lost" });
  }

  const now = new Date().toISOString();
  const beforeSnapshot = { ...existing };
  const deal = {
    ...existing,
    ...(name !== undefined && { name }),
    ...(customerId !== undefined && { customerId }),
    ...(ownerUserId !== undefined && { ownerUserId }),
    ...(teamId !== undefined && { teamId }),
    ...(regionId !== undefined && { regionId }),
    ...(stage !== undefined && { stage }),
    ...(value !== undefined && { value: Number(value) || 0 }),
    ...(locked !== undefined && { locked: locked ? 1 : 0 }),
    ...(proposalId !== undefined && { proposalId: proposalId || null }),
    dealStatus: mergedStatus,
    ...(dealSource !== undefined && { dealSource: dealSource || null }),
    ...(expectedCloseDate !== undefined && { expectedCloseDate: expectedCloseDate || null }),
    ...(priority !== undefined && { priority: priority || "Medium" }),
    ...(nextFollowUpDate !== undefined && { nextFollowUpDate: nextFollowUpDate || null }),
    lossReason: mergedLossReason,
    lastActivityAt: now,
    updatedAt: now,
    ...(contactPhone !== undefined && {
      contactPhone: contactPhone != null && String(contactPhone).trim() ? String(contactPhone).trim() : null,
    }),
    ...(remarks !== undefined && {
      remarks: remarks != null && String(remarks).trim() ? String(remarks).trim() : null,
    }),
  };

  db.prepare(`
    UPDATE deals SET
      name=@name, customerId=@customerId, ownerUserId=@ownerUserId, teamId=@teamId, regionId=@regionId,
      stage=@stage, value=@value, locked=@locked, proposalId=@proposalId,
      dealStatus=@dealStatus, dealSource=@dealSource, expectedCloseDate=@expectedCloseDate,
      priority=@priority, lastActivityAt=@lastActivityAt, nextFollowUpDate=@nextFollowUpDate, lossReason=@lossReason,
      contactPhone=@contactPhone, remarks=@remarks, updatedAt=@updatedAt
    WHERE id=@id
  `).run({
    ...deal,
    dealStatus: deal.dealStatus || "Active",
    priority: deal.priority || "Medium",
  });

  if (mergedStatus !== prevStatus) {
    logDealAudit(
      db,
      deal.id,
      "deal_status_changed",
      {
        from: prevStatus,
        to: mergedStatus,
        ...(mergedLossReason ? { lossReason: mergedLossReason } : {}),
      },
      changedByUserId,
      changedByName,
    );
  }

  logDealFieldChanges(db, deal.id, beforeSnapshot, deal, changedByUserId, changedByName);

  const out = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  res.json(toDealResponse(out));
});

app.get("/api/deals/:id/audit", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM deal_audit WHERE dealId = ? ORDER BY at DESC LIMIT 200")
    .all(req.params.id);
  res.json(rows);
});

app.delete("/api/deals/:id", (req, res) => {
  let body = req.body;
  if (!body || typeof body !== "object") body = {};
  const { actorRole, deletedByUserId, deletedByName } = body;
  if (!isSuperAdminRole(actorRole)) {
    return res.status(403).json({ error: "Only super admin can delete deals" });
  }
  const existing = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.deletedAt) return res.json({ ok: true });
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE deals SET deletedAt = ?, deletedByUserId = ?, deletedByName = ?, updatedAt = ? WHERE id = ?`,
  ).run(now, deletedByUserId || null, deletedByName || null, now, req.params.id);
  logDealAudit(db, req.params.id, "deal_soft_deleted", {}, deletedByUserId, deletedByName);
  res.json({ ok: true });
});

app.get("/api/automation/templates", (_req, res) => {
  const rows = db
    .prepare("SELECT data FROM automation_templates ORDER BY updatedAt DESC")
    .all();
  const templates = rows.map((r) => parseJsonSafe(r.data)).filter(Boolean);
  res.json(templates);
});

app.post("/api/automation/templates", (req, res) => {
  const template = req.body || {};
  if (!template.id || !template.trigger || !template.channel) {
    return res.status(400).json({ error: "id, trigger and channel are required" });
  }
  db.prepare(
    `INSERT INTO automation_templates (id, trigger, channel, isActive, updatedAt, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    template.id,
    template.trigger,
    template.channel,
    template.isActive ? 1 : 0,
    template.updatedAt || new Date().toISOString(),
    JSON.stringify(template),
  );
  res.status(201).json(template);
});

app.put("/api/automation/templates/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM automation_templates WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const template = { ...(req.body || {}), id: req.params.id };
  db.prepare(
    `UPDATE automation_templates
     SET trigger=?, channel=?, isActive=?, updatedAt=?, data=?
     WHERE id=?`
  ).run(
    template.trigger,
    template.channel,
    template.isActive ? 1 : 0,
    template.updatedAt || new Date().toISOString(),
    JSON.stringify(template),
    req.params.id,
  );
  res.json(template);
});

app.delete("/api/automation/templates/:id", (req, res) => {
  const info = db.prepare("DELETE FROM automation_templates WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/automation/logs", (_req, res) => {
  const rows = db
    .prepare("SELECT data FROM automation_logs ORDER BY sentAt DESC LIMIT 1000")
    .all();
  const logs = rows.map((r) => parseJsonSafe(r.data)).filter(Boolean);
  res.json(logs);
});

app.post("/api/automation/logs", (req, res) => {
  const log = req.body || {};
  if (!log.id || !log.sentAt || !log.status) {
    return res.status(400).json({ error: "id, sentAt and status are required" });
  }
  db.prepare("INSERT INTO automation_logs (id, sentAt, status, data) VALUES (?, ?, ?, ?)").run(
    log.id,
    log.sentAt,
    log.status,
    JSON.stringify(log),
  );
  res.status(201).json(log);
});

app.put("/api/automation/logs/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM automation_logs WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const log = { ...(req.body || {}), id: req.params.id };
  db.prepare("UPDATE automation_logs SET sentAt=?, status=?, data=? WHERE id=?").run(
    log.sentAt || new Date().toISOString(),
    log.status || "pending",
    JSON.stringify(log),
    req.params.id,
  );
  res.json(log);
});

app.get("/api/automation/settings", (_req, res) => {
  const row = db.prepare("SELECT data FROM automation_settings WHERE id = 1").get();
  const settings = row ? parseJsonSafe(row.data, {}) : {};
  res.json(settings);
});

app.put("/api/automation/settings", (req, res) => {
  const row = db.prepare("SELECT data FROM automation_settings WHERE id = 1").get();
  const existing = row ? parseJsonSafe(row.data, {}) : {};
  const merged = { ...existing, ...(req.body || {}) };
  db.prepare(
    `INSERT INTO automation_settings (id, data, updatedAt) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt`
  ).run(JSON.stringify(merged), new Date().toISOString());
  res.json(merged);
});

app.put("/api/customers/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const {
    name,
    state,
    gstin,
    regionId,
    leadId,
    city,
    email,
    primaryPhone,
    status,
    salesExecutive,
    accountManager,
    deliveryExecutive,
    remarks,
  } = req.body || {};

  const updated = {
    ...existing,
    ...(name !== undefined && { name }),
    ...(state !== undefined && { state }),
    ...(gstin !== undefined && { gstin }),
    ...(regionId !== undefined && { regionId }),
    ...(leadId !== undefined && { leadId }),
    ...(city !== undefined && { city }),
    ...(email !== undefined && { email }),
    ...(primaryPhone !== undefined && { primaryPhone }),
    ...(status !== undefined && { status }),
    ...(salesExecutive !== undefined && { salesExecutive }),
    ...(accountManager !== undefined && { accountManager }),
    ...(deliveryExecutive !== undefined && { deliveryExecutive }),
    ...(remarks !== undefined && { remarks }),
  };

  db.prepare(`
    UPDATE customers SET
      leadId=@leadId, name=@name, state=@state, gstin=@gstin, regionId=@regionId, city=@city,
      email=@email, primaryPhone=@primaryPhone, status=@status, salesExecutive=@salesExecutive,
      accountManager=@accountManager, deliveryExecutive=@deliveryExecutive, remarks=@remarks
    WHERE id=@id
  `).run(updated);

  res.json(updated);
});

app.delete("/api/customers/:id", (req, res) => {
  const info = db.prepare("DELETE FROM customers WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/masters/product-categories", (_req, res) => {
  res.json(db.prepare("SELECT * FROM masters WHERE type = ? ORDER BY name").all("product_category"));
});

app.post("/api/masters/product-categories", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: "mc" + makeId(), name, type: "product_category" };
  db.prepare("INSERT INTO masters (id, name, type) VALUES (@id, @name, @type)").run(item);
  res.status(201).json(item);
});

app.delete("/api/masters/product-categories/:id", (req, res) => {
  const info = db.prepare("DELETE FROM masters WHERE id = ? AND type = ?").run(req.params.id, "product_category");
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.put("/api/masters/product-categories/:id", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const info = db
    .prepare("UPDATE masters SET name = ? WHERE id = ? AND type = ?")
    .run(name, req.params.id, "product_category");
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ id: req.params.id, name, type: "product_category" });
});

app.get("/api/masters/subscription-types", (_req, res) => {
  res.json(db.prepare("SELECT * FROM masters WHERE type = ? ORDER BY name").all("subscription_type"));
});

app.post("/api/masters/subscription-types", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: "ms" + makeId(), name, type: "subscription_type" };
  db.prepare("INSERT INTO masters (id, name, type) VALUES (@id, @name, @type)").run(item);
  res.status(201).json(item);
});

app.delete("/api/masters/subscription-types/:id", (req, res) => {
  const info = db.prepare("DELETE FROM masters WHERE id = ? AND type = ?").run(req.params.id, "subscription_type");
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.put("/api/masters/subscription-types/:id", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const info = db
    .prepare("UPDATE masters SET name = ? WHERE id = ? AND type = ?")
    .run(name, req.params.id, "subscription_type");
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ id: req.params.id, name, type: "subscription_type" });
});

app.get("/api/masters/proposal-formats", (_req, res) => {
  res.json(db.prepare("SELECT * FROM masters WHERE type = ? ORDER BY name").all("proposal_format"));
});

app.post("/api/masters/proposal-formats", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: "mf" + makeId(), name, type: "proposal_format" };
  db.prepare("INSERT INTO masters (id, name, type) VALUES (@id, @name, @type)").run(item);
  res.status(201).json(item);
});

app.delete("/api/masters/proposal-formats/:id", (req, res) => {
  const info = db.prepare("DELETE FROM masters WHERE id = ? AND type = ?").run(req.params.id, "proposal_format");
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.put("/api/masters/proposal-formats/:id", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const info = db
    .prepare("UPDATE masters SET name = ? WHERE id = ? AND type = ?")
    .run(name, req.params.id, "proposal_format");
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ id: req.params.id, name, type: "proposal_format" });
});

app.get("/api/inventory", (_req, res) => {
  const rows = db.prepare("SELECT * FROM inventory ORDER BY createdAt DESC").all().map(toInventoryResponse);
  res.json(rows);
});

app.get("/api/inventory/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM inventory WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(toInventoryResponse(row));
});

app.post("/api/inventory", (req, res) => {
  const { name, description, itemType, sku, hsnSacCode, category, unitOfMeasure, costPrice, sellingPrice, taxRate, isActive, createdBy, notes, stockQty, supplier, location } = req.body || {};
  if (!name || !sku || !category || unitOfMeasure == null) return res.status(400).json({ error: "name, sku, category, and unitOfMeasure are required" });
  if (db.prepare("SELECT id FROM inventory WHERE UPPER(sku) = UPPER(?)").get(String(sku).trim())) return res.status(400).json({ error: "SKU already exists" });

  const item = {
    id: "inv" + makeId(),
    name,
    description: description || null,
    itemType: itemType || "product",
    sku: String(sku).trim(),
    hsnSacCode: hsnSacCode || null,
    category,
    unitOfMeasure,
    costPrice: Number(costPrice) || 0,
    sellingPrice: Number(sellingPrice) || 0,
    taxRate: Number(taxRate) || 18,
    isActive: isActive === false ? 0 : 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: createdBy || "u1",
    notes: notes || null,
    stockQty: Number(stockQty) || 0,
    supplier: supplier || null,
    location: location || null,
  };

  db.prepare(`
    INSERT INTO inventory (id, name, description, itemType, sku, hsnSacCode, category, unitOfMeasure, costPrice, sellingPrice, taxRate, isActive, createdAt, updatedAt, createdBy, notes, stockQty, supplier, location)
    VALUES (@id, @name, @description, @itemType, @sku, @hsnSacCode, @category, @unitOfMeasure, @costPrice, @sellingPrice, @taxRate, @isActive, @createdAt, @updatedAt, @createdBy, @notes, @stockQty, @supplier, @location)
  `).run(item);

  res.status(201).json(toInventoryResponse(item));
});

app.put("/api/inventory/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM inventory WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { name, description, itemType, sku, hsnSacCode, category, unitOfMeasure, costPrice, sellingPrice, taxRate, isActive, notes, stockQty, supplier, location } = req.body || {};
  if (sku !== undefined && String(sku).trim().toUpperCase() !== String(existing.sku).trim().toUpperCase()) {
    if (db.prepare("SELECT id FROM inventory WHERE UPPER(sku)=UPPER(?) AND id <> ?").get(String(sku).trim(), req.params.id)) {
      return res.status(400).json({ error: "SKU already exists" });
    }
  }

  const item = {
    ...existing,
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(itemType !== undefined && { itemType }),
    ...(sku !== undefined && { sku: String(sku).trim() }),
    ...(hsnSacCode !== undefined && { hsnSacCode: hsnSacCode || null }),
    ...(category !== undefined && { category }),
    ...(unitOfMeasure !== undefined && { unitOfMeasure }),
    ...(costPrice !== undefined && { costPrice: Number(costPrice) }),
    ...(sellingPrice !== undefined && { sellingPrice: Number(sellingPrice) }),
    ...(taxRate !== undefined && { taxRate: Number(taxRate) }),
    ...(isActive !== undefined && { isActive: isActive ? 1 : 0 }),
    ...(notes !== undefined && { notes: notes || null }),
    ...(stockQty !== undefined && { stockQty: Number(stockQty) || 0 }),
    ...(supplier !== undefined && { supplier: supplier || null }),
    ...(location !== undefined && { location: location || null }),
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE inventory SET
      name=@name, description=@description, itemType=@itemType, sku=@sku, hsnSacCode=@hsnSacCode, category=@category,
      unitOfMeasure=@unitOfMeasure, costPrice=@costPrice, sellingPrice=@sellingPrice, taxRate=@taxRate, isActive=@isActive,
      updatedAt=@updatedAt, notes=@notes, stockQty=@stockQty, supplier=@supplier, location=@location
    WHERE id=@id
  `).run(item);

  res.json(toInventoryResponse(item));
});

app.delete("/api/inventory/:id", (req, res) => {
  const info = db.prepare("DELETE FROM inventory WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

registerPaymentsApi(app, db);
registerDataControlApi(app, db, { makeId, nextDealId });
registerSubscriptionRenewalApi(app, db);

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
  console.log(`SQLite DB path: ${SQLITE_PATH}`);
});
