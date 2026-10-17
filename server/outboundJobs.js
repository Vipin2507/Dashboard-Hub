import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.resolve(__dirname, "..", "data", "outbound-pdfs");
const DEFAULT_GAP_MS = 5 * 60 * 1000;
const TICK_MS = 4000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const TERMINAL_ITEM = new Set(["sent", "partial", "failed", "skipped", "cancelled"]);

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      gapMs INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdByName TEXT,
      nextRunAt TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS outbound_job_items (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      position INTEGER NOT NULL,
      proposalId TEXT,
      proposalNumber TEXT,
      customerName TEXT,
      companyName TEXT,
      email TEXT,
      phone TEXT,
      emailSubject TEXT,
      emailBody TEXT,
      whatsappMessage TEXT,
      pdfPath TEXT,
      status TEXT NOT NULL,
      emailStatus TEXT,
      whatsappStatus TEXT,
      emailError TEXT,
      whatsappError TEXT,
      sentAt TEXT,
      FOREIGN KEY (jobId) REFERENCES outbound_jobs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_outbound_job_items_jobId ON outbound_job_items(jobId, position);
  `);
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

function parseSettings(db) {
  const row = db.prepare("SELECT data FROM automation_settings WHERE id = 1").get();
  if (!row?.data) return {};
  try {
    return JSON.parse(row.data);
  } catch {
    return {};
  }
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

function n8nBase(settings) {
  const fromDb = String(settings.n8nWebhookBase || "").trim().replace(/\/$/, "");
  if (fromDb) return fromDb;
  return String(process.env.N8N_WEBHOOK_BASE || "http://72.60.200.185:5678/webhook").replace(/\/$/, "");
}

function wahaBase(settings) {
  const fromDb = String(settings.wahaApiUrl || "").trim().replace(/\/$/, "");
  if (fromDb) return fromDb;
  return String(process.env.WAHA_PUBLIC_URL || "http://72.60.200.185:3000").replace(/\/$/, "");
}

function writeAutomationLog(db, entry) {
  db.prepare("INSERT INTO automation_logs (id, sentAt, status, data) VALUES (?, ?, ?, ?)").run(
    entry.id,
    entry.sentAt,
    entry.status,
    JSON.stringify(entry),
  );
}

function touchJob(db, id, fields) {
  const current = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(id);
  if (!current || current.status === "cancelled" || current.status === "completed") return;
  const next = { ...current, ...fields, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE outbound_jobs
     SET status=?, nextRunAt=?, error=?, updatedAt=?
     WHERE id=?`,
  ).run(next.status, next.nextRunAt ?? null, next.error ?? null, next.updatedAt, id);
}

function updateItem(db, id, fields) {
  const current = db.prepare("SELECT * FROM outbound_job_items WHERE id = ?").get(id);
  if (!current) return null;
  const next = { ...current, ...fields };
  db.prepare(
    `UPDATE outbound_job_items
     SET status=?, emailStatus=?, whatsappStatus=?, emailError=?, whatsappError=?, sentAt=?, pdfPath=?
     WHERE id=?`,
  ).run(
    next.status,
    next.emailStatus ?? null,
    next.whatsappStatus ?? null,
    next.emailError ?? null,
    next.whatsappError ?? null,
    next.sentAt ?? null,
    next.pdfPath ?? null,
    id,
  );
  return next;
}

function listItems(db, jobId) {
  return db.prepare("SELECT * FROM outbound_job_items WHERE jobId = ? ORDER BY position ASC").all(jobId);
}

function deletePdf(pdfPath) {
  if (!pdfPath) return;
  try {
    fs.unlinkSync(pdfPath);
  } catch {
    /* already gone */
  }
}

function summarizeItem(item) {
  const emailSent = item.emailStatus === "sent";
  const waSent = item.whatsappStatus === "sent";
  const emailBad = item.emailStatus === "failed";
  const waBad = item.whatsappStatus === "failed";
  let status = "failed";
  if (!emailSent && !waSent) status = "failed";
  else if (emailBad || waBad) status = "partial";
  else status = "sent";
  return status;
}

function jobSummary(db, job) {
  const items = listItems(db, job.id);
  const done = items.filter((i) => TERMINAL_ITEM.has(i.status)).length;
  const failed = items.filter((i) => i.status === "failed" || i.status === "partial").length;
  const active = items.find((i) => !TERMINAL_ITEM.has(i.status));
  return {
    id: job.id,
    kind: job.kind,
    title: job.title,
    status: job.status,
    gapMs: job.gapMs,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    createdByName: job.createdByName || "",
    nextRunAt: job.nextRunAt || null,
    error: job.error || null,
    total: items.length,
    done,
    failed,
    currentLabel: active ? active.customerName || active.proposalNumber || "" : "",
  };
}

function itemPublic(item) {
  return {
    id: item.id,
    position: item.position,
    proposalId: item.proposalId || null,
    proposalNumber: item.proposalNumber || "",
    customerName: item.customerName || "",
    companyName: item.companyName || "",
    email: item.email || "",
    phone: item.phone || "",
    status: item.status,
    emailStatus: item.emailStatus || null,
    whatsappStatus: item.whatsappStatus || null,
    emailError: item.emailError || null,
    whatsappError: item.whatsappError || null,
    sentAt: item.sentAt || null,
    hasPdf: Boolean(item.pdfPath),
  };
}

async function sendEmail(settings, item) {
  const payload = {
    channel: "email",
    templateId: item.proposalId ? "proposal-follow-up-server" : "broadcast-server",
    templateName: item.proposalId ? "Proposal Follow-up (Email)" : "Broadcast (Email)",
    trigger: item.proposalId ? "proposal_follow_up" : "proposal_follow_up",
    recipientPhone: "",
    recipientEmail: item.email,
    recipientName: item.customerName || "",
    messageBody: item.emailBody || "",
    emailSubject: item.emailSubject || "Message from Buildesk",
    emailCc: String(settings.emailCc || ""),
    delayHours: 0,
    entityType: item.proposalId ? "proposal" : "customer",
    entityId: item.proposalId || item.id,
    entityName: item.proposalNumber || item.customerName || "",
    emailFromAddress: settings.emailFromAddress || "",
    emailFromName: settings.emailFromName || "",
    wahaApiUrl: settings.wahaApiUrl || "",
    wahaApiKey: settings.wahaApiKey || "",
    wahaSession: String(settings.wahaSession || "").trim() || "default",
  };

  let init;
  if (item.pdfPath && fs.existsSync(item.pdfPath)) {
    const form = new FormData();
    form.append("data", JSON.stringify(payload));
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      form.append(key, String(value));
    }
    const bytes = fs.readFileSync(item.pdfPath);
    const filename = path.basename(item.pdfPath).endsWith(".pdf")
      ? item.proposalNumber
        ? `Proposal-${item.proposalNumber}.pdf`
        : path.basename(item.pdfPath)
      : "attachment.pdf";
    form.append("proposal_pdf", new Blob([bytes], { type: "application/pdf" }), filename);
    init = { method: "POST", body: form };
  } else {
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  }

  const res = await fetch(`${n8nBase(settings)}/buildesk-email`, init);
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(`HTTP ${res.status}${text ? ` — ${text}` : ""}`);
  }
}

async function sendWhatsApp(settings, item) {
  const phone = normalizePhone(item.phone);
  const session = String(settings.wahaSession || "").trim() || "default";
  const base = wahaBase(settings);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": String(settings.wahaApiKey || process.env.WAHA_API_KEY || ""),
  };

  let res;
  if (item.pdfPath && fs.existsSync(item.pdfPath)) {
    const bytes = fs.readFileSync(item.pdfPath);
    const filename = item.proposalNumber ? `Proposal-${item.proposalNumber}.pdf` : "attachment.pdf";
    res = await fetch(`${base}/api/sendFile`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session,
        chatId: `${phone}@c.us`,
        caption: item.whatsappMessage || "",
        file: {
          mimetype: "application/pdf",
          filename,
          data: bytes.toString("base64"),
        },
      }),
    });
  } else {
    res = await fetch(`${base}/api/sendText`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session,
        chatId: `${phone}@c.us`,
        text: item.whatsappMessage || "",
      }),
    });
  }
  if (!(res.status === 200 || res.status === 201)) {
    const text = (await res.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`${res.status}${text ? ` — ${text}` : ""}`);
  }
}

function logChannel(db, item, channel, status, errorMessage) {
  const now = new Date().toISOString();
  writeAutomationLog(db, {
    id: randomUUID(),
    templateId: item.proposalId ? `proposal-follow-up-server-${channel}` : `broadcast-server-${channel}`,
    templateName: item.proposalId ? `Proposal Follow-up (${channel})` : `Broadcast (${channel})`,
    trigger: "proposal_follow_up",
    channel,
    recipient: channel === "email" ? item.email || "" : normalizePhone(item.phone),
    recipientName: item.customerName || "",
    entityType: item.proposalId ? "proposal" : "customer",
    entityId: item.proposalId || item.id,
    entityName: item.proposalNumber || item.customerName || "",
    status,
    errorMessage,
    sentAt: now,
  });
}

function hasMorePending(db, jobId, exceptId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM outbound_job_items
       WHERE jobId = ? AND id != ? AND status NOT IN ('sent','partial','failed','skipped','cancelled')`,
    )
    .get(jobId, exceptId);
  return Number(row?.n || 0) > 0;
}

function finishItem(db, job, item, { sentSomething }) {
  const status = summarizeItem(item);
  const saved = updateItem(db, item.id, { ...item, status, sentAt: new Date().toISOString() });
  if (saved?.pdfPath) deletePdf(saved.pdfPath);
  updateItem(db, item.id, { ...saved, pdfPath: null });
  const more = hasMorePending(db, job.id, item.id);
  if (!more) {
    const items = listItems(db, job.id);
    const anyFailed = items.some((i) => i.status === "failed" || i.status === "partial");
    touchJob(db, job.id, {
      status: "completed",
      nextRunAt: null,
      error: anyFailed ? "Some messages were not sent" : null,
    });
    return;
  }
  const gap = sentSomething ? Number(job.gapMs) || DEFAULT_GAP_MS : 0;
  touchJob(db, job.id, {
    status: "running",
    nextRunAt: gap > 0 ? new Date(Date.now() + gap).toISOString() : null,
    error: null,
  });
}

async function stepJob(db, job) {
  if (job.status !== "running") return false;
  if (job.nextRunAt && Date.parse(job.nextRunAt) > Date.now()) return false;

  const items = listItems(db, job.id);
  let item =
    items.find((i) => i.status === "waiting" || i.status === "sending_email" || i.status === "sending_whatsapp") ||
    items.find((i) => i.status === "pending");
  if (!item) {
    touchJob(db, job.id, { status: "completed", nextRunAt: null, error: null });
    return true;
  }

  const phone = normalizePhone(item.phone);
  const hasEmail = Boolean(item.email && String(item.email).includes("@"));
  const settings = parseSettings(db);
  const needsPdf = job.kind === "proposal_follow_up";

  if (item.status === "pending" || item.status === "sending_email") {
    if (needsPdf && !item.pdfPath) {
      item = updateItem(db, item.id, {
        ...item,
        emailStatus: hasEmail ? "failed" : "skipped",
        whatsappStatus: phone ? "failed" : "skipped",
        emailError: hasEmail ? "Proposal PDF was not uploaded" : null,
        whatsappError: phone ? "Proposal PDF was not uploaded" : null,
      });
      finishItem(db, job, item, { sentSomething: false });
      return true;
    }

    if (!hasEmail) {
      item = updateItem(db, item.id, {
        ...item,
        emailStatus: "skipped",
        emailError: "Missing or invalid email address",
        status: phone && item.whatsappMessage ? "sending_whatsapp" : item.status,
      });
      if (!(phone && item.whatsappMessage)) {
        item = updateItem(db, item.id, { ...item, whatsappStatus: "skipped", whatsappError: "Missing or invalid WhatsApp number" });
        finishItem(db, job, item, { sentSomething: false });
        return true;
      }
    } else {
      updateItem(db, item.id, { ...item, status: "sending_email", emailStatus: "pending" });
      try {
        await sendEmail(settings, item);
        if (db.prepare("SELECT status FROM outbound_jobs WHERE id = ?").get(job.id)?.status !== "running") return true;
        logChannel(db, item, "email", "sent");
        item = updateItem(db, item.id, { ...item, status: "sending_email", emailStatus: "sent", emailError: null });
      } catch (err) {
        if (db.prepare("SELECT status FROM outbound_jobs WHERE id = ?").get(job.id)?.status !== "running") return true;
        const message = err instanceof Error ? err.message : String(err);
        logChannel(db, item, "email", "failed", message);
        item = updateItem(db, item.id, { ...item, status: "sending_email", emailStatus: "failed", emailError: message });
      }
      if (phone && item.whatsappMessage) {
        updateItem(db, item.id, { ...item, status: "waiting" });
        touchJob(db, job.id, {
          status: "running",
          nextRunAt: new Date(Date.now() + (Number(job.gapMs) || DEFAULT_GAP_MS)).toISOString(),
          error: null,
        });
        return true;
      }
      item = updateItem(db, item.id, {
        ...item,
        whatsappStatus: "skipped",
        whatsappError: phone ? null : "Missing or invalid WhatsApp number",
      });
      finishItem(db, job, item, { sentSomething: item.emailStatus === "sent" || item.emailStatus === "failed" });
      return true;
    }
  }

  const fresh = db.prepare("SELECT * FROM outbound_job_items WHERE id = ?").get(item.id);
  if (!fresh || fresh.status === "cancelled") return false;
  if (fresh.status !== "sending_whatsapp" && fresh.status !== "waiting" && fresh.status !== "pending") {
    item = fresh;
  } else {
    item = fresh;
  }

  if (!phone || !item.whatsappMessage) {
    item = updateItem(db, item.id, {
      ...item,
      whatsappStatus: "skipped",
      whatsappError: "Missing or invalid WhatsApp number",
    });
    finishItem(db, job, item, { sentSomething: item.emailStatus === "sent" || item.emailStatus === "failed" });
    return true;
  }

  updateItem(db, item.id, { ...item, status: "sending_whatsapp", whatsappStatus: "pending" });
  try {
    await sendWhatsApp(settings, item);
    if (db.prepare("SELECT status FROM outbound_jobs WHERE id = ?").get(job.id)?.status !== "running") return true;
    logChannel(db, item, "whatsapp", "sent");
    item = updateItem(db, item.id, { ...item, whatsappStatus: "sent", whatsappError: null });
  } catch (err) {
    if (db.prepare("SELECT status FROM outbound_jobs WHERE id = ?").get(job.id)?.status !== "running") return true;
    const message = err instanceof Error ? err.message : String(err);
    logChannel(db, item, "whatsapp", "failed", message);
    item = updateItem(db, item.id, { ...item, status: item.status, whatsappStatus: "failed", whatsappError: message });
  }
  finishItem(db, job, item, { sentSomething: true });
  return true;
}

function resumeInterrupted(db) {
  const sentWa = db
    .prepare(`SELECT * FROM outbound_job_items WHERE status = 'sending_whatsapp' AND whatsappStatus = 'sent'`)
    .all();
  for (const item of sentWa) {
    const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(item.jobId);
    if (job) finishItem(db, job, item, { sentSomething: true });
  }
  const stuck = db
    .prepare(
      `SELECT DISTINCT jobId FROM outbound_job_items
       WHERE status IN ('sending_email', 'sending_whatsapp')`,
    )
    .all();
  db.prepare(
    `UPDATE outbound_job_items SET status = 'pending'
     WHERE status = 'sending_email' AND COALESCE(emailStatus, 'pending') = 'pending'`,
  ).run();
  db.prepare(
    `UPDATE outbound_job_items SET status = 'waiting'
     WHERE status = 'sending_whatsapp' AND COALESCE(whatsappStatus, 'pending') = 'pending'`,
  ).run();
  db.prepare(
    `UPDATE outbound_job_items SET status = 'waiting'
     WHERE status = 'sending_email' AND emailStatus = 'sent' AND COALESCE(whatsappStatus, 'pending') = 'pending'`,
  ).run();
  for (const row of stuck) {
    db.prepare("UPDATE outbound_jobs SET nextRunAt = NULL, updatedAt = ? WHERE id = ? AND status = 'running'").run(
      new Date().toISOString(),
      row.jobId,
    );
  }
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const abandoned = db.prepare("SELECT id FROM outbound_jobs WHERE status = 'preparing' AND createdAt < ?").all(cutoff);
  for (const job of abandoned) {
    cancelJob(db, job.id, "Upload did not finish");
  }
}

function cancelJob(db, jobId, error) {
  const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(jobId);
  if (!job || job.status === "completed" || job.status === "cancelled") return job;
  const items = listItems(db, jobId);
  for (const item of items) {
    if (TERMINAL_ITEM.has(item.status)) continue;
    deletePdf(item.pdfPath);
    updateItem(db, item.id, { ...item, status: "cancelled", pdfPath: null });
  }
  touchJob(db, jobId, { status: "cancelled", nextRunAt: null, error: error || null });
  return db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(jobId);
}

function notify(broadcast, jobId, action) {
  try {
    broadcast({ type: "change", entity: "outbound_jobs", action, id: jobId });
  } catch {
    /* ignore */
  }
}

export function registerOutboundJobs(app, { db, broadcast }) {
  ensureSchema(db);
  resumeInterrupted(db);

  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const jobs = db.prepare("SELECT * FROM outbound_jobs WHERE status = 'running' ORDER BY createdAt ASC").all();
      for (const job of jobs) {
        const fresh = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(job.id);
        if (!fresh || fresh.status !== "running") continue;
        const changed = await stepJob(db, fresh);
        if (changed) notify(broadcast, fresh.id, "progress");
      }
    } catch (err) {
      console.error("[outbound-jobs]", err);
    } finally {
      ticking = false;
    }
  };
  setInterval(() => {
    void tick();
  }, TICK_MS);
  setTimeout(() => {
    void tick();
  }, 1500);

  app.get("/api/automation/outbound-jobs", (_req, res) => {
    const jobs = db.prepare("SELECT * FROM outbound_jobs ORDER BY createdAt DESC LIMIT 40").all();
    res.json(jobs.map((job) => jobSummary(db, job)));
  });

  app.get("/api/automation/outbound-jobs/:id", (req, res) => {
    const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    res.json({ ...jobSummary(db, job), items: listItems(db, job.id).map(itemPublic) });
  });

  app.post("/api/automation/outbound-jobs", (req, res) => {
    const body = req.body || {};
    const kind = body.kind === "broadcast" ? "broadcast" : "proposal_follow_up";
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ error: "Add at least one recipient" });
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const title = String(body.title || (kind === "broadcast" ? "Broadcast" : "Proposal follow-up")).slice(0, 180);
    const gapMs = Number(body.gapMs) > 0 ? Number(body.gapMs) : DEFAULT_GAP_MS;
    const insertJob = db.prepare(
      `INSERT INTO outbound_jobs (id, kind, title, status, gapMs, createdAt, updatedAt, createdByName, nextRunAt, error)
       VALUES (?, ?, ?, 'preparing', ?, ?, ?, ?, NULL, NULL)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO outbound_job_items (
        id, jobId, position, proposalId, proposalNumber, customerName, companyName, email, phone,
        emailSubject, emailBody, whatsappMessage, pdfPath, status, emailStatus, whatsappStatus, emailError, whatsappError, sentAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, NULL, NULL)`,
    );
    const createdItems = [];
    const tx = db.transaction(() => {
      insertJob.run(jobId, kind, title, gapMs, now, now, String(body.createdByName || "").slice(0, 120));
      items.forEach((raw, index) => {
        const id = randomUUID();
        const prepareError = String(raw.prepareError || "").trim();
        insertItem.run(
          id,
          jobId,
          index,
          raw.proposalId ? String(raw.proposalId) : null,
          String(raw.proposalNumber || ""),
          String(raw.customerName || ""),
          String(raw.companyName || ""),
          String(raw.email || "").trim(),
          String(raw.phone || "").trim(),
          String(raw.emailSubject || ""),
          String(raw.emailBody || ""),
          String(raw.whatsappMessage || ""),
          prepareError ? "failed" : "pending",
          prepareError || null,
        );
        createdItems.push({ id, position: index, prepareError: prepareError || null });
      });
    });
    tx();
    const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(jobId);
    notify(broadcast, jobId, "created");
    res.status(201).json({ ...jobSummary(db, job), items: createdItems });
  });

  app.post("/api/automation/outbound-jobs/:id/items/:itemId/pdf", upload.single("file"), (req, res) => {
    const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    if (job.status !== "preparing") return res.status(409).json({ error: "This queue has already started" });
    const item = db.prepare("SELECT * FROM outbound_job_items WHERE id = ? AND jobId = ?").get(req.params.itemId, job.id);
    if (!item) return res.status(404).json({ error: "Recipient not found" });
    if (!req.file?.buffer?.length) return res.status(400).json({ error: "PDF file is required" });
    const dir = path.join(PDF_DIR, job.id);
    fs.mkdirSync(dir, { recursive: true });
    const pdfPath = path.join(dir, `${item.id}.pdf`);
    fs.writeFileSync(pdfPath, req.file.buffer);
    updateItem(db, item.id, { ...item, pdfPath });
    res.json({ ok: true });
  });

  app.post("/api/automation/outbound-jobs/:id/start", (req, res) => {
    const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    if (job.status !== "preparing") return res.json(jobSummary(db, job));
    if (job.kind === "proposal_follow_up") {
      const missing = db
        .prepare(
          `SELECT COUNT(*) AS n FROM outbound_job_items
           WHERE jobId = ? AND status = 'pending' AND (pdfPath IS NULL OR pdfPath = '')`,
        )
        .get(job.id);
      if (Number(missing?.n || 0) > 0) {
        return res.status(400).json({ error: "Every follow-up still needs its proposal PDF" });
      }
    }
    touchJob(db, job.id, { status: "running", nextRunAt: null, error: null });
    const started = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(job.id);
    notify(broadcast, job.id, "started");
    setTimeout(() => {
      void tick();
    }, 200);
    res.json(jobSummary(db, started));
  });

  app.post("/api/automation/outbound-jobs/:id/cancel", (req, res) => {
    const job = db.prepare("SELECT * FROM outbound_jobs WHERE id = ?").get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    const cancelled = cancelJob(db, job.id, "Stopped");
    notify(broadcast, job.id, "cancelled");
    res.json(jobSummary(db, cancelled));
  });
}
