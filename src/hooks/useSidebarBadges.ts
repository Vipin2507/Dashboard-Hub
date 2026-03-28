import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope } from "@/lib/rbac";
import type { Deal, Proposal } from "@/types";

type PaymentRemainingRow = { customerId: string; category: string };

/** Sidebar counts: pending proposals (scoped), deals in Negotiation (scoped), overdue payment rows (scoped). */
export function useSidebarBadges() {
  const me = useAppStore((s) => s.me);
  const role = me.role;

  const proposalsPending = useQuery({
    queryKey: [...QK.proposalPendingBadge(), role, me.teamId, me.regionId],
    queryFn: async () => {
      const rows = await api.get<Proposal[]>("/proposals?status=approval_pending");
      const scope = getScope(me.role, "proposals");
      return visibleWithScope(scope, me, rows).length;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: role === "super_admin" || role === "sales_manager",
  });

  const dealsNegotiation = useQuery({
    queryKey: [...QK.dealsNegotiationBadge(), role, me.teamId, me.regionId],
    queryFn: async () => {
      const rows = await api.get<Deal[]>("/deals?stage=Negotiation");
      const scope = getScope(me.role, "deals");
      return visibleWithScope(scope, me, rows).length;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const paymentsOverdue = useQuery({
    queryKey: [...QK.paymentsOverdueBadge(), role, me.teamId, me.regionId],
    queryFn: async () => {
      const rows = await api.get<PaymentRemainingRow[]>("/payments/remaining?overdue=true");
      const scope = getScope(me.role, "customers");
      if (scope === "ALL") return rows.length;

      const customers = await api.get<Array<{ id: string; regionId: string }>>("/customers");
      const { users } = useAppStore.getState();

      let allowedIds: Set<string>;
      if (scope === "REGION") {
        allowedIds = new Set(customers.filter((c) => c.regionId === me.regionId).map((c) => c.id));
      } else if (scope === "TEAM") {
        const teamRegions = new Set(users.filter((u) => u.teamId === me.teamId).map((u) => u.regionId));
        allowedIds = new Set(customers.filter((c) => teamRegions.has(c.regionId)).map((c) => c.id));
      } else if (scope === "SELF") {
        allowedIds = new Set(); // API customers lack owner id — show 0
      } else {
        allowedIds = new Set();
      }
      return rows.filter((r) => allowedIds.has(r.customerId)).length;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: role === "super_admin" || role === "finance",
  });

  return {
    proposalsBadge: proposalsPending.data ?? 0,
    dealsBadge: dealsNegotiation.data ?? 0,
    paymentsBadge: paymentsOverdue.data ?? 0,
  };
}
