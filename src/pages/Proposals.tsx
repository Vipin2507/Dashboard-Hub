import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
import { makeProposalNumber } from "@/lib/proposalNumber";
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
  Copy,
  Link2,
  MessageSquarePlus,
  Truck,
  CheckCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { DataTablePagination } from "@/components/DataTablePagination";
import type { Proposal, ProposalStatus } from "@/types";
import { ProposalDetailSheet } from "@/components/ProposalDetailSheet";
import { ProposalFormDialog } from "@/components/ProposalFormDialog";
import { ApproveProposalDialog } from "@/components/ApproveProposalDialog";
import { RejectProposalDialog } from "@/components/RejectProposalDialog";
import { SendProposalDialog } from "@/components/SendProposalDialog";
import { ConvertToDealDialog } from "@/components/ConvertToDealDialog";
import { BulkImportProposalsDialog } from "@/components/BulkImportProposalsDialog";
import { generateProposalPdf } from "@/lib/generateProposalPdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiUrl } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";

const PAGE_SIZE = 10;
const STATUS_OPTIONS: { value: ProposalStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "shared", label: "Shared" },
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
  shared: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
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
  "shared",
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
  const [suspectWonOnly, setSuspectWonOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [page, setPage] = useState(1);
  // Draft filters (edit, then Apply)
  const [draftSearch, setDraftSearch] = useState("");
  const [draftStatusFilter, setDraftStatusFilter] = useState<ProposalStatus | "all">("all");
  const [draftSuspectWonOnly, setDraftSuspectWonOnly] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [draftAssignedToFilter, setDraftAssignedToFilter] = useState<string>("all");
  const [draftSortBy, setDraftSortBy] = useState<SortKey>("date");
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
  const [noteForId, setNoteForId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [deliveryAssignId, setDeliveryAssignId] = useState<string | null>(null);
  const [deliveryAssigneeId, setDeliveryAssigneeId] = useState<string>("");
  const [teamQueryFilter, setTeamQueryFilter] = useState<string>("all");
  const [regionQueryFilter, setRegionQueryFilter] = useState<string>("all");
  const [draftTeamQueryFilter, setDraftTeamQueryFilter] = useState<string>("all");
  const [draftRegionQueryFilter, setDraftRegionQueryFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  useEffect(() => {
    setDraftSearch(search);
    setDraftStatusFilter(statusFilter);
    setDraftSuspectWonOnly(suspectWonOnly);
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setDraftAssignedToFilter(assignedToFilter);
    setDraftSortBy(sortBy);
    setDraftTeamQueryFilter(teamQueryFilter);
    setDraftRegionQueryFilter(regionQueryFilter);
  }, [search, statusFilter, suspectWonOnly, dateFrom, dateTo, assignedToFilter, sortBy, teamQueryFilter, regionQueryFilter]);

  const hasPendingFilterChanges =
    draftSearch !== search ||
    draftStatusFilter !== statusFilter ||
    draftSuspectWonOnly !== suspectWonOnly ||
    draftDateFrom !== dateFrom ||
    draftDateTo !== dateTo ||
    draftAssignedToFilter !== assignedToFilter ||
    draftSortBy !== sortBy ||
    draftTeamQueryFilter !== teamQueryFilter ||
    draftRegionQueryFilter !== regionQueryFilter;

  const applyFilters = () => {
    setSearch(draftSearch);
    setStatusFilter(draftStatusFilter);
    setSuspectWonOnly(draftSuspectWonOnly);
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    setAssignedToFilter(draftAssignedToFilter);
    setSortBy(draftSortBy);
    setTeamQueryFilter(draftTeamQueryFilter);
    setRegionQueryFilter(draftRegionQueryFilter);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftSearch("");
    setDraftStatusFilter("all");
    setDraftSuspectWonOnly(false);
    setDraftDateFrom("");
    setDraftDateTo("");
    setDraftAssignedToFilter("all");
    setDraftSortBy("date");
    setDraftTeamQueryFilter("all");
    setDraftRegionQueryFilter("all");
    setSearch("");
    setStatusFilter("all");
    setSuspectWonOnly(false);
    setDateFrom("");
    setDateTo("");
    setAssignedToFilter("all");
    setSortBy("date");
    setTeamQueryFilter("all");
    setRegionQueryFilter("all");
    setPage(1);
  };

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
    refetchInterval: LIVE_ENTITY_POLL_MS,
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
    await updateProposal(p.id, {
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

  const canMenu = {
    view: true,
    edit: me.role === "super_admin" || me.role === "sales_manager",
    duplicate: me.role === "super_admin" || me.role === "sales_manager",
    status: me.role === "super_admin" || me.role === "sales_manager",
    sendEmail: me.role === "super_admin" || me.role === "sales_manager" || me.role === "sales_rep",
    copyLink: me.role === "super_admin" || me.role === "sales_manager" || me.role === "sales_rep",
    download: me.role !== "support",
    addNote: me.role !== "finance",
    assignDelivery: me.role === "super_admin",
    delete: me.role === "super_admin",
  };

  const nextStatuses = (status: ProposalStatus) => {
    if (status === "won") return [] as ProposalStatus[];
    if (status === "shared") return ["sent", "cold", "rejected"] as ProposalStatus[];
    if (status === "sent") return ["approved", "negotiation", "cold", "rejected"] as ProposalStatus[];
    if (status === "approved") return ["won", "negotiation", "rejected"] as ProposalStatus[];
    return [] as ProposalStatus[];
  };

  const nextProposalNumber = useMemo(
    () => makeProposalNumber(proposals.map((p) => p.proposalNumber)),
    [proposals],
  );

  const duplicateProposal = async (p: Proposal) => {
    const now = new Date().toISOString();
    const copy: Proposal = {
      ...p,
      id: "p" + Math.random().toString(36).slice(2, 10),
      proposalNumber: nextProposalNumber(p.customerCompanyName || p.customerName),
      title: `${p.title} (Copy)`,
      status: "shared",
      dealId: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
      sentAt: undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: me.id,
    };
    await useAppStore.getState().addProposal(copy);
    toast({ title: "Duplicated", description: `${copy.proposalNumber} created as Shared.` });
    await queryClient.invalidateQueries({ queryKey: QK.proposals() });
    await queryClient.refetchQueries({ queryKey: QK.proposals() });
  };

  const stateCustomerId = (location.state as { customerId?: string; detailId?: string } | null)?.customerId;
  const stateDetailId = (location.state as { customerId?: string; detailId?: string } | null)?.detailId;
  const stateEditId = (location.state as { editId?: string } | null)?.editId;
  const detailFromQuery = searchParams.get("detailId");
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
    if (stateEditId) {
      setEditingId(stateEditId);
      setFormOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [stateEditId, navigate, location.pathname]);
  useEffect(() => {
    if (stateDetailId) {
      setDetailId(stateDetailId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [stateDetailId, navigate, location.pathname]);

  useEffect(() => {
    if (detailFromQuery) setDetailId(detailFromQuery);
  }, [detailFromQuery]);
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
    if (suspectWonOnly) {
      list = list.filter((p) => {
        if (p.status !== "won") return false;
        const created = new Date(p.createdAt).getTime();
        const updated = new Date(p.updatedAt || p.createdAt).getTime();
        if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
        return Math.abs(updated - created) <= 60_000;
      });
    }
    if (dateFrom) list = list.filter((p) => p.createdAt >= dateFrom + "T00:00:00");
    if (dateTo) list = list.filter((p) => p.createdAt <= dateTo + "T23:59:59");
    if (assignedToFilter !== "all") list = list.filter((p) => p.assignedTo === assignedToFilter);
    if (teamQueryFilter !== "all") list = list.filter((p) => users.find((u) => u.id === p.assignedTo)?.teamId === teamQueryFilter);
    if (regionQueryFilter !== "all") list = list.filter((p) => users.find((u) => u.id === p.assignedTo)?.regionId === regionQueryFilter);
    if (sortBy === "date") list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortBy === "value") list = [...list].sort((a, b) => (b.finalQuoteValue ?? b.grandTotal) - (a.finalQuoteValue ?? a.grandTotal));
    else if (sortBy === "customer") list = [...list].sort((a, b) => a.customerName.localeCompare(b.customerName));
    return list;
  }, [visible, search, statusFilter, suspectWonOnly, dateFrom, dateTo, assignedToFilter, teamQueryFilter, regionQueryFilter, sortBy, users]);

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
    const headers = ["Proposal #", "Title", "Company Name", "Customer Name", "Assigned To", "Grand Total", "Status", "Valid Until"];
    const rows = filtered.map((p) =>
      (() => {
        const cust = useAppStore.getState().customers.find((c) => c.id === p.customerId);
        const companyName = cust?.companyName || cust?.customerName || p.customerName || "Company";
        const customerName = cust?.customerName || p.customerName || "";
        return [
          p.proposalNumber,
          p.title,
          companyName,
          customerName,
          p.assignedToName,
          p.finalQuoteValue ?? p.grandTotal,
          p.status,
          p.validUntil,
        ].join(",");
      })()
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
      <Topbar
        title="Proposals"
        subtitle={`${filtered.length} proposals`}
        actions={
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
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
        }
      />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 -mx-4 sm:-mx-5 lg:-mx-6 px-4 sm:px-5 lg:px-6 py-6 space-y-5 max-w-[1440px] mx-auto">
        {proposalsQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading proposals...</div>
        )}

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
                value={draftSearch}
                onChange={(e) => {
                  setDraftSearch(e.target.value);
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
                    setDraftStatusFilter(o.value);
                  }}
                  className={cn(
                    "h-8 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors duration-150",
                    draftStatusFilter === o.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                  )}
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setDraftSuspectWonOnly((v) => !v);
                }}
                className={cn(
                  "h-8 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors duration-150",
                  draftSuspectWonOnly
                    ? "bg-orange-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                )}
                title="Flags proposals marked Won within 1 minute of creation"
              >
                Possibly incorrect Won
              </button>
            </div>

            {/* Other filters */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 lg:items-center">
              {(me.role === "super_admin" || me.role === "sales_manager") && (
                <Select
                  value={draftAssignedToFilter}
                  onValueChange={(v) => {
                    setDraftAssignedToFilter(v);
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

              <div className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-2">
                <p className="text-xs text-muted-foreground">Created date</p>
                <Datepicker
                  controls={["calendar"]}
                  select="range"
                  touchUi={true}
                  inputComponent="input"
                  inputProps={{
                    placeholder: "Any date…",
                    className: "h-9 w-full text-sm",
                  }}
                  value={[ymdToDate(draftDateFrom), ymdToDate(draftDateTo)]}
                  onChange={(ev) => {
                    const [f, t] = ev.value;
                    setDraftDateFrom(f ? dateToYmd(f) : "");
                    setDraftDateTo(t ? dateToYmd(t) : "");
                  }}
                />
              </div>

              <Select value={draftSortBy} onValueChange={(v) => setDraftSortBy(v as SortKey)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (newest)</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="customer">Company</SelectItem>
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
                onClick={clearFilters}
              >
                Clear filters
              </Button>
              <Button
                type="button"
                className={cn(
                  "h-9 w-full text-sm bg-blue-600 hover:bg-blue-700 text-white",
                  "sm:col-start-3 sm:justify-self-end sm:w-[160px]",
                  (me.role === "super_admin" || me.role === "sales_manager") && "lg:col-start-5",
                  !(me.role === "super_admin" || me.role === "sales_manager") && "lg:col-start-4",
                )}
                disabled={!hasPendingFilterChanges}
                onClick={applyFilters}
              >
                Apply
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
                        Company
                      </th>
                      <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell dark:text-gray-400">
                        Value
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Actions
                      </th>
                      <th className="hidden px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell dark:text-gray-400">
                        Valid Until
                      </th>
                      <th className="pr-5 px-4 py-3" />
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
                              {(() => {
                                const cust = useAppStore.getState().customers.find((c) => c.id === p.customerId);
                                return cust?.companyName || cust?.customerName || p.customerName || "Company";
                              })()}
                            </button>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {(() => {
                                const cust = useAppStore.getState().customers.find((c) => c.id === p.customerId);
                                return cust?.customerName || p.customerName || cust?.companyName || "Customer";
                              })()}
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-400">({p.assignedToName})</p>
                          </div>
                        </td>
                        <td className="hidden px-4 py-4 text-right sm:table-cell">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            ₹{(p.finalQuoteValue ?? p.grandTotal).toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            <ProposalStatusBadge status={p.status} />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" sideOffset={6} className="min-w-[240px]">
                                {/* Group 0 — Primary actions (contextual) */}
                                {p.status === "draft" && canEditProposal(p) && (
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={async () => {
                                      try {
                                        await submitForApprovalAction(p.id);
                                        await queryClient.invalidateQueries({ queryKey: QK.proposals() });
                                        await queryClient.refetchQueries({ queryKey: QK.proposals() });
                                        toast({ title: "Submitted for approval", description: p.proposalNumber });
                                      } catch (e) {
                                        toast({
                                          title: "Submit failed",
                                          description: e instanceof Error ? e.message : "Try again",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    <Send className="mr-2 h-4 w-4" />
                                    Submit for approval
                                  </DropdownMenuItem>
                                )}
                                {p.status === "approval_pending" && canApprove && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setApproveId(p.id)}>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Approve
                                  </DropdownMenuItem>
                                )}
                                {p.status === "approval_pending" && canReject && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setRejectId(p.id)}>
                                    <X className="mr-2 h-4 w-4" />
                                    Reject
                                  </DropdownMenuItem>
                                )}
                                {p.status === "approved" && canSend && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setSendId(p.id)}>
                                    <Send className="mr-2 h-4 w-4" />
                                    Send
                                  </DropdownMenuItem>
                                )}
                                {p.status === "sent" && canActOnOutcome(p) && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => markWon(p.id)}>
                                    <Trophy className="mr-2 h-4 w-4" />
                                    Mark as won
                                  </DropdownMenuItem>
                                )}
                                {p.status === "won" && !p.dealId && (canApprove || me.role === "super_admin") && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setCreateDealId(p.id)}>
                                    <Handshake className="mr-2 h-4 w-4" />
                                    Create deal
                                  </DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator />

                                {/* Group 1 — View & Edit */}
                                <DropdownMenuItem className="cursor-pointer" onClick={() => setDetailId(p.id)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Proposal
                                </DropdownMenuItem>
                                {canMenu.edit && canEditProposal(p) && (
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={() => {
                                      setEditingId(p.id);
                                      setFormOpen(true);
                                    }}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit Proposal
                                  </DropdownMenuItem>
                                )}
                                {canMenu.duplicate && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => void duplicateProposal(p)}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Duplicate
                                  </DropdownMenuItem>
                                )}

                                {/* Group 2 — Status Change */}
                                {canMenu.status && nextStatuses(p.status).length > 0 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {nextStatuses(p.status).map((st) => (
                                      <DropdownMenuItem
                                        key={st}
                                        className="cursor-pointer"
                                        onClick={() => {
                                          updateProposal(p.id, { status: st });
                                          void queryClient.invalidateQueries({ queryKey: QK.proposals() });
                                          toast({
                                            title: "Status updated",
                                            description: `${p.proposalNumber} → ${st.replace(/_/g, " ")}`,
                                          });
                                        }}
                                      >
                                        {st === "sent" ? <Send className="mr-2 h-4 w-4" /> : null}
                                        {st === "approved" ? <FileText className="mr-2 h-4 w-4" /> : null}
                                        {st === "won" ? <Trophy className="mr-2 h-4 w-4" /> : null}
                                        {st === "cold" ? <Snowflake className="mr-2 h-4 w-4" /> : null}
                                        {st === "rejected" ? <X className="mr-2 h-4 w-4" /> : null}
                                        {st === "negotiation" ? <Handshake className="mr-2 h-4 w-4" /> : null}
                                        Mark as {st.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())}
                                      </DropdownMenuItem>
                                    ))}
                                  </>
                                )}

                                {/* Group 3 — Actions */}
                                <DropdownMenuSeparator />
                                {canMenu.sendEmail && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setSendId(p.id)}>
                                    <Send className="mr-2 h-4 w-4" />
                                    Send via Email
                                  </DropdownMenuItem>
                                )}
                                {canMenu.copyLink && (
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={async () => {
                                      const url = `${window.location.origin}/proposals?detailId=${encodeURIComponent(p.id)}`;
                                      await navigator.clipboard.writeText(url);
                                      toast({ title: "Link copied", description: url });
                                    }}
                                  >
                                    <Link2 className="mr-2 h-4 w-4" />
                                    Copy Proposal Link
                                  </DropdownMenuItem>
                                )}
                                {canMenu.download && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => handleDownloadPdf(p)}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download PDF
                                  </DropdownMenuItem>
                                )}
                                {canMenu.addNote && (
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={() => {
                                      setNoteForId(p.id);
                                      setNoteDraft("");
                                    }}
                                  >
                                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                                    Add Note
                                  </DropdownMenuItem>
                                )}

                                {/* Group 3.5 — Change executive */}
                                {canReassign && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
                                      Change executive
                                    </DropdownMenuLabel>
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger className="cursor-pointer">
                                        <Users className="mr-2 h-4 w-4" />
                                        Assign to…
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto min-w-[260px]">
                                        {users.map((u) => (
                                          <DropdownMenuItem
                                            key={u.id}
                                            className="cursor-pointer"
                                            onClick={() => void changeAssignedTo(p, u.id)}
                                          >
                                            {u.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  </>
                                )}

                                {/* Group 4 — Delivery */}
                                {canMenu.assignDelivery && p.status === "won" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onClick={() => {
                                        setDeliveryAssignId(p.id);
                                        setDeliveryAssigneeId("");
                                      }}
                                    >
                                      <Truck className="mr-2 h-4 w-4" />
                                      Assign Delivery Agent
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {/* Group 5 — Danger zone */}
                                {canMenu.delete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="cursor-pointer text-red-600 focus:text-red-600"
                                      onClick={() => setDeleteProposal(p)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete Proposal
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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
                        <td className="pr-5 px-4 py-4" />
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
          await queryClient.invalidateQueries({ queryKey: QK.customers() });
          await queryClient.invalidateQueries({ queryKey: QK.dashboard() });
        }}
      />

      {approveId && <ApproveProposalDialog proposalId={approveId} onClose={() => setApproveId(null)} />}
      {rejectId && <RejectProposalDialog proposalId={rejectId} onClose={() => setRejectId(null)} />}
      {sendId && <SendProposalDialog proposalId={sendId} onClose={() => setSendId(null)} />}
      <ConvertToDealDialog
        open={!!createDealId}
        proposal={
          createDealId ? proposals.find((p) => p.id === createDealId) ?? null : null
        }
        onClose={() => setCreateDealId(null)}
      />

      <Dialog open={!!noteForId} onOpenChange={(o) => !o && (setNoteForId(null), setNoteDraft(""))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Textarea
              placeholder="Type a note..."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">This will be appended to the proposal’s internal notes.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setNoteForId(null), setNoteDraft(""))}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const id = noteForId;
                if (!id) return;
                const p = proposals.find((x) => x.id === id);
                if (!p) return;
                const prefix = p.notes ? `${p.notes}\n` : "";
                const entry = `• ${new Date().toLocaleString("en-IN")}: ${noteDraft.trim()}`;
                updateProposal(id, { notes: `${prefix}${entry}` });
                toast({ title: "Note added" });
                setNoteForId(null);
                setNoteDraft("");
              }}
              disabled={!noteDraft.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deliveryAssignId} onOpenChange={(o) => !o && (setDeliveryAssignId(null), setDeliveryAssigneeId(""))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign delivery agent</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a delivery agent to assign to this won proposal.</p>
            <Select value={deliveryAssigneeId} onValueChange={setDeliveryAssigneeId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select delivery agent" />
              </SelectTrigger>
              <SelectContent>
                {users
                  .filter((u) => u.role === "delivery_manager" || u.role === "support")
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setDeliveryAssignId(null), setDeliveryAssigneeId(""))}>
              Cancel
            </Button>
            <Button
              disabled={!deliveryAssigneeId}
              onClick={() => {
                const pid = deliveryAssignId;
                if (!pid) return;
                const u = users.find((x) => x.id === deliveryAssigneeId);
                updateProposal(pid, { deliveryAssigneeUserId: deliveryAssigneeId, deliveryAssigneeName: u?.name ?? "" } as any);
                toast({ title: "Assigned", description: u?.name ?? "" });
                setDeliveryAssignId(null);
                setDeliveryAssigneeId("");
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
