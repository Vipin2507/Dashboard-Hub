import { apiUrl } from "@/lib/api";
import type { AutomationSettings } from "@/types/automation";

function isBrowserHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/**
 * WhatsApp `sendText` URL.
 * - Dev: Vite proxies `/waha/*` to WAHA (CORS).
 * - Prod HTTPS page: same-origin API proxy (`/api/integrations/waha/sendText`) so the browser never
 *   calls `http://` WAHA (mixed content blocked).
 * - Prod HTTP / non-browser: direct WAHA URL from settings.
 */
export function wahaSendTextUrl(settings: Pick<AutomationSettings, "wahaApiUrl">): string {
  if (import.meta.env.DEV) {
    return "/waha/api/sendText";
  }
  if (isBrowserHttps()) {
    return apiUrl("/api/integrations/waha/sendText");
  }
  const base = settings.wahaApiUrl.trim().replace(/\/$/, "");
  return `${base}/api/sendText`;
}

/** WAHA session list (Settings → Test connection). Same proxy rules as `wahaSendTextUrl`. */
export function wahaSessionsUrl(settings: Pick<AutomationSettings, "wahaApiUrl">): string {
  if (import.meta.env.DEV) {
    return "/waha/api/sessions";
  }
  if (isBrowserHttps()) {
    return apiUrl("/api/integrations/waha/sessions");
  }
  const base = settings.wahaApiUrl.trim().replace(/\/$/, "");
  return `${base}/api/sessions`;
}

/** n8n webhook URL (e.g. segment `buildesk-email`). Dev: Vite `/n8n` proxy; prod HTTPS: API proxy. */
export function n8nWebhookUrl(settings: Pick<AutomationSettings, "n8nWebhookBase">, segment: string): string {
  if (import.meta.env.DEV) {
    return `/n8n/webhook/${segment}`;
  }
  if (isBrowserHttps()) {
    return apiUrl(`/api/integrations/n8n/webhook/${segment}`);
  }
  const base = settings.n8nWebhookBase.trim().replace(/\/$/, "");
  return `${base}/${segment}`;
}

export function n8nBuildeskEmailWebhookUrl(settings: Pick<AutomationSettings, "n8nWebhookBase">): string {
  return n8nWebhookUrl(settings, "buildesk-email");
}

export function n8nBuildeskHealthWebhookUrl(settings: Pick<AutomationSettings, "n8nWebhookBase">): string {
  return n8nWebhookUrl(settings, "buildesk-health");
}
