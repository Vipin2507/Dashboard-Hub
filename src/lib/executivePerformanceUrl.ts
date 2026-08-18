import {
  hydrateTimeRange,
  isTimeRangePreset,
  parseTimeRangeFromSearchParams,
  resolveTimeRangeYmd,
  type TimeRangePreset,
} from "@/lib/dateRange";

export type ExecutiveUrlFilters = {
  range: TimeRangePreset;
  from: string;
  to: string;
  executiveId: string;
  teamId: string;
  regionId: string;
  weekday: string;
  reasonType: string;
  reason: string;
};

export function normalizeExecutiveFilters(raw: Partial<ExecutiveUrlFilters>): ExecutiveUrlFilters {
  const hydrated = hydrateTimeRange({
    timeRangeFilter: raw.range,
    dateFrom: raw.from ?? "",
    dateTo: raw.to ?? "",
  });
  const resolved = resolveTimeRangeYmd(hydrated.preset, hydrated.customFrom, hydrated.customTo);
  return {
    range: hydrated.preset,
    from: resolved.from,
    to: resolved.to,
    executiveId: raw.executiveId || "all",
    teamId: raw.teamId || "all",
    regionId: raw.regionId || "all",
    weekday: raw.weekday || "all",
    reasonType: raw.reasonType || "all",
    reason: raw.reason || "all",
  };
}

export function readExecutiveFiltersFromParams(params: URLSearchParams): ExecutiveUrlFilters {
  const parsed = parseTimeRangeFromSearchParams(params);
  const rangePart = parsed ?? { preset: "this_month" as TimeRangePreset, customFrom: "", customTo: "" };
  return normalizeExecutiveFilters({
    range: rangePart.preset,
    from: rangePart.preset === "custom" ? rangePart.customFrom : "",
    to: rangePart.preset === "custom" ? rangePart.customTo : "",
    executiveId: params.get("executive") || "all",
    teamId: params.get("team") || "all",
    regionId: params.get("region") || "all",
    weekday: params.get("weekday") || "all",
    reasonType: params.get("reasonType") || "all",
    reason: params.get("reason") || "all",
  });
}

export function executiveFiltersToSearchParams(
  f: ExecutiveUrlFilters,
  tab: string,
): URLSearchParams {
  const p = new URLSearchParams();
  const range = isTimeRangePreset(f.range) ? f.range : !f.from && !f.to ? "all" : "custom";
  if (range === "all") {
    p.set("range", "all");
  } else if (range === "custom") {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  } else {
    p.set("range", range);
  }
  if (f.executiveId !== "all") p.set("executive", f.executiveId);
  if (f.teamId !== "all") p.set("team", f.teamId);
  if (f.regionId !== "all") p.set("region", f.regionId);
  if (f.weekday !== "all") p.set("weekday", f.weekday);
  if (f.reasonType !== "all") p.set("reasonType", f.reasonType);
  if (f.reason !== "all") p.set("reason", f.reason);
  if (tab !== "overview") p.set("tab", tab);
  return p;
}
