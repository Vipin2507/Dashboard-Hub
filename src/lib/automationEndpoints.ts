import { apiUrl } from "@/lib/api";
import type { AutomationSettings } from "@/types/automation";

function isBrowserHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/**
 * Calls the Node integration proxy (`/api/integrations/...`). If that returns 404 (API host not
 * updated / wrong service), retries the same path on the **current page origin** so nginx on the
 * dashboard host can proxy to WAHA/n8n without changing VITE_API_BASE_URL.
 *
 * Optional: `VITE_INTEGRATIONS_FALLBACK_ORIGIN` (e.g. https://dashboard.buildesk.ae) for a third try.
 */
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
    if (last.status !== 404) return last;
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
