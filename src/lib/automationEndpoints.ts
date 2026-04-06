import { apiUrl } from "@/lib/api";
import type { AutomationSettings } from "@/types/automation";

function isBrowserHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/**
 * Calls the Node integration proxy (`/api/integrations/...`). Retries on **404 or 405** so that:
 * - 404: API host missing routes
 * - 405: nginx served POST with SPA `location /` + `try_files` (POST not allowed) — try next origin
 *
 * Optional: `VITE_INTEGRATIONS_FALLBACK_ORIGIN` for a third try.
 */
function shouldRetryIntegration(status: number): boolean {
  return status === 404 || status === 405;
}

export async function fetchIntegrationProxy(path: string, init?: RequestInit): Promise<Response> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const urls: string[] = [];
  const add = (u: string) => {
    if (!urls.includes(u)) urls.push(u);
  };
  add(apiUrl(normalized));
  if (typeof window !== "undefined") {
    add(`${window.location.origin}${normalized}`);
    const fb = (import.meta.env.VITE_INTEGRATIONS_FALLBACK_ORIGIN as string | undefined)?.replace(/\/$/, "");
    if (fb) add(`${fb}${normalized}`);
  }
  let last: Response | undefined;
  for (const url of urls) {
    last = await fetch(url, init);
    if (!shouldRetryIntegration(last.status)) return last;
  }
  return last!;
}

export async function fetchWahaSendText(
  settings: Pick<AutomationSettings, "wahaApiUrl">,
  init: RequestInit,
): Promise<Response> {
  if (import.meta.env.DEV) {
    return fetch("/waha/api/sendText", init);
  }
  if (isBrowserHttps()) {
    return fetchIntegrationProxy("/api/integrations/waha/sendText", init);
  }
  const base = settings.wahaApiUrl.trim().replace(/\/$/, "");
  return fetch(`${base}/api/sendText`, init);
}

export async function fetchWahaSessions(
  settings: Pick<AutomationSettings, "wahaApiUrl">,
  init?: RequestInit,
): Promise<Response> {
  if (import.meta.env.DEV) {
    return fetch("/waha/api/sessions", init);
  }
  if (isBrowserHttps()) {
    return fetchIntegrationProxy("/api/integrations/waha/sessions", init);
  }
  const base = settings.wahaApiUrl.trim().replace(/\/$/, "");
  return fetch(`${base}/api/sessions`, init);
}

export async function fetchN8nWebhook(
  settings: Pick<AutomationSettings, "n8nWebhookBase">,
  segment: string,
  init: RequestInit,
): Promise<Response> {
  if (import.meta.env.DEV) {
    return fetch(`/n8n/webhook/${segment}`, init);
  }
  if (isBrowserHttps()) {
    return fetchIntegrationProxy(`/api/integrations/n8n/webhook/${segment}`, init);
  }
  const base = settings.n8nWebhookBase.trim().replace(/\/$/, "");
  return fetch(`${base}/${segment}`, init);
}
