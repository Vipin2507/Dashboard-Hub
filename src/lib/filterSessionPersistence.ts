/** Session-scoped applied filter blobs (cleared when the browser tab closes). */
export const FILTER_SESSION_KEYS = {
  dashboard: "ui:dashboard:appliedFilters",
  proposals: "ui:proposals:appliedFilters",
  customers: "ui:customers:appliedFilters",
  deals: "ui:deals:appliedFilters",
  inventory: "ui:inventory:appliedFilters",
  paymentsHistory: "ui:payments:historyAppliedFilters",
  executivePerformance: "ui:executive-performance:appliedFilters",
  delivery: "ui:delivery:appliedFilters",
} as const;

export type FilterSessionKey = (typeof FILTER_SESSION_KEYS)[keyof typeof FILTER_SESSION_KEYS];

export function loadSessionFilters<T>(key: FilterSessionKey): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSessionFilters<T>(key: FilterSessionKey, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function clearSessionFilters(key: FilterSessionKey): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasAnySearchParam(params: URLSearchParams, keys: string[]): boolean {
  return keys.some((k) => params.has(k));
}

/** Cross-tab applied filters (survive remount + other browser tabs in this origin). */
export function loadLocalFilters<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalFilters<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function clearLocalFilters(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
