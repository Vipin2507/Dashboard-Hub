import { API_BASE_URL, apiUrlWithBase } from "@/lib/api";
import type { AutomationSettings } from "@/types/automation";

function isBrowserHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/**
 * Calls the Node integration proxy (`/api/integrations/...`). Retries on **404 or 405**.
 *
 * **Order matters:** try the real API host before `window.location.origin` (dashboard). Otherwise
 * the first request goes to dashboard nginx → POST `/api/...` often hits SPA `try_files` → **405**.
 */
function shouldRetryIntegration(status: number): boolean {
  return status === 404 || status === 405;
}

function orderedIntegrationBases(): string[] {
  const raw = [
    import.meta.env.VITE_API_INTEGRATIONS_ALT_HOST as string | undefined,
    API_BASE_URL,
    import.meta.env.VITE_INTEGRATIONS_FALLBACK_ORIGIN as string | undefined,
    // Dashboard nginx often returns 405 for POST /api/… (SPA). Omit unless you proxy /api on dashboard.
    ...(import.meta.env.VITE_INTEGRATIONS_INCLUDE_DASHBOARD_ORIGIN === "true" && typeof window !== "undefined"
      ? [window.location.origin]
      : []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const b = r?.replace(/\/$/, "").trim();
    if (!b || seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

export async function fetchIntegrationProxy(path: string, init?: RequestInit): Promise<Response> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const urls: string[] = [];
  for (const b of orderedIntegrationBases()) {
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
