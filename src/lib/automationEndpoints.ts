import type { AutomationSettings } from "@/types/automation";

/**
 * WhatsApp `sendText` URL. In development, `/waha/*` is proxied by Vite to avoid CORS.
 * In production, the configured WAHA base URL must be used — relative `/waha/...` hits the
 * static host (nginx) and typically returns 405 Method Not Allowed.
 */
export function wahaSendTextUrl(settings: Pick<AutomationSettings, "wahaApiUrl">): string {
  if (import.meta.env.DEV) {
    return "/waha/api/sendText";
  }
  const base = settings.wahaApiUrl.trim().replace(/\/$/, "");
  return `${base}/api/sendText`;
}

/** n8n webhook for email/SMS tests — dev uses `/n8n` Vite proxy. */
export function n8nBuildeskEmailWebhookUrl(settings: Pick<AutomationSettings, "n8nWebhookBase">): string {
  if (import.meta.env.DEV) {
    return "/n8n/webhook/buildesk-email";
  }
  const base = settings.n8nWebhookBase.trim().replace(/\/$/, "");
  return `${base}/buildesk-email`;
}

/** n8n health webhook (Settings tab test). */
export function n8nBuildeskHealthWebhookUrl(settings: Pick<AutomationSettings, "n8nWebhookBase">): string {
  if (import.meta.env.DEV) {
    return "/n8n/webhook/buildesk-health";
  }
  const base = settings.n8nWebhookBase.trim().replace(/\/$/, "");
  return `${base}/buildesk-health`;
}
