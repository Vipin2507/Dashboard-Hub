/**
 * WAHA + n8n HTTP proxies — registered first so nginx/Express always see these paths.
 * HTTPS dashboards cannot call http:// WAHA/n8n (mixed content); browser → this API → upstream HTTP.
 *
 * Defaults match server/db.js seeds; override with WAHA_PUBLIC_URL / N8N_WEBHOOK_BASE on the host.
 */

function parseJsonSafe(raw, fallback = null) {
  try {
    return JSON.parse(raw);
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
  async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

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

  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   * @param {string | undefined} segmentOverride optional — use for explicit paths like `/webhook/buildesk-health` (hyphen in segment)
   */
  async function proxyN8nWebhook(req, res, segmentOverride) {
    try {
      const settings = getAutomationSettingsFromDb(db);
      const base = n8nBase(settings);
      const raw =
        segmentOverride != null && segmentOverride !== ""
          ? String(segmentOverride)
          : String(req.params?.segment || "");
      const segment = raw.replace(/[^a-zA-Z0-9._-]/g, "");
      if (!segment || segment !== raw) {
        return res.status(400).json({ error: "Invalid webhook name" });
      }
      const url = `${base}/${segment}`;

      const ct = String(req.headers["content-type"] || "");
      const isMultipart = ct.toLowerCase().includes("multipart/form-data");
      const isJson = ct.toLowerCase().includes("application/json");

      let body;
      const headers = { Accept: "application/json, text/plain" };

      if (isMultipart) {
        // Express doesn't parse multipart by default, so forward the raw body as-is.
        body = await readRawBody(req);
        headers["Content-Type"] = ct; // includes boundary
        if (req.headers["content-length"]) headers["Content-Length"] = String(req.headers["content-length"]);
      } else if (isJson) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(req.body ?? {});
      } else {
        // Fallback: forward raw body (useful for x-www-form-urlencoded, etc.)
        body = await readRawBody(req);
        if (ct) headers["Content-Type"] = ct;
        if (req.headers["content-length"]) headers["Content-Length"] = String(req.headers["content-length"]);
      }

      const upstream = await fetch(url, { method: "POST", headers, body });
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
      res.status(502).json({ error: String(e?.message || e) });
    }
  }

  function ping(_req, res) {
    res.json({ ok: true, module: "integrations", ts: new Date().toISOString() });
  }

  /** Browsers open links with GET; n8n webhooks use POST. Avoid Express "Cannot GET" for manual checks. */
  function n8nWebhookGet(req, res) {
    const segment = String(req.params.segment || "");
    res.json({
      ok: true,
      segment,
      methodExpected: "POST",
      hint:
        "The app calls this URL with POST JSON. Use Automation → Settings → “Test connection” to hit n8n.",
    });
  }

  function n8nWebhookGetFixed(segment) {
    return (_req, res) => {
      res.json({
        ok: true,
        segment,
        methodExpected: "POST",
        hint:
          "The app calls this URL with POST JSON. Use Automation → Settings → “Test connection” to hit n8n.",
      });
    };
  }

  // Explicit app.* routes (avoid relying only on Router — works across Express 4/5 and odd proxies)
  app.post("/api/integrations/waha/sendText", proxyWahaSendText);
  app.post("/integrations/waha/sendText", proxyWahaSendText);
  app.get("/api/integrations/waha/sessions", proxyWahaSessions);
  app.get("/integrations/waha/sessions", proxyWahaSessions);

  // Explicit n8n paths (some Express/nginx setups mishandle :segment with hyphens)
  app.post("/api/integrations/n8n/webhook/buildesk-health", (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-health");
  });
  app.post("/api/integrations/n8n/webhook/buildesk-email", (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-email");
  });
  app.post("/integrations/n8n/webhook/buildesk-health", (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-health");
  });
  app.post("/integrations/n8n/webhook/buildesk-email", (req, res) => {
    void proxyN8nWebhook(req, res, "buildesk-email");
  });
  app.get("/api/integrations/n8n/webhook/buildesk-health", n8nWebhookGetFixed("buildesk-health"));
  app.get("/api/integrations/n8n/webhook/buildesk-email", n8nWebhookGetFixed("buildesk-email"));
  app.get("/integrations/n8n/webhook/buildesk-health", n8nWebhookGetFixed("buildesk-health"));
  app.get("/integrations/n8n/webhook/buildesk-email", n8nWebhookGetFixed("buildesk-email"));

  app.post("/api/integrations/n8n/webhook/:segment", (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });
  app.post("/integrations/n8n/webhook/:segment", (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });
  app.get("/api/integrations/n8n/webhook/:segment", n8nWebhookGet);
  app.get("/integrations/n8n/webhook/:segment", n8nWebhookGet);
  app.get("/api/integrations/ping", ping);
  app.get("/integrations/ping", ping);

  console.log(
    "[integrations] WAHA/n8n proxies active — POST /api/integrations/waha/sendText, GET /api/integrations/ping",
  );
}
