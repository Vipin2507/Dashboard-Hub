import multer from 'multer';
import express from 'express';

/**
 * Buildesk CRM Integration Proxy — Full Updated Version
 * Includes WAHA proxies, n8n multipart forwarding, and DB-driven settings.
 */

// Initialize Multer for memory storage to handle multipart (PDFs/Files)
const upload = multer({ storage: multer.memoryStorage() });

function parseJsonSafe(raw, fallback = null) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function getAutomationSettingsFromDb(db) {
  const row = db.prepare("SELECT data FROM automation_settings WHERE id = 1").get();
  return row ? parseJsonSafe(row.data, {}) : {};
}

function wahaBase(settings) {
  const fromDb = String(settings.wahaApiUrl || "").trim().replace(/\/$/, "");
  if (fromDb) return fromDb;
  return String(process.env.WAHA_PUBLIC_URL || "http://72.60.200.185:3000").replace(/\/$/, "");
}

function n8nBase(settings) {
  const fromDb = String(settings.n8nWebhookBase || "").trim().replace(/\/$/, "");
  if (fromDb) return fromDb;
  return String(process.env.N8N_WEBHOOK_BASE || "http://72.60.200.185:5678/webhook").replace(/\/$/, "");
}

export function registerIntegrationProxies(app, { db }) {
  
  const multipartHandler = upload.any();
  const jsonHandler = express.json({ limit: "5mb" });

  // --- WAHA PROXY LOGIC ---

  async function proxyWahaSendText(req, res) {
    try {
      const settings = getAutomationSettingsFromDb(db);
      const base = wahaBase(settings);
      const url = `${base}/api/sendText`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Api-Key": String(settings.wahaApiKey || process.env.WAHA_API_KEY || ""),
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const buf = await upstream.text();
      const ct = upstream.headers.get("content-type") || "";
      res.status(upstream.status);
      if (ct.includes("application/json")) {
        try {
          return res.json(JSON.parse(buf || "{}"));
        } catch {
          return res.type("text/plain").send(buf);
        }
      }
      return res.type(ct || "text/plain").send(buf);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  }

  async function proxyWahaSessions(_req, res) {
    try {
      const settings = getAutomationSettingsFromDb(db);
      const base = wahaBase(settings);
      const url = `${base}/api/sessions`;
      const upstream = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Api-Key": String(settings.wahaApiKey || process.env.WAHA_API_KEY || ""),
        },
      });
      const buf = await upstream.text();
      res.status(upstream.status);
      try {
        return res.json(JSON.parse(buf || "[]"));
      } catch {
        return res.type("text/plain").send(buf);
      }
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  }

  // --- n8n PROXY LOGIC (REPAIRED) ---

  async function proxyN8nWebhook(req, res, segmentOverride) {
    try {
      const settings = getAutomationSettingsFromDb(db);
      const base = n8nBase(settings);
      const raw = segmentOverride != null && segmentOverride !== ""
          ? String(segmentOverride)
          : String(req.params?.segment || "");
      
      const segment = raw.replace(/[^a-zA-Z0-9._-]/g, "");
      const url = `${base}/${segment}`;

      // Use native FormData for Node 20 high-fidelity forwarding
      const formData = new FormData();

      // 1. Forward all text fields parsed by Multer
      if (req.body) {
        Object.keys(req.body).forEach(key => {
          formData.append(key, req.body[key]);
        });
      }

      // 2. Forward all binary files (Proposal PDFs, etc.)
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append(file.fieldname, blob, file.originalname);
        });
      }

      const upstream = await fetch(url, {
        method: "POST",
        body: formData, // fetch automatically sets the boundary
        headers: { "Accept": "application/json, text/plain" }
      });

      const buf = await upstream.text();
      const upstreamCt = upstream.headers.get("content-type") || "";
      res.status(upstream.status);

      if (upstreamCt.includes("application/json")) {
        try {
          return res.json(JSON.parse(buf || "{}"));
        } catch {
          return res.type("text/plain").send(buf);
        }
      }
      return res.type(upstreamCt || "text/plain").send(buf);
    } catch (e) {
      console.error("[Proxy-Error]:", e.message);
      res.status(502).json({ error: String(e?.message || e) });
    }
  }

  // --- UTILITY HANDLERS ---

  function ping(_req, res) {
    res.json({ ok: true, module: "integrations", version: "V6-Stable", ts: new Date().toISOString() });
  }

  function n8nWebhookGetFixed(segment) {
    return (_req, res) => {
      res.json({
        ok: true,
        segment,
        methodExpected: "POST",
        hint: "The app calls this URL with POST JSON/Multipart. Use Automation Settings to test.",
      });
    };
  }

  // --- ROUTE REGISTRATION ---

  // WAHA Routes (Standard JSON)
  // NOTE: These proxy routes are registered before the global body parsers in `server/index.js`,
  // so we must attach a JSON parser here; otherwise `req.body` is always empty `{}`.
  app.post("/api/integrations/waha/sendText", jsonHandler, proxyWahaSendText);
  app.post("/integrations/waha/sendText", jsonHandler, proxyWahaSendText);
  app.get("/api/integrations/waha/sessions", proxyWahaSessions);
  app.get("/integrations/waha/sessions", proxyWahaSessions);

  // n8n Routes (Multipart/Form-Data Supported)
  // IMPORTANT: n8n webhooks can be sent as JSON (no attachments) OR multipart (PDF attachments).
  // Use a content-type aware parser so we don't drop JSON bodies on the floor.
  const n8nBodyHandler = (req, res, next) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (ct.includes("multipart/form-data")) return multipartHandler(req, res, next);
    return jsonHandler(req, res, next);
  };

  app.post("/api/integrations/n8n/webhook/buildesk-health", n8nBodyHandler, (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-health");
  });
  app.post("/api/integrations/n8n/webhook/buildesk-email", n8nBodyHandler, (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-email");
  });
  app.post("/api/integrations/n8n/webhook/:segment", n8nBodyHandler, (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });

  // GET Handlers for manual checks
  app.get("/api/integrations/n8n/webhook/buildesk-health", n8nWebhookGetFixed("buildesk-health"));
  app.get("/api/integrations/n8n/webhook/buildesk-email", n8nWebhookGetFixed("buildesk-email"));
  app.get("/api/integrations/ping", ping);
  app.get("/integrations/ping", ping);

  console.log("[integrations] Full Proxy V6-Stable Active — WAHA + n8n Multipart Ready.");
}