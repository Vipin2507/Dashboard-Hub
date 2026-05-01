import multer from 'multer';

/**
 * Buildesk CRM Integration Proxy V4
 * Optimized for Node 20+ using native FormData for n8n/WAHA forwarding.
 */

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

function n8nBase(settings) {
  const fromDb = String(settings.n8nWebhookBase || "").trim().replace(/\/$/, "");
  return fromDb || String(process.env.N8N_WEBHOOK_BASE || "http://72.60.200.185:5678/webhook").replace(/\/$/, "");
}

export function registerIntegrationProxies(app, { db }) {
  
  const multipartHandler = upload.any();

  async function proxyN8nWebhook(req, res, segmentOverride) {
    try {
      const settings = getAutomationSettingsFromDb(db);
      const base = n8nBase(settings);
      const segment = (segmentOverride || req.params?.segment || "").replace(/[^a-zA-Z0-9._-]/g, "");
      const url = `${base}/${segment}`;

      // DEBUG LOGS - Check your PM2 logs for these!
      console.log(`[Proxy] Incoming to: ${segment}`);
      console.log(`[Proxy] Files received: ${req.files ? req.files.length : 0}`);
      console.log(`[Proxy] Body keys: ${Object.keys(req.body || {}).join(', ')}`);

      // Use native Node.js FormData (Node 18+)
      const formData = new FormData();

      // 1. Forward all text fields
      if (req.body) {
        Object.keys(req.body).forEach(key => {
          formData.append(key, req.body[key]);
        });
      }

      // 2. Forward all files
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          // Convert buffer to Blob for native fetch compatibility
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append(file.fieldname, blob, file.originalname);
        });
      }

      // 3. Forward to n8n using native fetch
      // NOTE: Do NOT set Content-Type header; fetch sets it with the boundary automatically.
      const upstream = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          "Accept": "application/json, text/plain"
        }
      });

      const responseText = await upstream.text();
      console.log(`[Proxy] n8n Response: ${upstream.status}`);

      return res.status(upstream.status)
                .type(upstream.headers.get("content-type") || "application/json")
                .send(responseText);

    } catch (e) {
      console.error("[Proxy Error]:", e.message);
      res.status(502).json({ error: e.message });
    }
  }

  // Route Registration
  app.post("/api/integrations/n8n/webhook/buildesk-email", multipartHandler, (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-email");
  });

  app.post("/api/integrations/n8n/webhook/:segment", multipartHandler, (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });

  console.log("[integrations] Proxy V4 Active - Native FormData mode.");
}