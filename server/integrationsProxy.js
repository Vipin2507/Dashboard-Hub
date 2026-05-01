import multer from 'multer';

/**
 * Buildesk CRM Integration Proxy V5 (Ultimate)
 * Identity: V5-REDACTED-SHADOWS
 * Specifically designed to eliminate empty-body JSON fall-throughs.
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
    // LOUD LOGGING - This MUST appear in your PM2 logs
    const segment = (segmentOverride || req.params?.segment || "").replace(/[^a-zA-Z0-9._-]/g, "");
    console.log(`[V5-DEBUG] Hit /${segment} | Files: ${req.files?.length || 0} | Body Keys: ${Object.keys(req.body || {}).join(',')}`);

    try {
      const settings = getAutomationSettingsFromDb(db);
      const url = `${n8nBase(settings)}/${segment}`;

      const formData = new FormData();

      // 1. Pack all text fields
      if (req.body) {
        Object.keys(req.body).forEach(key => {
          formData.append(key, req.body[key]);
        });
      }

      // 2. Pack the PDF (proposal_pdf)
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append(file.fieldname, blob, file.originalname);
          console.log(`[V5-DEBUG] Appending file: ${file.fieldname} (${file.size} bytes)`);
        });
      }

      // 3. Send to n8n (NO manual Content-Type header)
      const upstream = await fetch(url, {
        method: "POST",
        body: formData,
        headers: { "Accept": "application/json, text/plain" }
      });

      const responseText = await upstream.text();
      console.log(`[V5-DEBUG] n8n status: ${upstream.status}`);

      return res.status(upstream.status)
                .type(upstream.headers.get("content-type") || "application/json")
                .send(responseText);

    } catch (e) {
      console.error("[V5-ERROR]:", e.message);
      res.status(502).json({ error: e.message });
    }
  }

  // Define specific routes FIRST to avoid shadowing
  app.post("/api/integrations/n8n/webhook/buildesk-email", multipartHandler, (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-email");
  });

  app.post("/api/integrations/n8n/webhook/:segment", multipartHandler, (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });

  app.get("/api/integrations/ping", (req, res) => res.json({ ok: true, version: "V5-REDACTED-SHADOWS" }));

  console.log("[integrations] Proxy V5-REDACTED-SHADOWS is fully armed and active.");
}