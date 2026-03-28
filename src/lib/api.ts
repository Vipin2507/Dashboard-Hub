export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
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

