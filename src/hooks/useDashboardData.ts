import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { QK } from "@/lib/queryKeys";
import { useCoreEntityQueries } from "@/hooks/useCoreEntityQueries";
import { type CustomersApiListRow } from "@/hooks/useCustomersListQuery";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope } from "@/lib/rbac";
import { normalizeDealStatus } from "@/lib/dealStatus";
import type { Customer, Deal, Proposal, Scope } from "@/types";

/** @deprecated use CustomersApiListRow from useCustomersListQuery */
export type ApiCustomerRow = CustomersApiListRow;

function mapRowToCustomer(row: CustomersApiListRow): Customer {
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
    createdAt: row.createdAt ?? new Date().toISOString(),
    updatedAt: row.createdAt ?? new Date().toISOString(),
    createdBy: "",
  };
}

/** API customers lack `teamId`; approximate TEAM scope via regions of users on the same team. */
function filterApiCustomers(
  scope: Scope,
  me: { id: string; regionId: string; teamId: string },
  users: { id: string; teamId: string; regionId: string; name: string }[],
  rows: CustomersApiListRow[],
): CustomersApiListRow[] {
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

/**
 * Live dashboard data from the API + RBAC scoping (same rules as `visibleWithScope` where fields exist).
 * Does not use Zustand seed for proposals/deals/customers lists.
 */
export function useDashboardData() {
  const users = useAppStore((s) => s.users);
  const queryClient = useQueryClient();

  const {
    me,
    role,
    proposalsQuery,
    dealsQuery,
    customersQuery,
    paymentsRemainingQuery,
    paymentHistoryQuery,
    notificationsQuery,
  } = useCoreEntityQueries();

  const proposalScope = getScope(role, "proposals");
  const dealScope = getScope(role, "deals");
  const customerScope = getScope(role, "customers");

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
