import { API_BASE_URL, apiUrlWithBase } from "@/lib/api";
import type { AutomationSettings } from "@/types/automation";

function isBrowserHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/**
 * Calls the Node integration proxy (`/api/integrations/...`). Retries on **404 or 405**.
 *
 * Builds URLs from **several bases** so we don't dedupe away a second try when
 * `VITE_API_BASE_URL` equals the dashboard origin (then POST only hit nginx SPA → 405).
 *
 * Bases: `VITE_API_BASE_URL`, page origin, `VITE_API_INTEGRATIONS_ALT_HOST` (e.g. api subdomain),
 * `VITE_INTEGRATIONS_FALLBACK_ORIGIN`.
 */
function shouldRetryIntegration(status: number): boolean {
  return status === 404 || status === 405;
}

export async function fetchIntegrationProxy(path: string, init?: RequestInit): Promise<Response> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const bases = new Set<string>();
  const main = API_BASE_URL.replace(/\/$/, "");
  if (main) bases.add(main);
  if (typeof window !== "undefined") bases.add(window.location.origin);
  const alt = (import.meta.env.VITE_API_INTEGRATIONS_ALT_HOST as string | undefined)?.replace(/\/$/, "");
  if (alt) bases.add(alt);
  const fb = (import.meta.env.VITE_INTEGRATIONS_FALLBACK_ORIGIN as string | undefined)?.replace(/\/$/, "");
  if (fb) bases.add(fb);

  const urls: string[] = [];
  for (const b of bases) {
    const u = apiUrlWithBase(b, normalized);
    if (!urls.includes(u)) urls.push(u);
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
