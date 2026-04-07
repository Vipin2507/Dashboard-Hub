import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  FileText,
  Plus,
  Search,
  Pencil,
  Eye,
  Send,
  X,
  Trash2,
  FileDown,
  FileQuestion,
  Loader2,
  Filter,
  Upload,
  Handshake,
  Trophy,
  Snowflake,
  Clock,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Download,
  MoreHorizontal,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "@/components/DataTablePagination";
import type { Proposal, ProposalStatus } from "@/types";
import { ProposalDetailSheet } from "@/components/ProposalDetailSheet";
import { ProposalFormDialog } from "@/components/ProposalFormDialog";
import { ApproveProposalDialog } from "@/components/ApproveProposalDialog";
import { RejectProposalDialog } from "@/components/RejectProposalDialog";
import { SendProposalDialog } from "@/components/SendProposalDialog";
import { CreateDealDialog } from "@/components/CreateDealDialog";
import { BulkImportProposalsDialog } from "@/components/BulkImportProposalsDialog";
import { generateProposalPdf } from "@/lib/generateProposalPdf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";

const PAGE_SIZE = 10;
const STATUS_OPTIONS: { value: ProposalStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approval_pending", label: "Approval Pending" },
  { value: "approved", label: "Approved" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "cold", label: "Cold" },
  { value: "rejected", label: "Rejected" },
  { value: "deal_created", label: "Deal Created" },
];

const STATUS_BADGE: Record<ProposalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  approval_pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-green-500/15 text-green-700 dark:text-green-300",
  negotiation: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  won: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cold: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  deal_created: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

type SortKey = "date" | "value" | "customer";

const PROPOSAL_STATUS_VALUES: (ProposalStatus | "all")[] = [
  "all",
  "draft",
  "sent",
  "approval_pending",
  "approved",
  "negotiation",
  "won",
  "cold",
  "rejected",
  "deal_created",
];

function formatProposalDate(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function validUntilExpired(iso: string | undefined, status: ProposalStatus): boolean {
  if (!iso) return false;
  if (status === "approved" || status === "deal_created" || status === "won" || status === "cold") return false;
  try {
    return new Date(iso) < new Date();
  } catch {
    return false;
  }
}

type ProposalKPIData = {
  total: number;
  pending: number;
  wonMonth: number;
  totalValue: number;
  trendTotal: number;
  trendWon: number;
};

function ProposalKPICards({ data }: { data: ProposalKPIData }) {
  const cards: {
    label: string;
    value: string | number;
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    trend?: number;
    badge?: string | null;
    badgeColor?: string;
  }[] = [
    {
      label: "Total Proposals",
      value: data.total,
      icon: FileText,
      iconBg: "bg-blue-50 dark:bg-blue-950",
      iconColor: "text-blue-600 dark:text-blue-400",
      trend: data.trendTotal,
    },
    {
      label: "Pending Approval",
      value: data.pending,
      icon: Clock,
      iconBg: "bg-amber-50 dark:bg-amber-950",
      iconColor: "text-amber-600 dark:text-amber-400",
      badge: data.pending > 0 ? "Needs attention" : null,
      badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    },
    {
      label: "Won This Month",
      value: data.wonMonth,
      icon: Trophy,
      iconBg: "bg-emerald-50 dark:bg-emerald-950",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      trend: data.trendWon,
    },
    {
      label: "Total Value",
      value: `₹${data.totalValue.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      iconBg: "bg-purple-50 dark:bg-purple-950",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", card.iconBg)}>
                <Icon className={cn("h-5 w-5", card.iconColor)} />
              </div>
              {card.badge && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", card.badgeColor)}>{card.badge}</span>
              )}
            </div>
            <p className="mb-1.5 text-2xl font-bold leading-none tracking-tight text-gray-900 dark:text-gray-100">{card.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
            {card.trend !== undefined && (
              <div className="mt-2.5 flex items-center gap-1">
                {card.trend > 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : card.trend < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                ) : null}
                <span
                  className={cn(
                    "text-xs font-medium",
                    card.trend > 0 ? "text-emerald-600" : card.trend < 0 ? "text-red-600" : "text-gray-500",
                  )}
                >
                  {Math.abs(card.trend)}% vs last month
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_BADGE[status], "whitespace-nowrap")}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export default function Proposals() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const regions = useAppStore((s) => s.regions);
  const updateProposal = useAppStore((s) => s.updateProposal);
  const submitForApprovalAction = useAppStore((s) => s.submitForApproval);

  const scope = getScope(me.role, "proposals");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [page, setPage] = useState(1);
  const statusFromUrl = searchParams.get("status");
  const ownerFromUrl = searchParams.get("owner");
  const teamFromUrl = searchParams.get("team");
  const regionFromUrl = searchParams.get("region");
  const fromFromUrl = searchParams.get("from");
  const toFromUrl = searchParams.get("to");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [sendId, setSendId] = useState<string | null>(null);
  const [createDealId, setCreateDealId] = useState<string | null>(null);
  const [deleteProposal, setDeleteProposal] = useState<Proposal | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [teamQueryFilter, setTeamQueryFilter] = useState<string>("all");
  const [regionQueryFilter, setRegionQueryFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const proposalsQuery = useQuery({
    queryKey: QK.proposals(),
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/proposals"));
      if (!res.ok) throw new Error("Failed to load proposals");
      const data = (await res.json()) as Proposal[];
      useAppStore.getState().setProposals(data);
      return data;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  const proposals = proposalsQuery.data ?? [];
  const visible = visibleWithScope(scope, me, proposals);

  const handleDownloadPdf = async (proposalObj: Proposal) => {
    setPdfLoading(true);
    toast({ title: "Generating PDF...", description: "Please wait" });
    try {
      await new Promise((r) => setTimeout(r, 100));
      await generateProposalPdf(proposalObj);
      toast({ title: "PDF Downloaded", description: `Proposal-${proposalObj.proposalNumber}.pdf` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate PDF";
      toast({ title: "PDF generation failed", description: message, variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  const canReassign = me.role === "super_admin";

  const changeAssignedTo = async (p: Proposal, nextUserId: string) => {
    if (!canReassign) return;
    const u = users.find((x) => x.id === nextUserId);
    if (!u) return;
    updateProposal(p.id, {
      assignedTo: u.id,
      assignedToName: u.name,
      teamId: u.teamId,
      regionId: u.regionId,
    });
    await queryClient.invalidateQueries({ queryKey: QK.proposals() });
    toast({ title: "Assigned updated", description: `${p.proposalNumber} → ${u.name}` });
  };

  const canCreate = can(me.role, "proposals", "create");
  const canUpdate = can(me.role, "proposals", "update");
  const canDelete = can(me.role, "proposals", "delete");
  const canApprove = can(me.role, "proposals", "approve");
  const canReject = can(me.role, "proposals", "reject");
  const canSend = can(me.role, "proposals", "send");
  const canExport = can(me.role, "proposals", "export");
  const canOverride = can(me.role, "proposals", "override_final_value");

  const stateCustomerId = (location.state as { customerId?: string; detailId?: string } | null)?.customerId;
  const stateDetailId = (location.state as { customerId?: string; detailId?: string } | null)?.detailId;
  const [initialCustomerIdForForm, setInitialCustomerIdForForm] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (stateCustomerId && canCreate) {
      setInitialCustomerIdForForm(stateCustomerId);
      setFormOpen(true);
      setEditingId(null);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [stateCustomerId, canCreate, navigate, location.pathname]);
  useEffect(() => {
    if (stateDetailId) {
      setDetailId(stateDetailId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [stateDetailId, navigate, location.pathname]);
  useEffect(() => {
    if (statusFromUrl && PROPOSAL_STATUS_VALUES.includes(statusFromUrl as ProposalStatus | "all")) {
      setStatusFilter(statusFromUrl as ProposalStatus | "all");
    }
  }, [statusFromUrl]);
  useEffect(() => {
    if (ownerFromUrl) setAssignedToFilter(ownerFromUrl);
    if (teamFromUrl) setTeamQueryFilter(teamFromUrl);
    if (regionFromUrl) setRegionQueryFilter(regionFromUrl);
    if (fromFromUrl) setDateFrom(fromFromUrl);
    if (toFromUrl) setDateTo(toFromUrl);
  }, [ownerFromUrl, teamFromUrl, regionFromUrl, fromFromUrl, toFromUrl]);

  const filtered = useMemo(() => {
    let list = visible;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.proposalNumber.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (dateFrom) list = list.filter((p) => p.createdAt >= dateFrom + "T00:00:00");
    if (dateTo) list = list.filter((p) => p.createdAt <= dateTo + "T23:59:59");
    if (assignedToFilter !== "all") list = list.filter((p) => p.assignedTo === assignedToFilter);
    if (teamQueryFilter !== "all") list = list.filter((p) => users.find((u) => u.id === p.assignedTo)?.teamId === teamQueryFilter);
    if (regionQueryFilter !== "all") list = list.filter((p) => users.find((u) => u.id === p.assignedTo)?.regionId === regionQueryFilter);
    if (sortBy === "date") list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortBy === "value") list = [...list].sort((a, b) => (b.finalQuoteValue ?? b.grandTotal) - (a.finalQuoteValue ?? a.grandTotal));
    else if (sortBy === "customer") list = [...list].sort((a, b) => a.customerName.localeCompare(b.customerName));
    return list;
  }, [visible, search, statusFilter, dateFrom, dateTo, assignedToFilter, teamQueryFilter, regionQueryFilter, sortBy, users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const kpiMetrics = useMemo((): ProposalKPIData => {
    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endToday = now;
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const inRange = (iso: string, start: Date, end: Date) => {
      const d = new Date(iso);
      return d >= start && d <= end;
    };

    const createdThisMonth = visible.filter((p) => inRange(p.createdAt, startThisMonth, endToday)).length;
    const createdLastMonth = visible.filter((p) => inRange(p.createdAt, startLastMonth, endLastMonth)).length;

    const wonThisMonth = visible.filter(
      (p) => p.status === "won" && p.updatedAt && inRange(p.updatedAt, startThisMonth, endToday),
    ).length;
    const wonLastMonth = visible.filter(
      (p) => p.status === "won" && p.updatedAt && inRange(p.updatedAt, startLastMonth, endLastMonth),
    ).length;

    const totalValue = visible.reduce((s, p) => s + (p.finalQuoteValue ?? p.grandTotal), 0);

    return {
      total: visible.length,
      pending: visible.filter((p) => p.status === "approval_pending").length,
      wonMonth: wonThisMonth,
      totalValue,
      trendTotal: pctChange(createdThisMonth, createdLastMonth),
      trendWon: pctChange(wonThisMonth, wonLastMonth),
    };
  }, [visible]);

  const handleExportCsv = () => {
    const headers = ["Proposal #", "Title", "Customer", "Assigned To", "Grand Total", "Status", "Valid Until"];
    const rows = filtered.map((p) =>
      [p.proposalNumber, p.title, p.customerName, p.assignedToName, p.finalQuoteValue ?? p.grandTotal, p.status, p.validUntil].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export done", description: `${filtered.length} proposals exported.` });
  };

  const handleDelete = (p: Proposal) => {
    useAppStore.getState().deleteProposal(p.id);
    void queryClient.invalidateQueries({ queryKey: QK.proposals() });
    void queryClient.invalidateQueries({ queryKey: QK.dashboard() });
    toast({ title: "Proposal deleted", description: `${p.proposalNumber} has been removed.` });
    if (detailId === p.id) setDetailId(null);
    setDeleteProposal(null);
  };

  const detailProposal = detailId ? proposals.find((p) => p.id === detailId) : null;
  const canEditProposal = (p: Proposal) => {
    if (!canUpdate) return false;
    if (p.status !== "draft" && p.status !== "rejected" && p.status !== "negotiation") return false;
    if (scope === "SELF" && p.assignedTo !== me.id) return false;
    return true;
  };

  const canActOnOutcome = (p: Proposal) => {
    if (!canUpdate) return false;
    if (scope === "SELF" && p.assignedTo !== me.id) return false;
    if (p.dealId) return false;
    return ["sent", "approved", "negotiation", "won"].includes(p.status);
  };

  const markNegotiation = (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    updateProposal(id, { status: "negotiation" });
    void queryClient.invalidateQueries({ queryKey: QK.proposals() });
    toast({ title: "Marked as negotiation", description: p.proposalNumber });
  };

  const markCold = (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    updateProposal(id, { status: "cold" });
    void queryClient.invalidateQueries({ queryKey: QK.proposals() });
    toast({ title: "Marked as cold", description: p.proposalNumber });
  };

  const markWon = (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    updateProposal(id, { status: "won" });
    void queryClient.invalidateQueries({ queryKey: QK.proposals() });
    toast({ title: "Marked as won", description: "Create a deal when you are ready to track the sale." });
    setCreateDealId(id);
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 -mx-4 sm:-mx-5 lg:-mx-6 px-4 sm:px-5 lg:px-6 py-6 space-y-5 max-w-[1440px] mx-auto">
        {proposalsQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading proposals...</div>
        )}

        {/* PAGE HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Proposals
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {filtered.length} proposals
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {canExport && (
              <Button variant="outline" size="sm" className="h-9 shrink-0 px-4 text-sm font-medium" onClick={handleExportCsv}>
                <FileDown className="mr-1.5 h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {canCreate && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 px-4 text-sm font-medium"
                  onClick={() => setBulkImportOpen(true)}
                >
                  <Upload className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Bulk import</span>
                </Button>
                <Button
                  className="h-9 shrink-0 px-4 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    setEditingId(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                  New Proposal
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPI CARDS */}
        <ProposalKPICards data={kpiMetrics} />

        {/* Search + filters */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search proposal, customer..."
                className="h-10 w-full pl-9 text-sm"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Status */}
            <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(o.value);
                    setPage(1);
                  }}
                  className={cn(
                    "h-8 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors duration-150",
                    statusFilter === o.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* Other filters */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 lg:items-center">
              {(me.role === "super_admin" || me.role === "sales_manager") && (
                <Select
                  value={assignedToFilter}
                  onValueChange={(v) => {
                    setAssignedToFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full text-sm"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full text-sm"
              />

              <Select value={sortBy} onValueChange={(v) => (setSortBy(v as SortKey), setPage(1))}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (newest)</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-9 w-full text-sm",
                  // keep it on the far right on wider screens
                  "sm:col-start-4 sm:justify-self-end sm:w-[160px]",
                  (me.role === "super_admin" || me.role === "sales_manager") && "lg:col-start-6",
                  !(me.role === "super_admin" || me.role === "sales_manager") && "lg:col-start-5",
                )}
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setAssignedToFilter("all");
                  setDateFrom("");
                  setDateTo("");
                  setSortBy("date");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <FileQuestion className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No proposals found</p>
              <p className="mt-1 text-xs text-muted-foreground">Create your first proposal to get started.</p>
              {canCreate && (
                <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>
                  + New Proposal
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/95">
                      <th className="pl-5 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Proposal
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Customer
                      </th>
                      <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell dark:text-gray-400">
                        Value
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="hidden px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell dark:text-gray-400">
                        Valid Until
                      </th>
                      <th className="pr-5 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {pageItems.map((p) => (
                      <tr
                        key={p.id}
                        className="transition-colors duration-100 hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                      >
                        <td className="px-4 py-4 pl-5">
                          <div>
                            <button
                              type="button"
                              onClick={() => setDetailId(p.id)}
                              className="font-mono text-sm font-semibold leading-none text-blue-600 hover:text-blue-700"
                            >
                              {p.proposalNumber}
                            </button>
                            <p className="mt-1 max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400">{p.title}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <button
                              type="button"
                              className="text-left text-sm font-medium text-gray-800 hover:underline dark:text-gray-200"
                              onClick={() => navigate(`/customers/${p.customerId}`)}
                            >
                              {p.customerName}
                            </button>
                            <p className="mt-0.5 text-xs text-gray-400">{p.assignedToName}</p>
                          </div>
                        </td>
                        <td className="hidden px-4 py-4 text-right sm:table-cell">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            ₹{(p.finalQuoteValue ?? p.grandTotal).toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <ProposalStatusBadge status={p.status} />
                        </td>
                        <td className="hidden px-4 py-4 text-center md:table-cell">
                          <span
                            className={cn(
                              "text-xs",
                              validUntilExpired(p.validUntil, p.status) ? "font-medium text-red-500" : "text-gray-500 dark:text-gray-400",
                            )}
                          >
                            {formatProposalDate(p.validUntil)}
                          </span>
                        </td>
                        <td className="px-4 py-4 pr-5">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 rounded-md p-0 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50"
                              title="View"
                              onClick={() => setDetailId(p.id)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {p.status === "draft" && canEditProposal(p) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                title="Submit for approval"
                                onClick={() => {
                                  submitForApprovalAction(p.id);
                                  void queryClient.invalidateQueries({ queryKey: QK.proposals() });
                                  toast({ title: "Submitted for approval", description: p.proposalNumber });
                                }}
                              >
                                Submit
                              </Button>
                            )}
                            {p.status === "approval_pending" && canApprove && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                title="Approve"
                                onClick={() => setApproveId(p.id)}
                              >
                                Approve
                              </Button>
                            )}
                            {p.status === "approved" && canSend && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                                title="Send"
                                onClick={() => setSendId(p.id)}
                              >
                                Send
                              </Button>
                            )}
                            {p.status === "sent" && canActOnOutcome(p) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                                title="Mark won"
                                onClick={() => markWon(p.id)}
                              >
                                Won
                              </Button>
                            )}
                            {p.status === "won" && !p.dealId && (canApprove || me.role === "super_admin") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs font-medium text-purple-600 hover:bg-purple-50"
                                title="Create deal"
                                onClick={() => setCreateDealId(p.id)}
                              >
                                → Deal
                              </Button>
                            )}

                            {canReassign && (
                              <Select value={p.assignedTo} onValueChange={(v) => void changeAssignedTo(p, v)}>
                                <SelectTrigger
                                  className="hidden h-7 w-[160px] rounded-md border-gray-200 bg-white px-2 text-xs text-gray-600 shadow-none hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 lg:flex"
                                  title="Change assigned to"
                                >
                                  <SelectValue placeholder="Assigned to" />
                                </SelectTrigger>
                                <SelectContent align="end" className="max-h-[320px]">
                                  {users.map((u) => (
                                    <SelectItem key={u.id} value={u.id} className="text-xs">
                                      {u.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 rounded-md p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                              title="Download PDF"
                              disabled={pdfLoading}
                              onClick={() => handleDownloadPdf(p)}
                            >
                              {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 rounded-md p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                {canEditProposal(p) && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingId(p.id);
                                      setFormOpen(true);
                                    }}
                                  >
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {p.status === "sent" && canActOnOutcome(p) && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingId(p.id);
                                        setFormOpen(true);
                                      }}
                                    >
                                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                      Revise
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-orange-600 focus:text-orange-600" onClick={() => markCold(p.id)}>
                                      <Snowflake className="mr-2 h-3.5 w-3.5" />
                                      Mark Cold
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {canReject && p.status === "approval_pending" && (
                                  <DropdownMenuItem className="text-amber-700" onClick={() => setRejectId(p.id)}>
                                    <X className="mr-2 h-3.5 w-3.5" />
                                    Reject
                                  </DropdownMenuItem>
                                )}
                                {canActOnOutcome(p) && p.status !== "negotiation" && p.status !== "sent" && (
                                  <DropdownMenuItem onClick={() => markNegotiation(p.id)}>
                                    <Handshake className="mr-2 h-3.5 w-3.5" />
                                    Negotiation
                                  </DropdownMenuItem>
                                )}
                                {canActOnOutcome(p) && !["won", "sent"].includes(p.status) && p.status !== "negotiation" && (
                                  <DropdownMenuItem onClick={() => markWon(p.id)}>
                                    <Trophy className="mr-2 h-3.5 w-3.5" />
                                    Mark Won
                                  </DropdownMenuItem>
                                )}
                                {canSend && (p.status === "negotiation" || p.status === "draft") && (
                                  <DropdownMenuItem onClick={() => setSendId(p.id)}>
                                    <Send className="mr-2 h-3.5 w-3.5" />
                                    Send
                                  </DropdownMenuItem>
                                )}
                                {(canApprove || me.role === "super_admin") && p.status === "approved" && !p.dealId && (
                                  <DropdownMenuItem onClick={() => setCreateDealId(p.id)}>
                                    <FileText className="mr-2 h-3.5 w-3.5" />
                                    Create Deal
                                  </DropdownMenuItem>
                                )}
                                {canDelete && p.status === "draft" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteProposal(p)}>
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <DataTablePagination
                  className="border-t border-gray-100 px-5 py-3 dark:border-gray-800"
                  page={currentPage}
                  totalPages={totalPages}
                  total={filtered.length}
                  perPage={PAGE_SIZE}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ProposalDetailSheet
        proposal={detailProposal}
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        onEdit={() => detailId && (setEditingId(detailId), setFormOpen(true))}
        onApprove={() => detailId && setApproveId(detailId)}
        onReject={() => detailId && setRejectId(detailId)}
        onSend={() => detailId && setSendId(detailId)}
        onCreateDeal={() => detailId && setCreateDealId(detailId)}
        onMarkNegotiation={() => detailId && markNegotiation(detailId)}
        onMarkWon={() => detailId && markWon(detailId)}
        onMarkCold={() => detailId && markCold(detailId)}
        onDownloadPdf={() => detailProposal && handleDownloadPdf(detailProposal)}
        isPdfLoading={pdfLoading}
      />

      <ProposalFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setInitialCustomerIdForForm(undefined); }}
        editingProposal={editingId ? proposals.find((p) => p.id === editingId) ?? null : null}
        initialCustomerId={initialCustomerIdForForm}
        onSaved={() => { setFormOpen(false); setEditingId(null); setInitialCustomerIdForForm(undefined); }}
      />

      <BulkImportProposalsDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        regions={regions}
        existingProposals={proposals}
        onImported={async () => {
          await queryClient.invalidateQueries({ queryKey: QK.proposals() });
          await queryClient.refetchQueries({ queryKey: QK.proposals() });
          await queryClient.invalidateQueries({ queryKey: ["customers-old-ui-sync"] });
          await queryClient.invalidateQueries({ queryKey: QK.customers() });
          await queryClient.invalidateQueries({ queryKey: QK.dashboard() });
        }}
      />

      {approveId && <ApproveProposalDialog proposalId={approveId} onClose={() => setApproveId(null)} />}
      {rejectId && <RejectProposalDialog proposalId={rejectId} onClose={() => setRejectId(null)} />}
      {sendId && <SendProposalDialog proposalId={sendId} onClose={() => setSendId(null)} />}
      {createDealId && <CreateDealDialog proposalId={createDealId} onClose={() => setCreateDealId(null)} />}

      <AlertDialog open={!!deleteProposal} onOpenChange={(open) => !open && setDeleteProposal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete proposal</AlertDialogTitle>
            <AlertDialogDescription>
              Delete proposal <strong>{deleteProposal?.proposalNumber}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteProposal && handleDelete(deleteProposal)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
