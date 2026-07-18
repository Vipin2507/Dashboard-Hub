import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import type {
  ExecutivePerformanceFilters,
  ExecutivePerformanceResponse,
} from "@/types/executivePerformance";

function buildQuery(filters: ExecutivePerformanceFilters): string {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  params.set("actorRole", filters.actorRole);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.actorUserName) params.set("actorUserName", filters.actorUserName);
  if (filters.executiveId && filters.executiveId !== "all") {
    params.set("executiveId", filters.executiveId);
  }
  if (filters.teamId && filters.teamId !== "all") params.set("teamId", filters.teamId);
  if (filters.regionId && filters.regionId !== "all") params.set("regionId", filters.regionId);
  if (filters.weekday != null && !Number.isNaN(filters.weekday)) {
    params.set("weekday", String(filters.weekday));
  }
  if (filters.reasonType) params.set("reasonType", filters.reasonType);
  if (filters.reason && filters.reason !== "all") params.set("reason", filters.reason);
  if (filters.detailType) params.set("detailType", filters.detailType);
  if (filters.detailPage) params.set("detailPage", String(filters.detailPage));
  if (filters.detailPageSize) params.set("detailPageSize", String(filters.detailPageSize));
  return params.toString();
}

export async function fetchExecutivePerformance(
  filters: ExecutivePerformanceFilters,
  signal?: AbortSignal,
): Promise<ExecutivePerformanceResponse> {
  const qs = buildQuery(filters);
  const res = await fetch(apiUrl(`/api/analytics/executive-performance?${qs}`), { signal });
  const text = await res.text();
  if (!res.ok) {
    let message = text || res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      message = j.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as ExecutivePerformanceResponse;
}

export function useExecutivePerformanceQuery(
  filters: ExecutivePerformanceFilters | null,
  enabled = true,
) {
  return useQuery({
    queryKey: QK.executivePerformance(filters ?? {}),
    queryFn: ({ signal }) => fetchExecutivePerformance(filters!, signal),
    enabled: Boolean(enabled && filters?.from && filters?.to && filters?.actorRole),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
