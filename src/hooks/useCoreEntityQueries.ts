import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import { useCustomersListQuery } from "@/hooks/useCustomersListQuery";
import { useAppStore } from "@/store/useAppStore";
import type { Deal, Proposal } from "@/types";
import { mapApiCustomerRowToCustomer } from "@/lib/customerApiToUi";

type PaymentRemainingRow = {
  customerId: string;
  category: string;
  totalRemaining?: number;
};

type PaymentHistoryRow = {
  customerId: string;
  amountPaid: number;
  paymentDate: string;
  paymentStatus?: string;
};

type NotificationRow = {
  id: string;
  type: string;
  to: string;
  subject: string;
  entityId: string;
  at: string;
};

type SubscriptionTrackerResponse = {
  rows: Array<{
    id: string;
    customerId: string;
    customerName: string;
    customerRegionId?: string | null;
    planName: string;
    expiryDate: string;
    daysLeft: number;
    bucket: string;
    lastRenewedAt?: string | null;
  }>;
  summary: {
    overdue: number;
    expiring30: number;
    upcoming31to90: number;
    renewedThisMonth: number;
  };
};

const NOTIF_INTERVAL = 30_000;

/**
 * Core CRM list queries shared by the dashboard and other screens.
 * Mount this under the authenticated app shell so the full dataset is subscribed and kept fresh
 * on any navigation (not only when the Dashboard route is open).
 */
export function useCoreEntityQueries() {
  const me = useAppStore((s) => s.me);
  const role = me.role;
  const regions = useAppStore((s) => s.regions);
  const users = useAppStore((s) => s.users);
  const setCustomers = useAppStore((s) => s.setCustomers);

  const proposalsQuery = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const dealsQuery = useQuery({
    queryKey: QK.deals({ role: me.role }),
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("actorRole", me.role);
      qs.set("actorUserId", me.id);
      qs.set("actorTeamId", me.teamId);
      qs.set("actorRegionId", me.regionId);
      if (role === "super_admin") qs.set("includeDeleted", "1");
      return api.get<Deal[]>(`/deals?${qs.toString()}`);
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const customersQuery = useCustomersListQuery();

  useEffect(() => {
    if (!customersQuery.data) return;
    setCustomers(customersQuery.data.map((row) => mapApiCustomerRowToCustomer(row, { regions, users, me })));
  }, [customersQuery.data, regions, users, me, setCustomers]);

  const paymentsRemainingQuery = useQuery({
    queryKey: QK.paymentRemaining(),
    queryFn: () => api.get<PaymentRemainingRow[]>("/payments/remaining"),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    enabled: ["super_admin", "finance", "sales_manager"].includes(role),
  });

  const paymentHistoryQuery = useQuery({
    queryKey: [...QK.paymentHistory(), "confirmed"],
    queryFn: () => api.get<PaymentHistoryRow[]>("/payments/history?status=confirmed"),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
  });

  const notificationsQuery = useQuery({
    queryKey: QK.notifications(),
    queryFn: () => api.get<NotificationRow[]>("/notifications"),
    staleTime: 15_000,
    refetchInterval: NOTIF_INTERVAL,
  });

  const subscriptionTrackerQuery = useQuery({
    queryKey: QK.subscriptionTracker(),
    queryFn: () => api.get<SubscriptionTrackerResponse>("/subscriptions/tracker"),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  return {
    me,
    role,
    proposalsQuery,
    dealsQuery,
    customersQuery,
    paymentsRemainingQuery,
    paymentHistoryQuery,
    notificationsQuery,
    subscriptionTrackerQuery,
  };
}
