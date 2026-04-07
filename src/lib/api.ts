/**
 * Where the SPA sends `/api/...` requests.
 * - If `VITE_API_BASE_URL` is set at build time, that origin is used (e.g. `https://api.buildesk.ae`).
 * - **Dev:** defaults to `http://localhost:4000`.
 * - **Production without env:** uses same-origin (`""`) so `/api/users` hits the host that served the
 *   SPA (nginx → Node). **A build that still pointed at `localhost` never reached your VPS API** and
 *   kept showing bundled seed data.
 */
function resolveApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env != null && String(env).trim() !== "") {
    return String(env).replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:4000";
  }
  return "";
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Builds an absolute API URL. If `VITE_API_BASE_URL` already ends with `/api` (common when the
 * API is mounted at `https://host/api`), do not duplicate `/api` when `path` starts with `/api/…`.
 */
/** Same rules as `apiUrl`, but for an arbitrary origin (used for integration fallbacks). */
export function apiUrlWithBase(baseUrl: string, path: string): string {
  let normalized = path.startsWith("/") ? path : `/${path}`;
  const base = baseUrl.replace(/\/$/, "");
  if (base.endsWith("/api") && normalized.startsWith("/api")) {
    normalized = normalized.slice(4) || "/";
    if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  }
  return `${base}${normalized}`;
}

export function apiUrl(path: string): string {
  return apiUrlWithBase(API_BASE_URL, path);
}

function toApiPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/api")) return normalized;
  return `/api${normalized}`;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = text || res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      message = j.error || j.message || message;
    } catch {
      /* use raw text */
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Typed REST helpers — paths are relative to `/api` (e.g. `'/proposals'`, `'/deals'`).
 */
export const api = {
  get: async <T>(path: string): Promise<T> => {
    const res = await fetch(apiUrl(toApiPath(path)));
    return parseResponse<T>(res);
  },
  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(apiUrl(toApiPath(path)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return parseResponse<T>(res);
  },
  put: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(apiUrl(toApiPath(path)), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return parseResponse<T>(res);
  },
  patch: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(apiUrl(toApiPath(path)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return parseResponse<T>(res);
  },
  delete: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(apiUrl(toApiPath(path)), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return parseResponse<T>(res);
  },
};

