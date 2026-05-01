/**
 * WAHA + n8n HTTP proxies — registered first so nginx/Express always see these paths.
 * HTTPS dashboards cannot call http:// WAHA/n8n (mixed content); browser → this API → upstream HTTP.
 *
 * Defaults match server/db.js seeds; override with WAHA_PUBLIC_URL / N8N_WEBHOOK_BASE on the host.
 *
 * **n8n webhooks** must be registered *before* `express.json()` / `express.urlencoded()` in `server/index.js`
 * (see `registerN8nWebhookProxyEarly`). Otherwise multipart bodies can be mishandled and the proxy
 * forwards an empty `{}` JSON payload to n8n.
 */

import os from "node:os";

/** Bump when changing proxy behaviour — visible on GET webhook URL and in POST response headers (unless stripped by nginx). */
export const N8N_WEBHOOK_PROXY_VERSION = "n8n-raw-v4";

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

/**
 * Read the full request stream into a Buffer (no express.raw quirks on mounted paths / some proxies).
 * Must run on routes registered **before** `express.json()` / `express.urlencoded()` in server/index.js.
 */
async function captureN8nWebhookRawBody(req, _res, next) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    req.body = Buffer.concat(chunks);
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Register n8n webhook POST proxies **before** `app.use(express.json())` in server/index.js.
 * Forwards JSON or multipart (proposal PDF) bytes verbatim to n8n.
 */
export function registerN8nWebhookProxyEarly(app, { db }) {
  console.log(`[buildesk] registerN8nWebhookProxyEarly mounted (${N8N_WEBHOOK_PROXY_VERSION})`);

  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   * @param {string | undefined} segmentOverride
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
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      if (buf.length === 0) {
        return res.status(400).json({
          error: "Empty webhook body",
          hint:
            "The Node integration proxy received no bytes. Redeploy the API server with the latest server/index.js + server/integrationsProxy.js. If you use nginx, ensure POST /api/integrations/n8n/webhook/* is proxied to Node (not directly to n8n) and client_max_body_size is large enough for PDFs.",
        });
      }

      const headers = {
        Accept: "application/json, text/plain",
        ...(ct ? { "Content-Type": ct } : {}),
        "Content-Length": String(buf.length),
      };

      const upstream = await fetch(url, { method: "POST", headers, body: buf });
      const responseBuf = await upstream.text();
      const upstreamCt = upstream.headers.get("content-type") || "";
      res.set("X-Buildesk-Integration-Proxy", N8N_WEBHOOK_PROXY_VERSION);
      res.set("X-Buildesk-N8n-Proxy-Bytes", String(buf.length));
      res.set("Access-Control-Expose-Headers", "X-Buildesk-Integration-Proxy, X-Buildesk-N8n-Proxy-Bytes");
      res.status(upstream.status);
      if (upstreamCt.includes("application/json")) {
        try {
          return res.json(JSON.parse(responseBuf || "{}"));
        } catch {
          return res.type("text/plain").send(responseBuf);
        }
      }
      return res.type(upstreamCt || "text/plain").send(responseBuf);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  }

  const emailPaths = [
    "/api/integrations/n8n/webhook/buildesk-email",
    "/integrations/n8n/webhook/buildesk-email",
  ];
  const healthPaths = [
    "/api/integrations/n8n/webhook/buildesk-health",
    "/integrations/n8n/webhook/buildesk-health",
  ];
  for (const p of emailPaths) {
    app.post(p, captureN8nWebhookRawBody, (req, res) => {
      void proxyN8nWebhook(req, res, "buildesk-email");
    });
  }
  for (const p of healthPaths) {
    app.post(p, captureN8nWebhookRawBody, (req, res) => {
      void proxyN8nWebhook(req, res, "buildesk-health");
    });
  }

  app.post("/api/integrations/n8n/webhook/:segment", captureN8nWebhookRawBody, (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });
  app.post("/integrations/n8n/webhook/:segment", captureN8nWebhookRawBody, (req, res) => {
    void proxyN8nWebhook(req, res, undefined);
  });
}

export function registerIntegrationProxies(app, { db }) {
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

  function ping(_req, res) {
    res.json({
      ok: true,
      module: "integrations",
      ts: new Date().toISOString(),
      n8nProxyVersion: N8N_WEBHOOK_PROXY_VERSION,
      hostname: os.hostname(),
      pid: process.pid,
    });
  }

  /** Browsers open links with GET; n8n webhooks use POST. Avoid Express "Cannot GET" for manual checks. */
  function n8nWebhookGet(req, res) {
    const segment = String(req.params.segment || "");
    res.json({
      ok: true,
      segment,
      methodExpected: "POST",
      integrationProxyVersion: N8N_WEBHOOK_PROXY_VERSION,
      hint:
        "The app calls this URL with POST JSON or multipart. Use Automation → Settings → “Test connection” to hit n8n. Open this URL with GET in a browser to confirm which API build is running.",
    });
  }

  function n8nWebhookGetFixed(segment) {
    return (_req, res) => {
      res.json({
        ok: true,
        segment,
        methodExpected: "POST",
        integrationProxyVersion: N8N_WEBHOOK_PROXY_VERSION,
        hint:
          "The app calls this URL with POST JSON or multipart. Use Automation → Settings → “Test connection” to hit n8n. Open this URL with GET in a browser to confirm which API build is running.",
      });
    };
  }

  // Explicit app.* routes (avoid relying only on Router — works across Express 4/5 and odd proxies)
  app.post("/api/integrations/waha/sendText", proxyWahaSendText);
  app.post("/integrations/waha/sendText", proxyWahaSendText);
  app.get("/api/integrations/waha/sessions", proxyWahaSessions);
  app.get("/integrations/waha/sessions", proxyWahaSessions);

  // n8n POST webhooks are registered in registerN8nWebhookProxyEarly (before express.json).

  app.get("/api/integrations/n8n/webhook/buildesk-health", n8nWebhookGetFixed("buildesk-health"));
  app.get("/api/integrations/n8n/webhook/buildesk-email", n8nWebhookGetFixed("buildesk-email"));
  app.get("/integrations/n8n/webhook/buildesk-health", n8nWebhookGetFixed("buildesk-health"));
  app.get("/integrations/n8n/webhook/buildesk-email", n8nWebhookGetFixed("buildesk-email"));

  app.get("/api/integrations/n8n/webhook/:segment", n8nWebhookGet);
  app.get("/integrations/n8n/webhook/:segment", n8nWebhookGet);
  app.get("/api/integrations/ping", ping);
  app.get("/integrations/ping", ping);

  console.log(
    "[integrations] WAHA/n8n proxies active — POST /api/integrations/waha/sendText, GET /api/integrations/ping",
  );
}
