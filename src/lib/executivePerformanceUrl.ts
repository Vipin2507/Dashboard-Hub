import { currentMonthYmd } from "@/lib/dateRange";

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
  const month = currentMonthYmd();
  const allTime = params.get("range") === "all";
  return {
    from: allTime ? "" : params.get("from") || month.from,
    to: allTime ? "" : params.get("to") || month.to,
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
  if (f.from && f.to) {
    p.set("from", f.from);
    p.set("to", f.to);
  } else {
    p.set("range", "all");
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
