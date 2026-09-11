/** Minimum (and default) setup & configuration charge applied to proposals (₹). */
export const MANDATORY_SETUP_CONFIGURATION_COST = 10_000;

export const MANDATORY_SETUP_CONFIGURATION_LABEL = "Setup & Configuration Cost";

/** Default PDF "Service" column value for setup & configuration. */
export const DEFAULT_SETUP_SERVICE_LABEL = "One Time";

export function setupServiceLabelForPdf(label?: string | null): string {
  const trimmed = String(label ?? "").trim();
  return trimmed || DEFAULT_SETUP_SERVICE_LABEL;
}

/** Editable setup charge — never below the mandatory minimum. */
export function normalizeSetupConfigurationCost(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < MANDATORY_SETUP_CONFIGURATION_COST) {
    return MANDATORY_SETUP_CONFIGURATION_COST;
  }
  return n;
}
