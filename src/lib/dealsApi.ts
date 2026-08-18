import type { MeContext } from "@/types";

/** Query string the deals API requires for RBAC (`GET /deals` 403s without actorRole). */
export function dealsActorQuery(me: MeContext, extra?: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  qs.set("actorRole", me.role);
  qs.set("actorUserId", me.id);
  qs.set("actorTeamId", me.teamId);
  qs.set("actorRegionId", me.regionId);
  if (me.role === "super_admin") qs.set("includeDeleted", "1");
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) qs.set(key, value);
    }
  }
  return qs.toString();
}
