import express from "express";
import cors from "cors";
import { db, SQLITE_PATH, USERS_TEAMS_SEED_KEY, forceReseedUsersAndTeams } from "./db.js";
import { registerPaymentsApi } from "./paymentsApi.js";
import { registerDataControlApi } from "./dataControlApi.js";
import { registerSubscriptionRenewalApi } from "./subscriptionRenewalApi.js";
import {
  registerIntegrationProxies,
  registerN8nWebhookProxyEarly,
  N8N_WEBHOOK_PROXY_VERSION,
} from "./integrationsProxy.js";
import { attachInteractionLogger } from "./middleware/interactionLogger.js";
import { registerDeliveryApi } from "./deliveryApi.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
// n8n webhooks must see the raw body (JSON or multipart). Register before express.json/urlencoded
// so the integration proxy forwards the full payload to n8n (HTTPS dashboard path).
registerN8nWebhookProxyEarly(app, { db });
console.log(`[buildesk] n8n webhook integration proxy: ${N8N_WEBHOOK_PROXY_VERSION} (GET /api/integrations/n8n/webhook/buildesk-email to verify)`);
// Bulk import endpoints can send large JSON payloads (Excel → rows → JSON).
// Note: Reverse proxies (nginx) may also need `client_max_body_size` increased.
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(attachInteractionLogger(db));
registerIntegrationProxies(app, { db });

// Debug helpers (intentionally behind an env flag for VPS troubleshooting).
function debugEnabled() {
  return process.env.ALLOW_DEBUG_API === "1" || process.env.ALLOW_DEBUG_API === "true";
}

app.get("/api/_debug/db-info", (_req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: "Not found" });
  const meta = db.prepare("SELECT key, value, updatedAt FROM app_meta ORDER BY key").all();
  const users = db.prepare("SELECT id, name, email, role, teamId, regionId, status FROM users ORDER BY name").all();
  res.json({
    sqlitePath: SQLITE_PATH,
    usersTeamsSeedKey: USERS_TEAMS_SEED_KEY,
    meta,
    usersCount: users.length,
    users,
  });
});

app.post("/api/_debug/force-reseed-users-teams", (_req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: "Not found" });
  forceReseedUsersAndTeams();
  const users = db.prepare("SELECT id, name, email, role, teamId, regionId, status FROM users ORDER BY name").all();
  res.json({ ok: true, usersTeamsSeedKey: USERS_TEAMS_SEED_KEY, usersCount: users.length, users });
});

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

function normalizeRole(role) {
  return String(role || "").toLowerCase().replace(/\s+/g, "_");
}

function canDealAction(role, action) {
  const r = normalizeRole(role);
  const permissions = {
    super_admin: ["view", "create", "edit", "delete", "change_stage", "assign", "export"],
    finance: ["view", "export"],
    sales_manager: ["view", "create", "edit", "change_stage", "assign", "export"],
    sales_rep: ["view", "create", "change_stage"],
    support: ["view"],
  };
  return (permissions[r] ?? []).includes(action);
}

function dealInScopeFor(role, actor, deal) {
  const r = normalizeRole(role);
  if (r === "super_admin" || r === "finance") return true;
  if (!deal) return false;
  if (r === "sales_rep") return deal.ownerUserId === actor.userId;
  if (r === "sales_manager" || r === "support") {
    return deal.teamId === actor.teamId || deal.regionId === actor.regionId;
  }
  return false;
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
    "invoiceStatus",
    "invoiceDate",
    "invoiceNumber",
    "totalAmount",
    "taxAmount",
    "amountWithoutTax",
    "placeOfSupply",
    "balanceAmount",
    "amountPaid",
    "serviceName",
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
    status: proposal.status || "shared",
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
    invoiceStatus: row.invoiceStatus ?? null,
    invoiceDate: row.invoiceDate ?? null,
    invoiceNumber: row.invoiceNumber ?? null,
    totalAmount: row.totalAmount != null ? Number(row.totalAmount) : 0,
    taxAmount: row.taxAmount != null ? Number(row.taxAmount) : 0,
    amountWithoutTax: row.amountWithoutTax != null ? Number(row.amountWithoutTax) : 0,
    placeOfSupply: row.placeOfSupply ?? null,
    balanceAmount: row.balanceAmount != null ? Number(row.balanceAmount) : 0,
    amountPaid: row.amountPaid != null ? Number(row.amountPaid) : 0,
    serviceName: row.serviceName ?? null,
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
  const { id, name, email, password, role, teamId, regionId, status, phone } = req.body || {};
  if (!name || !email || !password || !role || !teamId || !regionId) {
    return res.status(400).json({ error: "name, email, password, role, teamId, regionId are required" });
  }
  const user = {
    id: id || "u" + makeId(),
    name,
    email,
    password,
    role,
    teamId,
    regionId,
    status: status || "active",
    phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
  };
  db.prepare(
    "INSERT INTO users (id, name, email, password, role, teamId, regionId, status, phone) VALUES (@id, @name, @email, @password, @role, @teamId, @regionId, @status, @phone)"
  ).run(user);
  res.status(201).json(user);
});

app.put("/api/users/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const incoming = req.body || {};
  const updated = { ...existing, ...incoming, id: req.params.id };

  const isDeactivating = existing.status === "active" && updated.status === "disabled";
  const transferToUserId = incoming.transferToUserId ? String(incoming.transferToUserId) : null;
  if (isDeactivating && !transferToUserId) {
    return res.status(400).json({ error: "transferToUserId is required when disabling a user" });
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE users SET name=@name, email=@email, password=@password, role=@role, teamId=@teamId, regionId=@regionId, status=@status, phone=@phone, joinDate=@joinDate, remarks=@remarks WHERE id=@id"
    ).run({
      ...updated,
      phone: updated.phone ?? null,
      joinDate: updated.joinDate ?? null,
      remarks: updated.remarks ?? null,
    });

    if (isDeactivating && transferToUserId) {
      const target = db
        .prepare("SELECT id, name, status FROM users WHERE id = ?")
        .get(transferToUserId);
      if (!target || target.status !== "active") {
        throw new Error("Invalid transferToUserId (must be an active user)");
      }
      // Reassign active customers + non-deleted deals
      db.prepare("UPDATE deals SET ownerUserId = ? WHERE ownerUserId = ? AND (deletedAt IS NULL OR deletedAt = '')").run(
        transferToUserId,
        existing.id,
      );
      db.prepare("UPDATE proposals SET assignedTo = ? WHERE assignedTo = ?").run(transferToUserId, existing.id);

      try {
        req.logInteraction?.({
          customerId: "system",
          entityType: "user",
          entityId: existing.id,
          channel: "system",
          direction: "system",
          summary: `TRANSFER_WORKFLOW: reassigned records from ${existing.id} to ${transferToUserId}`,
          payloadJson: { fromUserId: existing.id, toUserId: transferToUserId, deals: true, proposals: true },
          performedBy: "system",
          performedByName: "System",
          at: new Date().toISOString(),
        });
      } catch {
        /* ignore */
      }
    }
  })();

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
  try {
    req.logInteraction?.({
      customerId: null,
      entityType: "notification",
      entityId: notification.id,
      channel: "email",
      direction: "out",
      summary: `${type}: ${subject}`,
      payloadJson: notification,
      performedBy: null,
      performedByName: "System",
      at,
    });
  } catch {
    /* ignore */
  }
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
  const {
    name,
    customerName,
    companyName,
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
    tags,
    tag,
  } = req.body || {};
  if (!name || !regionId) return res.status(400).json({ error: "name and regionId are required" });

  const normalizedTags = (() => {
    const fromArray = Array.isArray(tags) ? tags : [];
    const fromSingle = typeof tags === "string" ? [tags] : typeof tag === "string" ? [tag] : [];
    const merged = [...fromArray, ...fromSingle]
      .flatMap((t) => String(t).split(/[,;]/))
      .map((t) => t.trim())
      .filter(Boolean);
    return Array.from(new Set(merged.map((t) => t.toLowerCase()))).map((lower) => {
      // Preserve original casing from first occurrence
      const found = merged.find((x) => x.toLowerCase() === lower);
      return found ?? lower;
    });
  })();

  const customer = {
    id: req.body?.id || "c" + makeId(),
    leadId: leadId || `L-${makeId()}`,
    // Legacy: store best display name
    name: companyName || customerName || name,
    customerName: customerName || (companyName ? name : name) || null,
    companyName: companyName ?? null,
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
    tags: JSON.stringify(normalizedTags),
  };

  db.prepare(`
    INSERT INTO customers (id, leadId, name, customerName, companyName, state, gstin, regionId, city, email, primaryPhone, status, createdAt, salesExecutive, accountManager, deliveryExecutive, remarks, tags)
    VALUES (@id, @leadId, @name, @customerName, @companyName, @state, @gstin, @regionId, @city, @email, @primaryPhone, @status, @createdAt, @salesExecutive, @accountManager, @deliveryExecutive, @remarks, @tags)
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
  try {
    req.logInteraction?.({
      customerId: proposal.customerId,
      entityType: "proposal",
      entityId: proposal.id,
      channel: "proposal",
      direction: "system",
      summary: `Proposal created: ${proposal.proposalNumber} — ${proposal.title}`,
      payloadJson: { proposalNumber: proposal.proposalNumber, status: proposal.status },
      performedBy: proposal.createdBy || proposal.assignedTo || null,
      performedByName: proposal.assignedToName || null,
      at: proposal.createdAt || new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
  res.status(201).json(proposal);
});

app.post("/api/proposals/bulk", (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const insert = db.prepare(`
    INSERT INTO proposals (id, proposalNumber, title, customerId, assignedTo, status, grandTotal, finalQuoteValue, createdAt, updatedAt, data)
    VALUES (@id, @proposalNumber, @title, @customerId, @assignedTo, @status, @grandTotal, @finalQuoteValue, @createdAt, @updatedAt, @data)
  `);
  const valid = items.filter(
    (p) => p && p.id && p.proposalNumber && p.title && p.customerId,
  );
  const run = db.transaction((rows) => {
    for (const p of rows) insert.run(toProposalRow(p));
  });
  run(valid);
  res.status(201).json({ created: valid.length, skipped: items.length - valid.length });
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
  try {
    req.logInteraction?.({
      customerId: proposal.customerId,
      entityType: "proposal",
      entityId: proposal.id,
      channel: "proposal",
      direction: "system",
      summary: `Proposal updated: ${proposal.proposalNumber} — ${proposal.title}`,
      payloadJson: { status: proposal.status, grandTotal: proposal.grandTotal, finalQuoteValue: proposal.finalQuoteValue },
      performedBy: proposal.createdBy || proposal.assignedTo || null,
      performedByName: proposal.assignedToName || null,
      at: proposal.updatedAt || new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
  res.json(proposal);
});

app.delete("/api/proposals/:id", (req, res) => {
  const info = db.prepare("DELETE FROM proposals WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/deals", (req, res) => {
  const actorRole = normalizeRole(req.query.actorRole);
  const actor = {
    userId: req.query.actorUserId ? String(req.query.actorUserId) : null,
    teamId: req.query.actorTeamId ? String(req.query.actorTeamId) : null,
    regionId: req.query.actorRegionId ? String(req.query.actorRegionId) : null,
  };
  if (!canDealAction(actorRole, "view")) return res.status(403).json({ error: "Forbidden" });

  const includeDeleted = req.query.includeDeleted === "1" && actorRole === "super_admin";
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
  rows = rows.filter((d) => dealInScopeFor(actorRole, actor, d));
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
    invoiceStatus,
    invoiceDate,
    invoiceNumber,
    totalAmount,
    taxAmount,
    amountWithoutTax,
    placeOfSupply,
    balanceAmount,
    amountPaid,
    serviceName,
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
    actorUserId,
    actorTeamId,
    actorRegionId,
  } = req.body || {};
  const normRole = normalizeRole(actorRole);
  const actor = {
    userId: actorUserId ? String(actorUserId) : null,
    teamId: actorTeamId ? String(actorTeamId) : null,
    regionId: actorRegionId ? String(actorRegionId) : null,
  };
  if (!canDealAction(normRole, "create")) {
    return res.status(403).json({ error: "Your role cannot create deals" });
  }
  if (!name || !customerId || !ownerUserId || !teamId || !regionId || !stage) {
    return res
      .status(400)
      .json({ error: "name, customerId, ownerUserId, teamId, regionId and stage are required" });
  }
  if (normRole === "sales_rep" && actor.userId && String(ownerUserId) !== actor.userId) {
    return res.status(403).json({ error: "Sales rep can only create deals assigned to self" });
  }
  if ((normRole === "sales_manager" || normRole === "support") && actor.teamId && actor.regionId) {
    if (String(teamId) !== actor.teamId && String(regionId) !== actor.regionId) {
      return res.status(403).json({ error: "Out of scope" });
    }
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
    invoiceStatus: invoiceStatus != null && String(invoiceStatus).trim() ? String(invoiceStatus).trim() : null,
    invoiceDate: invoiceDate != null && String(invoiceDate).trim() ? String(invoiceDate).trim() : null,
    invoiceNumber: invoiceNumber != null && String(invoiceNumber).trim() ? String(invoiceNumber).trim() : null,
    totalAmount: totalAmount != null ? Number(totalAmount) || 0 : Number(value) || 0,
    taxAmount: taxAmount != null ? Number(taxAmount) || 0 : 0,
    amountWithoutTax: amountWithoutTax != null ? Number(amountWithoutTax) || 0 : 0,
    placeOfSupply: placeOfSupply != null && String(placeOfSupply).trim() ? String(placeOfSupply).trim() : null,
    balanceAmount: balanceAmount != null ? Number(balanceAmount) || 0 : 0,
    amountPaid: amountPaid != null ? Number(amountPaid) || 0 : 0,
    serviceName: serviceName != null && String(serviceName).trim() ? String(serviceName).trim() : null,
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
      dealStatus, invoiceStatus, invoiceDate, invoiceNumber, totalAmount, taxAmount, amountWithoutTax, placeOfSupply, balanceAmount, amountPaid, serviceName,
      dealSource, expectedCloseDate, priority, lastActivityAt, nextFollowUpDate, lossReason,
      contactPhone, remarks, createdByUserId, createdByName, createdAt, updatedAt
    ) VALUES (
      @id, @name, @customerId, @ownerUserId, @teamId, @regionId, @stage, @value, @locked, @proposalId,
      @dealStatus, @invoiceStatus, @invoiceDate, @invoiceNumber, @totalAmount, @taxAmount, @amountWithoutTax, @placeOfSupply, @balanceAmount, @amountPaid, @serviceName,
      @dealSource, @expectedCloseDate, @priority, @lastActivityAt, @nextFollowUpDate, @lossReason,
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

app.post("/api/deals/bulk", (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO deals (
      id, name, customerId, ownerUserId, teamId, regionId, stage, value, locked, proposalId,
      dealStatus, invoiceStatus, invoiceDate, invoiceNumber, totalAmount, taxAmount, amountWithoutTax, placeOfSupply, balanceAmount, amountPaid, serviceName,
      dealSource, expectedCloseDate, priority, lastActivityAt, nextFollowUpDate, lossReason,
      contactPhone, remarks, createdByUserId, createdByName, createdAt, updatedAt
    ) VALUES (
      @id, @name, @customerId, @ownerUserId, @teamId, @regionId, @stage, @value, @locked, @proposalId,
      @dealStatus, @invoiceStatus, @invoiceDate, @invoiceNumber, @totalAmount, @taxAmount, @amountWithoutTax, @placeOfSupply, @balanceAmount, @amountPaid, @serviceName,
      @dealSource, @expectedCloseDate, @priority, @lastActivityAt, @nextFollowUpDate, @lossReason,
      @contactPhone, @remarks, @createdByUserId, @createdByName, @createdAt, @updatedAt
    )
  `);

  const created = [];
  let skipped = 0;

  const tx = db.transaction((rows) => {
    for (const raw of rows) {
      const it = raw || {};
      const { actorRole, changedByUserId, changedByName, createdByUserId, createdByName } = it;

      if (!it.name || !it.customerId || !it.ownerUserId || !it.teamId || !it.regionId || !it.stage) {
        skipped += 1;
        continue;
      }
      const numVal = Number(it.value);
      if (!Number.isFinite(numVal) || numVal <= 0) {
        skipped += 1;
        continue;
      }

      const ds = it.dealStatus || "Active";
      if (ds === "Closed/Lost" && !isSuperAdminRole(actorRole)) {
        skipped += 1;
        continue;
      }
      if (ds === "Closed/Lost" && (!it.lossReason || !String(it.lossReason).trim())) {
        skipped += 1;
        continue;
      }

      const creatorId = createdByUserId || changedByUserId;
      const creatorName = createdByName || changedByName;
      const id = nextDealId();
      const deal = {
        id,
        name: it.name,
        customerId: it.customerId,
        ownerUserId: it.ownerUserId,
        teamId: it.teamId,
        regionId: it.regionId,
        stage: it.stage,
        value: Number(it.value) || 0,
        locked: it.locked ? 1 : 0,
        proposalId: it.proposalId || null,
        dealStatus: ds,
        invoiceStatus: it.invoiceStatus != null && String(it.invoiceStatus).trim() ? String(it.invoiceStatus).trim() : null,
        invoiceDate: it.invoiceDate != null && String(it.invoiceDate).trim() ? String(it.invoiceDate).trim() : null,
        invoiceNumber: it.invoiceNumber != null && String(it.invoiceNumber).trim() ? String(it.invoiceNumber).trim() : null,
        totalAmount: it.totalAmount != null ? Number(it.totalAmount) || 0 : Number(it.value) || 0,
        taxAmount: it.taxAmount != null ? Number(it.taxAmount) || 0 : 0,
        amountWithoutTax: it.amountWithoutTax != null ? Number(it.amountWithoutTax) || 0 : 0,
        placeOfSupply: it.placeOfSupply != null && String(it.placeOfSupply).trim() ? String(it.placeOfSupply).trim() : null,
        balanceAmount: it.balanceAmount != null ? Number(it.balanceAmount) || 0 : 0,
        amountPaid: it.amountPaid != null ? Number(it.amountPaid) || 0 : 0,
        serviceName: it.serviceName != null && String(it.serviceName).trim() ? String(it.serviceName).trim() : null,
        dealSource: it.dealSource || null,
        expectedCloseDate: it.expectedCloseDate || null,
        priority: it.priority || "Medium",
        lastActivityAt: now,
        nextFollowUpDate: it.nextFollowUpDate || null,
        lossReason: ds === "Closed/Lost" ? (it.lossReason || null) : null,
        contactPhone: it.contactPhone != null && String(it.contactPhone).trim() ? String(it.contactPhone).trim() : null,
        remarks: it.remarks != null && String(it.remarks).trim() ? String(it.remarks).trim() : null,
        createdByUserId: creatorId || null,
        createdByName: creatorName || null,
        createdAt: now,
        updatedAt: now,
      };

      insert.run(deal);
      logDealAudit(
        db,
        deal.id,
        "deal_created",
        { dealId: deal.id, dealStatus: deal.dealStatus, name: deal.name, value: deal.value, customerId: deal.customerId, ownerUserId: deal.ownerUserId },
        changedByUserId,
        changedByName,
      );
      created.push(toDealResponse(deal));
    }
  });

  tx(items);
  res.status(201).json({ created: created.length, skipped, deals: created });
});

app.put("/api/deals/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.deletedAt) return res.status(410).json({ error: "Deal has been deleted" });

  const { actorRole, actorUserId, actorTeamId, actorRegionId, changedByUserId, changedByName } = req.body || {};
  const normRole = normalizeRole(actorRole);
  const actor = {
    userId: actorUserId ? String(actorUserId) : null,
    teamId: actorTeamId ? String(actorTeamId) : null,
    regionId: actorRegionId ? String(actorRegionId) : null,
  };
  const canAny =
    canDealAction(normRole, "edit") ||
    canDealAction(normRole, "change_stage") ||
    canDealAction(normRole, "assign");
  if (!canAny) return res.status(403).json({ error: "Forbidden" });
  if (!dealInScopeFor(normRole, actor, toDealResponse(existing))) {
    return res.status(403).json({ error: "Out of scope" });
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
    invoiceStatus,
    invoiceDate,
    invoiceNumber,
    totalAmount,
    taxAmount,
    amountWithoutTax,
    placeOfSupply,
    balanceAmount,
    amountPaid,
    serviceName,
    dealSource,
    expectedCloseDate,
    priority,
    nextFollowUpDate,
    lossReason,
    contactPhone,
    remarks,
    deliveryAssigneeUserId,
    deliveryAssigneeName,
  } = req.body || {};

  if (normRole === "sales_rep") {
    const allowedKeys = new Set([
      "actorRole",
      "actorUserId",
      "actorTeamId",
      "actorRegionId",
      "changedByUserId",
      "changedByName",
      "stage",
    ]);
    for (const k of Object.keys(req.body || {})) {
      if (!allowedKeys.has(k)) {
        return res.status(403).json({ error: "Sales rep can only change stage" });
      }
    }
  }

  if (normRole === "finance" || normRole === "support") {
    return res.status(403).json({ error: "Read-only role" });
  }

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
    ...(invoiceStatus !== undefined && { invoiceStatus: invoiceStatus != null && String(invoiceStatus).trim() ? String(invoiceStatus).trim() : null }),
    ...(invoiceDate !== undefined && { invoiceDate: invoiceDate != null && String(invoiceDate).trim() ? String(invoiceDate).trim() : null }),
    ...(invoiceNumber !== undefined && { invoiceNumber: invoiceNumber != null && String(invoiceNumber).trim() ? String(invoiceNumber).trim() : null }),
    ...(totalAmount !== undefined && { totalAmount: totalAmount != null ? Number(totalAmount) || 0 : 0 }),
    ...(taxAmount !== undefined && { taxAmount: taxAmount != null ? Number(taxAmount) || 0 : 0 }),
    ...(amountWithoutTax !== undefined && { amountWithoutTax: amountWithoutTax != null ? Number(amountWithoutTax) || 0 : 0 }),
    ...(placeOfSupply !== undefined && { placeOfSupply: placeOfSupply != null && String(placeOfSupply).trim() ? String(placeOfSupply).trim() : null }),
    ...(balanceAmount !== undefined && { balanceAmount: balanceAmount != null ? Number(balanceAmount) || 0 : 0 }),
    ...(amountPaid !== undefined && { amountPaid: amountPaid != null ? Number(amountPaid) || 0 : 0 }),
    ...(serviceName !== undefined && { serviceName: serviceName != null && String(serviceName).trim() ? String(serviceName).trim() : null }),
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
      dealStatus=@dealStatus, invoiceStatus=@invoiceStatus, invoiceDate=@invoiceDate, invoiceNumber=@invoiceNumber,
      totalAmount=@totalAmount, taxAmount=@taxAmount, amountWithoutTax=@amountWithoutTax, placeOfSupply=@placeOfSupply,
      balanceAmount=@balanceAmount, amountPaid=@amountPaid, serviceName=@serviceName,
      dealSource=@dealSource, expectedCloseDate=@expectedCloseDate,
      priority=@priority, lastActivityAt=@lastActivityAt, nextFollowUpDate=@nextFollowUpDate, lossReason=@lossReason,
      contactPhone=@contactPhone, remarks=@remarks,
      deliveryAssigneeUserId=@deliveryAssigneeUserId, deliveryAssigneeName=@deliveryAssigneeName,
      updatedAt=@updatedAt
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
  const { actorRole, actorUserId, actorTeamId, actorRegionId, deletedByUserId, deletedByName } = body;
  const normRole = normalizeRole(actorRole);
  const actor = {
    userId: actorUserId ? String(actorUserId) : null,
    teamId: actorTeamId ? String(actorTeamId) : null,
    regionId: actorRegionId ? String(actorRegionId) : null,
  };
  if (!canDealAction(normRole, "delete")) {
    return res.status(403).json({ error: "Your role cannot delete deals" });
  }
  const existing = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!dealInScopeFor(normRole, actor, toDealResponse(existing))) {
    return res.status(403).json({ error: "Out of scope" });
  }
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
    customerName,
    companyName,
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
    tags,
    tag,
  } = req.body || {};

  const normalizedTags = (() => {
    if (tags === undefined && tag === undefined) return undefined;
    const fromArray = Array.isArray(tags) ? tags : [];
    const fromSingle = typeof tags === "string" ? [tags] : typeof tag === "string" ? [tag] : [];
    const merged = [...fromArray, ...fromSingle]
      .flatMap((t) => String(t).split(/[,;]/))
      .map((t) => t.trim())
      .filter(Boolean);
    return Array.from(new Set(merged.map((t) => t.toLowerCase()))).map((lower) => {
      const found = merged.find((x) => x.toLowerCase() === lower);
      return found ?? lower;
    });
  })();

  const updated = {
    ...existing,
    ...(name !== undefined && { name }),
    ...(customerName !== undefined && { customerName }),
    ...(companyName !== undefined && { companyName }),
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
    ...(normalizedTags !== undefined && { tags: JSON.stringify(normalizedTags) }),
  };

  // Keep legacy `name` in sync as best display name
  if (customerName !== undefined || companyName !== undefined) {
    const cn = customerName !== undefined ? customerName : updated.customerName;
    const co = companyName !== undefined ? companyName : updated.companyName;
    updated.name = co || cn || updated.name;
  }

  db.prepare(`
    UPDATE customers SET
      leadId=@leadId, name=@name, customerName=@customerName, companyName=@companyName, state=@state, gstin=@gstin, regionId=@regionId, city=@city,
      email=@email, primaryPhone=@primaryPhone, status=@status, salesExecutive=@salesExecutive,
      accountManager=@accountManager, deliveryExecutive=@deliveryExecutive, remarks=@remarks, tags=@tags
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
  if (!name || !sku || !category || unitOfMeasure == null) return res.status(400).json({ error: "name, item code, category, and unitOfMeasure are required" });
  if (db.prepare("SELECT id FROM inventory WHERE UPPER(sku) = UPPER(?)").get(String(sku).trim())) return res.status(400).json({ error: "Item code already exists" });

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
      return res.status(400).json({ error: "Item code already exists" });
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
registerDeliveryApi(app, db);
registerDataControlApi(app, db, { makeId, nextDealId });
registerSubscriptionRenewalApi(app, db);

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
  console.log(`SQLite DB path: ${SQLITE_PATH}`);
});
