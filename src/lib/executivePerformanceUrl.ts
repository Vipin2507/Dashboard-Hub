import { yearToDateYmd } from "@/lib/dateRange";

export type ExecutiveUrlFilters = {
  from: string;
  to: string;
  executiveId: string;
  teamId: string;
  regionId: string;
  weekday: string;
  reasonType: string;
  reason: string;
};

export function readExecutiveFiltersFromParams(params: URLSearchParams): ExecutiveUrlFilters {
  // Year-to-date: CRM wins often land outside the current calendar month.
  const ytd = yearToDateYmd();
  return {
    from: params.get("from") || ytd.from,
    to: params.get("to") || ytd.to,
    executiveId: params.get("executive") || "all",
    teamId: params.get("team") || "all",
    regionId: params.get("region") || "all",
    weekday: params.get("weekday") || "all",
    reasonType: params.get("reasonType") || "all",
    reason: params.get("reason") || "all",
  };
}

export function executiveFiltersToSearchParams(
  f: ExecutiveUrlFilters,
  tab: string,
): URLSearchParams {
  const p = new URLSearchParams();
  p.set("from", f.from);
  p.set("to", f.to);
  if (f.executiveId !== "all") p.set("executive", f.executiveId);
  if (f.teamId !== "all") p.set("team", f.teamId);
  if (f.regionId !== "all") p.set("region", f.regionId);
  if (f.weekday !== "all") p.set("weekday", f.weekday);
  if (f.reasonType !== "all") p.set("reasonType", f.reasonType);
  if (f.reason !== "all") p.set("reason", f.reason);
  if (tab !== "overview") p.set("tab", tab);
  return p;
}
