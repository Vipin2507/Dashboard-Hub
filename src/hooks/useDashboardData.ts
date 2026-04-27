import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope } from "@/lib/rbac";
import { normalizeDealStatus } from "@/lib/dealStatus";
import type { Customer, Deal, Proposal, Scope } from "@/types";

/** SQLite/API customer row (subset of rich `Customer`). */
export type ApiCustomerRow = {
  id: string;
  leadId?: string;
  name: string;
  state?: string;
  gstin?: string | null;
  regionId: string;
  city?: string | null;
  email?: string | null;
  primaryPhone?: string | null;
  status: string;
  createdAt: string;
  salesExecutive?: string | null;
  accountManager?: string | null;
  deliveryExecutive?: string | null;
};

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

function mapRowToCustomer(row: ApiCustomerRow): Customer {
  return {
    id: row.id,
    customerNumber: row.leadId ?? row.id,
    companyName: row.name,
    status: (row.status as Customer["status"]) ?? "active",
    regionId: row.regionId,
    regionName: "",
    teamId: "",
    assignedTo: "",
    assignedToName: row.salesExecutive ?? "",
    address: { country: "India" },
    contacts: [],
    tags: [],
    notes: [],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [],
    activityLog: [],
    totalRevenue: 0,
    totalDealValue: 0,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    createdBy: "",
  };
}

/** API customers lack `teamId`; approximate TEAM scope via regions of users on the same team. */
function filterApiCustomers(scope: Scope, me: { id: string; regionId: string; teamId: string }, users: { id: string; teamId: string; regionId: string; name: string }[], rows: ApiCustomerRow[]): ApiCustomerRow[] {
  if (scope === "ALL") return rows;
  if (scope === "REGION") return rows.filter((c) => c.regionId === me.regionId);
  if (scope === "TEAM") {
    const regionIds = new Set(users.filter((u) => u.teamId === me.teamId).map((u) => u.regionId));
    return rows.filter((c) => regionIds.has(c.regionId));
  }
  if (scope === "SELF") {
    const self = users.find((u) => u.id === me.id);
    const first = self?.name?.split(" ")[0]?.toLowerCase() ?? "";
    return rows.filter((c) => first && (c.salesExecutive ?? "").toLowerCase().includes(first));
  }
  return [];
}

const DASH_INTERVAL = 60_000;
const NOTIF_INTERVAL = 30_000;

/**
 * Live dashboard data from the API + RBAC scoping (same rules as `visibleWithScope` where fields exist).
 * Does not use Zustand seed for proposals/deals/customers lists.
 */
export function useDashboardData() {
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const queryClient = useQueryClient();

  const role = me.role;
  const proposalScope = getScope(role, "proposals");
  const dealScope = getScope(role, "deals");
  const customerScope = getScope(role, "customers");

  /** Shared keys with list pages / INVALIDATE.* so mutations refresh dashboard too */
  const proposalsQuery = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
    staleTime: 30_000,
    refetchInterval: DASH_INTERVAL,
  });

  const dealsQuery = useQuery({
    queryKey: QK.deals({ role: me.role }),
    queryFn: async () => {
      const q = role === "super_admin" ? "?includeDeleted=1&actorRole=super_admin" : "";
      return api.get<Deal[]>(`/deals${q}`);
    },
    staleTime: 30_000,
    refetchInterval: DASH_INTERVAL,
  });

  const customersQuery = useQuery({
    queryKey: QK.customers(),
    queryFn: () => api.get<ApiCustomerRow[]>("/customers"),
    staleTime: 30_000,
    refetchInterval: DASH_INTERVAL,
  });

  const paymentsRemainingQuery = useQuery({
    queryKey: QK.paymentRemaining(),
    queryFn: () => api.get<PaymentRemainingRow[]>("/payments/remaining"),
    staleTime: 30_000,
    refetchInterval: DASH_INTERVAL,
    enabled: ["super_admin", "finance", "sales_manager"].includes(role),
  });

  const paymentHistoryQuery = useQuery({
    queryKey: [...QK.paymentHistory(), "confirmed"],
    queryFn: () => api.get<PaymentHistoryRow[]>("/payments/history?status=confirmed"),
    staleTime: 30_000,
    refetchInterval: DASH_INTERVAL,
  });

  const notificationsQuery = useQuery({
    queryKey: QK.notifications(),
    queryFn: () => api.get<NotificationRow[]>("/notifications"),
    staleTime: 15_000,
    refetchInterval: NOTIF_INTERVAL,
  });

  const rawProposals = proposalsQuery.data ?? [];
  const rawDeals = dealsQuery.data ?? [];
  const rawCustomers = customersQuery.data ?? [];

  const scopedProposals = useMemo(
    () => visibleWithScope(proposalScope, me, rawProposals),
    [proposalScope, me, rawProposals],
  );

  const scopedDeals = useMemo(() => {
    const active = rawDeals.filter((d) => !d.deletedAt);
    return visibleWithScope(dealScope, me, active);
  }, [dealScope, me, rawDeals]);

  const scopedCustomerRows = useMemo(() => {
    const filtered = filterApiCustomers(customerScope, me, users, rawCustomers);
    return filtered;
  }, [customerScope, me, users, rawCustomers]);

  const scopedCustomers = useMemo(
    () => scopedCustomerRows.map(mapRowToCustomer),
    [scopedCustomerRows],
  );

  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const proposalList = scopedProposals;
    const dealList = scopedDeals;
    const customerList = scopedCustomers;

    const totalCustomers = customerList.length;
    const newCustomersMonth = customerList.filter((c) => {
      const d = new Date(c.createdAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const activeProposals = proposalList.filter((p) =>
      ["sent", "shared", "approval_pending", "approved", "negotiation", "won"].includes(p.status),
    ).length;
    const pendingApprovals = proposalList.filter((p) => p.status === "approval_pending").length;
    const totalProposalValue = proposalList.reduce((s, p) => s + (p.grandTotal ?? 0), 0);

    const dealsInPipeline = dealList.filter((d) => {
      const st = normalizeDealStatus(d.dealStatus);
      return st !== "Closed/Won" && st !== "Closed/Lost";
    }).length;

    const dealsWonMonth = dealList.filter((d) => {
      if (normalizeDealStatus(d.dealStatus) !== "Closed/Won") return false;
      const ts = d.updatedAt ?? d.lastActivityAt ?? "";
      if (!ts) return false;
      const dt = new Date(ts);
      return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear;
    }).length;

    const totalRevenue = dealList
      .filter((d) => normalizeDealStatus(d.dealStatus) === "Closed/Won")
      .reduce((s, d) => s + (d.value ?? 0), 0);

    const overduePayments =
      paymentsRemainingQuery.data?.filter((p) => p.category === "overdue").length ?? 0;

    const paymentRows = paymentHistoryQuery.data ?? [];
    const monthlyRevenueFromPayments = paymentRows.filter((r) => {
      if (r.paymentStatus && r.paymentStatus !== "confirmed") return false;
      const paid = new Date(r.paymentDate);
      return paid >= new Date(startOfMonth);
    }).reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);

    const totalPaidRevenue = paymentRows
      .filter((r) => !r.paymentStatus || r.paymentStatus === "confirmed")
      .reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);

    return {
      totalCustomers,
      newCustomersMonth,
      activeProposals,
      pendingApprovals,
      totalProposalValue,
      dealsInPipeline,
      dealsWonMonth,
      totalRevenue,
      totalPaidRevenue,
      overduePayments,
      monthlyRevenueFromPayments,
    };
  }, [scopedProposals, scopedDeals, scopedCustomers, paymentsRemainingQuery.data, paymentHistoryQuery.data]);

  const isLoading =
    proposalsQuery.isLoading ||
    dealsQuery.isLoading ||
    customersQuery.isLoading ||
    paymentHistoryQuery.isLoading;
  const isError =
    proposalsQuery.isError || dealsQuery.isError || customersQuery.isError || paymentHistoryQuery.isError;

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QK.proposals() });
    queryClient.invalidateQueries({ queryKey: QK.deals() });
    queryClient.invalidateQueries({ queryKey: QK.customers() });
    queryClient.invalidateQueries({ queryKey: ["payments"] });
    queryClient.invalidateQueries({ queryKey: QK.notifications() });
  }, [queryClient]);

  return {
    me,
    users,
    kpis,
    scopedProposals,
    scopedDeals,
    scopedCustomers,
    scopedCustomerRows,
    paymentHistory: paymentHistoryQuery.data ?? [],
    paymentsRemaining: paymentsRemainingQuery.data,
    notificationsQuery,
    isLoading,
    isError,
    refetchAll,
    proposalsQuery,
    dealsQuery,
    customersQuery,
    paymentsRemainingQuery,
    paymentHistoryQuery,
  };
}
