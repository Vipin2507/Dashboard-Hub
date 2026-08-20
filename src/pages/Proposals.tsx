import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { makeProposalNumber } from "@/lib/proposalNumber";
import { FilterPanel } from "@/components/FilterPanel";
import { dealAmountsFromProposal } from "@/lib/dealAmountsFromProposal";
import { isProposalWon, proposalStatusLabel, proposalStatusMatches } from "@/lib/proposalStatus";
import { isoToLocalYmd, ymdInInclusiveRange, hydrateTimeRange, parseTimeRangeFromSearchParams, resolveTimeRangeYmd, timeRangeChip, type TimeRangePreset } from "@/lib/dateRange";
import { computeProposalKpis, type ProposalKpiData } from "@/lib/proposalKpis";
import {
  FILTER_SESSION_KEYS,
  clearSessionFilters,
  hasAnySearchParam,
  loadSessionFilters,
  saveSessionFilters,
} from "@/lib/filterSessionPersistence";
import { TimeRangeFilter } from "@/components/TimeRangeFilter";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { CountUp } from "@/components/CountUp";
import { hoverLift, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { motion } from "framer-motion";
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
  Upload,
  Handshake,
  Trophy,
  Snowflake,
  Clock,
  IndianRupee,
  Download,
  Copy,
  Link2,
  MessageSquarePlus,
  MessageCircle,
  Truck,
  CheckCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSmUp } from "@/hooks/useSmUp";
import { Topbar } from "@/components/Topbar";
import { DataTablePagination } from "@/components/DataTablePagination";
import type { Proposal, ProposalStatus } from "@/types";
import { ProposalDetailSheet } from "@/components/ProposalDetailSheet";
import { ProposalLineItemsPreview } from "@/components/ProposalLineItemsPreview";
import { ProposalFormDialog } from "@/components/ProposalFormDialog";
import { ApproveProposalDialog } from "@/components/ApproveProposalDialog";
import { RejectProposalDialog } from "@/components/RejectProposalDialog";
import { SendProposalDialog } from "@/components/SendProposalDialog";
import { ConvertToDealDialog } from "@/components/ConvertToDealDialog";
import { BulkImportProposalsDialog } from "@/components/BulkImportProposalsDialog";
import { generateProposalPdf, generateProposalPdfBlob } from "@/lib/generateProposalPdf";
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

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
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
];

function proposalStatusTone(status: ProposalStatus): StatusTone {
  if (isProposalWon(status) || status === "approved") return "success";
  if (status === "sent" || status === "shared" || status === "negotiation") return "info";
  if (status === "approval_pending") return "warning";
  if (status === "rejected") return "danger";
  return "muted";
}

function proposalValueExclGst(p: Proposal) {
  return dealAmountsFromProposal(p).amountWithoutTax;
}

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
];

function formatProposalDate(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function validUntilExpired(iso: string | undefined, status: ProposalStatus): boolean {
  if (!iso) return false;
  if (status === "approved" || isProposalWon(status) || status === "cold") return false;
  try {
    return new Date(iso) < new Date();
  } catch {
    return false;
  }
}

function ProposalKPICards({
  data,
  active,
  onSelect,
}: {
  data: ProposalKpiData;
  active: "all" | "pending" | "won" | null;
  onSelect: (key: "all" | "pending" | "won") => void;
}) {
  const cards: {
    key: "all" | "pending" | "won" | null;
    label: string;
    value: string;
    sub?: string;
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    badge?: boolean;
  }[] = [
    {
      key: "all",
      label: "Total",
      value: String(data.total),
      icon: FileText,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      key: "pending",
      label: "Pending approval",
      value: String(data.pending),
      sub: data.pending > 0 ? "Needs attention" : "None waiting",
      icon: Clock,
      iconBg: "bg-warning/15",
      iconColor: "text-warning-foreground",
      badge: data.pending > 0,
    },
    {
      key: "won",
      label: "Won",
      value: String(data.won),
      icon: Trophy,
      iconBg: "bg-success/15",
      iconColor: "text-success",
    },
    {
      key: null,
      label: "Pipeline value",
      value: formatINR(data.totalValue),
      sub: "Open excl. GST",
      icon: IndianRupee,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
  ];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isPlainInt = /^\d+$/.test(card.value.trim());
        const inner = (
          <>
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", card.iconBg)}>
              <Icon className={cn("h-3.5 w-3.5", card.iconColor)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
                {isPlainInt ? <CountUp value={Number(card.value)} /> : card.value}
              </p>
              {card.sub ? <p className="truncate text-[10px] text-muted-foreground">{card.sub}</p> : null}
            </div>
            {card.badge ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" /> : null}
          </>
        );
        if (!card.key) {
          return (
            <motion.div key={card.label} variants={staggerItem} className="card-kpi min-h-[3.25rem] w-full sm:min-h-0">
              {inner}
            </motion.div>
          );
        }
        return (
          <motion.button
            key={card.label}
            type="button"
            variants={staggerItem}
            whileHover={hoverLift}
            whileTap={tapPress}
            onClick={() => onSelect(card.key!)}
            className={cn(
              "card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0",
              active === card.key && "border-primary/40 bg-primary/5",
            )}
          >
            {inner}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <StatusPill tone={proposalStatusTone(status)} className="capitalize">
      {proposalStatusLabel(status)}
    </StatusPill>
  );
}

type PersistedProposalsFilters = {
  search: string;
  statusFilter: ProposalStatus | "all";
  suspectWonOnly: boolean;
  dateFrom: string;
  dateTo: string;
  timeRangeFilter?: TimeRangePreset;
  customFrom?: string;
  customTo?: string;
  assignedToFilter: string;
  sortBy: SortKey;
  teamQueryFilter: string;
  regionQueryFilter: string;
};

function initialProposalTimeRange(
  searchParams: URLSearchParams,
  persisted: PersistedProposalsFilters | null | undefined,
): { preset: TimeRangePreset; customFrom: string; customTo: string } {
  const fromUrl = parseTimeRangeFromSearchParams(searchParams);
  if (fromUrl) return fromUrl;
  if (persisted) {
    return hydrateTimeRange({
      timeRangeFilter: persisted.timeRangeFilter,
      dateFrom: persisted.customFrom || persisted.dateFrom,
      dateTo: persisted.customTo || persisted.dateTo,
    });
  }
  return { preset: "this_month", customFrom: "", customTo: "" };
}

export default function Proposals() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const smUp = useSmUp();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
  const customers = useAppStore((s) => s.customers);
  const updateProposal = useAppStore((s) => s.updateProposal);
  const submitForApprovalAction = useAppStore((s) => s.submitForApproval);

  const scope = getScope(me.role, "proposals");

  const persistedProposalsFilters = useMemo(() => {
    if (hasAnySearchParam(searchParams, ["status", "owner", "team", "region", "from", "to", "range"])) {
      return null;
    }
    return loadSessionFilters<PersistedProposalsFilters>(FILTER_SESSION_KEYS.proposals);
  }, [searchParams]);

  const initialTimeRange = useMemo(
    () => initialProposalTimeRange(searchParams, persistedProposalsFilters),
    [persistedProposalsFilters, searchParams],
  );

  const [search, setSearch] = useState(() => persistedProposalsFilters?.search ?? "");
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">(() => {
    const status = searchParams.get("status");
    if (status === "deal_created") return "won";
    if (status && PROPOSAL_STATUS_VALUES.includes(status as ProposalStatus | "all")) {
      return status as ProposalStatus | "all";
    }
    const persisted = persistedProposalsFilters?.statusFilter ?? "all";
    return persisted === "deal_created" ? "won" : persisted;
  });
  const [suspectWonOnly, setSuspectWonOnly] = useState(() => persistedProposalsFilters?.suspectWonOnly ?? false);
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangePreset>(() => initialTimeRange.preset);
  const [customFrom, setCustomFrom] = useState(() => initialTimeRange.customFrom);
  const [customTo, setCustomTo] = useState(() => initialTimeRange.customTo);
  const [assignedToFilter, setAssignedToFilter] = useState<string>(
    () => searchParams.get("owner") || persistedProposalsFilters?.assignedToFilter || "all",
  );
  const [sortBy, setSortBy] = useState<SortKey>(() => persistedProposalsFilters?.sortBy ?? "date");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("ui:proposals:pageSize");
      const n = raw ? Number(raw) : 10;
      return PAGE_SIZE_OPTIONS.includes(n as any) ? n : 10;
    } catch {
      return 10;
    }
  });
  // Draft filters (edit, then Apply)
  const [draftSearch, setDraftSearch] = useState(() => persistedProposalsFilters?.search ?? "");
  const [draftStatusFilter, setDraftStatusFilter] = useState<ProposalStatus | "all">(() => {
    const status = searchParams.get("status");
    if (status === "deal_created") return "won";
    if (status && PROPOSAL_STATUS_VALUES.includes(status as ProposalStatus | "all")) {
      return status as ProposalStatus | "all";
    }
    const persisted = persistedProposalsFilters?.statusFilter ?? "all";
    return persisted === "deal_created" ? "won" : persisted;
  });
  const [draftSuspectWonOnly, setDraftSuspectWonOnly] = useState(
    () => persistedProposalsFilters?.suspectWonOnly ?? false,
  );
  const [draftTimeRangeFilter, setDraftTimeRangeFilter] = useState<TimeRangePreset>(() => initialTimeRange.preset);
  const [draftCustomFrom, setDraftCustomFrom] = useState(() => initialTimeRange.customFrom);
  const [draftCustomTo, setDraftCustomTo] = useState(() => initialTimeRange.customTo);
  const [draftAssignedToFilter, setDraftAssignedToFilter] = useState<string>(
    () => searchParams.get("owner") || persistedProposalsFilters?.assignedToFilter || "all",
  );
  const [draftSortBy, setDraftSortBy] = useState<SortKey>(() => persistedProposalsFilters?.sortBy ?? "date");
  const statusFromUrl = searchParams.get("status");
  const ownerFromUrl = searchParams.get("owner");
  const teamFromUrl = searchParams.get("team");
  const regionFromUrl = searchParams.get("region");
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
  const [teamQueryFilter, setTeamQueryFilter] = useState<string>(
    () => searchParams.get("team") || persistedProposalsFilters?.teamQueryFilter || "all",
  );
  const [regionQueryFilter, setRegionQueryFilter] = useState<string>(
    () => searchParams.get("region") || persistedProposalsFilters?.regionQueryFilter || "all",
  );
  const [draftTeamQueryFilter, setDraftTeamQueryFilter] = useState<string>(
    () => searchParams.get("team") || persistedProposalsFilters?.teamQueryFilter || "all",
  );
  const [draftRegionQueryFilter, setDraftRegionQueryFilter] = useState<string>(
    () => searchParams.get("region") || persistedProposalsFilters?.regionQueryFilter || "all",
  );
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [sharePdfId, setSharePdfId] = useState<string | null>(null);
  const [sharePdfPhone, setSharePdfPhone] = useState("");
  const [sharePdfMessage, setSharePdfMessage] = useState("");
  const [sharePdfLoading, setSharePdfLoading] = useState(false);

  const { from: dateFrom, to: dateTo } = resolveTimeRangeYmd(timeRangeFilter, customFrom, customTo);

  useEffect(() => {
    setDraftSearch(search);
    setDraftStatusFilter(statusFilter);
    setDraftSuspectWonOnly(suspectWonOnly);
    setDraftTimeRangeFilter(timeRangeFilter);
    setDraftCustomFrom(customFrom);
    setDraftCustomTo(customTo);
    setDraftAssignedToFilter(assignedToFilter);
    setDraftSortBy(sortBy);
    setDraftTeamQueryFilter(teamQueryFilter);
    setDraftRegionQueryFilter(regionQueryFilter);
  }, [search, statusFilter, suspectWonOnly, timeRangeFilter, customFrom, customTo, assignedToFilter, sortBy, teamQueryFilter, regionQueryFilter]);

  const hasPendingFilterChanges =
    draftSearch !== search ||
    draftStatusFilter !== statusFilter ||
    draftSuspectWonOnly !== suspectWonOnly ||
    draftTimeRangeFilter !== timeRangeFilter ||
    draftCustomFrom !== customFrom ||
    draftCustomTo !== customTo ||
    draftAssignedToFilter !== assignedToFilter ||
    draftSortBy !== sortBy ||
    draftTeamQueryFilter !== teamQueryFilter ||
    draftRegionQueryFilter !== regionQueryFilter;

  const applyFilters = () => {
    setSearch(draftSearch);
    setStatusFilter(draftStatusFilter);
    setSuspectWonOnly(draftSuspectWonOnly);
    setTimeRangeFilter(draftTimeRangeFilter);
    setCustomFrom(draftCustomFrom);
    setCustomTo(draftCustomTo);
    setAssignedToFilter(draftAssignedToFilter);
    setSortBy(draftSortBy);
    setTeamQueryFilter(draftTeamQueryFilter);
    setRegionQueryFilter(draftRegionQueryFilter);
    setPage(1);
    const resolved = resolveTimeRangeYmd(draftTimeRangeFilter, draftCustomFrom, draftCustomTo);
    saveSessionFilters(FILTER_SESSION_KEYS.proposals, {
      search: draftSearch,
      statusFilter: draftStatusFilter,
      suspectWonOnly: draftSuspectWonOnly,
      dateFrom: resolved.from,
      dateTo: resolved.to,
      timeRangeFilter: draftTimeRangeFilter,
      customFrom: draftCustomFrom,
      customTo: draftCustomTo,
      assignedToFilter: draftAssignedToFilter,
      sortBy: draftSortBy,
      teamQueryFilter: draftTeamQueryFilter,
      regionQueryFilter: draftRegionQueryFilter,
    });
  };

  const clearFilters = () => {
    setDraftSearch("");
    setDraftStatusFilter("all");
    setDraftSuspectWonOnly(false);
    setDraftTimeRangeFilter("all");
    setDraftCustomFrom("");
    setDraftCustomTo("");
    setDraftAssignedToFilter("all");
    setDraftSortBy("date");
    setDraftTeamQueryFilter("all");
    setDraftRegionQueryFilter("all");
    setSearch("");
    setStatusFilter("all");
    setSuspectWonOnly(false);
    setTimeRangeFilter("all");
    setCustomFrom("");
    setCustomTo("");
    setAssignedToFilter("all");
    setSortBy("date");
    setTeamQueryFilter("all");
    setRegionQueryFilter("all");
    setPage(1);
    clearSessionFilters(FILTER_SESSION_KEYS.proposals);
  };

  const hasActiveAppliedFilters =
    search !== "" ||
    statusFilter !== "all" ||
    suspectWonOnly ||
    timeRangeFilter !== "all" ||
    assignedToFilter !== "all" ||
    sortBy !== "date" ||
    teamQueryFilter !== "all" ||
    regionQueryFilter !== "all";

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
    edit: me.role === "super_admin" || me.role === "sales_manager" || me.role === "sales_rep",
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
    if (isProposalWon(status)) return [] as ProposalStatus[];
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
    if (statusFromUrl === "deal_created") {
      setStatusFilter("won");
    } else if (statusFromUrl && PROPOSAL_STATUS_VALUES.includes(statusFromUrl as ProposalStatus | "all")) {
      setStatusFilter(statusFromUrl as ProposalStatus | "all");
    }
  }, [statusFromUrl]);
  useEffect(() => {
    if (ownerFromUrl) setAssignedToFilter(ownerFromUrl);
    if (teamFromUrl) setTeamQueryFilter(teamFromUrl);
    if (regionFromUrl) setRegionQueryFilter(regionFromUrl);
    const parsed = parseTimeRangeFromSearchParams(searchParams);
    if (!parsed) return;
    setTimeRangeFilter(parsed.preset);
    setCustomFrom(parsed.customFrom);
    setCustomTo(parsed.customTo);
    setDraftTimeRangeFilter(parsed.preset);
    setDraftCustomFrom(parsed.customFrom);
    setDraftCustomTo(parsed.customTo);
  }, [ownerFromUrl, teamFromUrl, regionFromUrl, searchParams]);

  const scopedForKpi = useMemo(() => {
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
    if (assignedToFilter !== "all") list = list.filter((p) => p.assignedTo === assignedToFilter);
    if (teamQueryFilter !== "all") list = list.filter((p) => users.find((u) => u.id === p.assignedTo)?.teamId === teamQueryFilter);
    if (regionQueryFilter !== "all") list = list.filter((p) => users.find((u) => u.id === p.assignedTo)?.regionId === regionQueryFilter);
    return list;
  }, [visible, search, assignedToFilter, teamQueryFilter, regionQueryFilter, users]);

  const filtered = useMemo(() => {
    let list = scopedForKpi;
    if (statusFilter !== "all") list = list.filter((p) => proposalStatusMatches(p.status, statusFilter));
    if (suspectWonOnly) {
      list = list.filter((p) => {
        if (!isProposalWon(p.status)) return false;
        const created = new Date(p.createdAt).getTime();
        const updated = new Date(p.updatedAt || p.createdAt).getTime();
        if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
        return Math.abs(updated - created) <= 60_000;
      });
    }
    if (dateFrom || dateTo) {
      list = list.filter((p) => ymdInInclusiveRange(isoToLocalYmd(p.createdAt), dateFrom, dateTo));
    }
    if (sortBy === "date") list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortBy === "value") list = [...list].sort((a, b) => proposalValueExclGst(b) - proposalValueExclGst(a));
    else if (sortBy === "customer") list = [...list].sort((a, b) => a.customerName.localeCompare(b.customerName));
    return list;
  }, [scopedForKpi, statusFilter, suspectWonOnly, dateFrom, dateTo, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    try {
      localStorage.setItem("ui:proposals:pageSize", String(pageSize));
    } catch {
      // ignore
    }
  }, [pageSize]);

  const kpiMetrics = useMemo(
    () =>
      computeProposalKpis(
        scopedForKpi.map((p) => ({
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          valueExclGst: proposalValueExclGst(p),
        })),
        dateFrom,
        dateTo,
      ),
    [scopedForKpi, dateFrom, dateTo],
  );

  const handleExportCsv = () => {
    const headers = [
      "Sr No.",
      "Date",
      "Month",
      "Lead Name",
      "City",
      "Deal Owner",
      "Company Name",
      "Proposal Stage",
      "Proposal Shared",
      "No. of License",
      "Deal Value",
    ];

    const rows = filtered.map((p, index) => {
      const cust = useAppStore.getState().customers.find((c) => c.id === p.customerId);
      const companyName = cust?.companyName || cust?.customerName || p.customerName || "";
      const customerName = cust?.customerName || p.customerName || "";
      const city = cust?.address?.city || "";
      const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "";
      const month = p.createdAt
        ? new Date(p.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
        : "";
      const proposalShared =
        p.status === "shared" || p.status === "sent" || p.status === "approval_pending" || p.status === "approved"
          ? p.sentAt
            ? new Date(p.sentAt).toLocaleDateString("en-IN")
            : ""
          : "";

      // Format license info with item names and quantities
      const licenseInfo = p.lineItems
        .map((item) => `${item.name} (${item.qty})`)
        .join("; ");

      return [
        index + 1,
        createdDate,
        month,
        customerName,
        city,
        p.assignedToName,
        companyName,
        proposalStatusLabel(p.status),
        proposalShared,
        licenseInfo,
        p.finalQuoteValue ?? p.grandTotal,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proposals");

    XLSX.writeFile(wb, `proposals-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    if (p.status !== "draft" && p.status !== "rejected" && p.status !== "negotiation" && p.status !== "approval_pending") return false;
    if (scope === "SELF" && p.assignedTo !== me.id) return false;
    return true;
  };

  const canActOnOutcome = (p: Proposal) => {
    if (!canUpdate) return false;
    if (scope === "SELF" && p.assignedTo !== me.id) return false;
    if (p.dealId) return false;
    return ["sent", "approved", "negotiation"].includes(p.status) || isProposalWon(p.status);
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
    setCreateDealId(id);
    toast({ title: "Create deal", description: "Complete the deal form to finalize this win." });
  };

  const applyKpiFilter = (key: "all" | "pending" | "won") => {
    const nextStatus: ProposalStatus | "all" =
      key === "pending" ? "approval_pending" : key === "won" ? "won" : "all";
    setDraftStatusFilter(nextStatus);
    setStatusFilter(nextStatus);
    setPage(1);
    saveSessionFilters(FILTER_SESSION_KEYS.proposals, {
      search,
      statusFilter: nextStatus,
      suspectWonOnly,
      dateFrom,
      dateTo,
      timeRangeFilter,
      customFrom,
      customTo,
      assignedToFilter,
      sortBy,
      teamQueryFilter,
      regionQueryFilter,
    });
  };

  const kpiActive: "all" | "pending" | "won" | null =
    statusFilter === "approval_pending"
      ? "pending"
      : statusFilter === "won"
        ? "won"
        : statusFilter === "all"
          ? "all"
          : null;

  const dateChip = timeRangeChip(timeRangeFilter, dateFrom, dateTo);

  const proposalActions = (p: Proposal) => (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="max-h-[min(70vh,28rem)] min-w-[240px] overflow-y-auto">
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
          {isProposalWon(p.status) && !p.dealId && (canApprove || me.role === "super_admin") && (
            <DropdownMenuItem className="cursor-pointer" onClick={() => setCreateDealId(p.id)}>
              <Handshake className="mr-2 h-4 w-4" />
              Create deal
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

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

          {canMenu.status && nextStatuses(p.status).length > 0 && (
            <>
              <DropdownMenuSeparator />
              {nextStatuses(p.status).map((st) => (
                <DropdownMenuItem
                  key={st}
                  className="cursor-pointer"
                  onClick={() => {
                    if (st === "won") {
                      markWon(p.id);
                      return;
                    }
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

          <DropdownMenuSeparator />
          {canMenu.sendEmail && (
            <>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setSendId(p.id)}>
                <Send className="mr-2 h-4 w-4" />
                Send via Email
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => {
                  setSharePdfId(p.id);
                  const cust = useAppStore.getState().customers.find((c) => c.id === p.customerId);
                  setSharePdfPhone(cust?.primaryPhone || "");
                  setSharePdfMessage(`Here is the proposal: ${p.proposalNumber}`);
                }}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Share via WhatsApp
              </DropdownMenuItem>
            </>
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

          {canReassign && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Change executive</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                  <Users className="mr-2 h-4 w-4" />
                  Assign to…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[320px] min-w-[260px] overflow-y-auto">
                  {users.map((u) => (
                    <DropdownMenuItem key={u.id} className="cursor-pointer" onClick={() => void changeAssignedTo(p, u.id)}>
                      {u.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}

          {canMenu.assignDelivery && isProposalWon(p.status) && (
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

          {canMenu.delete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
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
  );

  return (
    <>
      <Topbar
        title="Proposals"
        subtitle={`${filtered.length} in scope`}
        actions={
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
            {canExport && (
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={handleExportCsv}>
                <FileDown className="mr-1 h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {canCreate && (
              <>
                <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setBulkImportOpen(true)}>
                  <Upload className="mr-1 h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => {
                    setEditingId(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5 shrink-0" />
                  New
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="space-y-2.5">
        {proposalsQuery.isLoading && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Syncing proposals
          </p>
        )}

        <ProposalKPICards data={kpiMetrics} active={kpiActive} onSelect={applyKpiFilter} />

        <FilterPanel
          title="Filters"
          storageKey="ui:proposals:filtersOpen"
          defaultOpen={smUp}
          headerActions={
            hasActiveAppliedFilters ? (
              <div className="scrollbar-none flex min-w-0 flex-wrap items-center justify-end gap-1 overflow-x-auto">
                {dateChip ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {dateChip}
                  </span>
                ) : null}
                {statusFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                    {statusFilter.replace(/_/g, " ")}
                  </span>
                ) : null}
                {suspectWonOnly ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Suspect won
                  </span>
                ) : null}
                {assignedToFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {users.find((u) => u.id === assignedToFilter)?.name ?? "Owner"}
                  </span>
                ) : null}
                {teamQueryFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {teams.find((t) => t.id === teamQueryFilter)?.name ?? "Team"}
                  </span>
                ) : null}
                {regionQueryFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {regions.find((r) => r.id === regionQueryFilter)?.name ?? "Region"}
                  </span>
                ) : null}
              </div>
            ) : null
          }
        >
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search proposal, customer…"
                  className="h-9 pl-8 text-sm"
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                />
              </div>
              <div className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setDraftStatusFilter(o.value)}
                    className={cn(
                      "h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors",
                      draftStatusFilter === o.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDraftSuspectWonOnly((v) => !v)}
                  className={cn(
                    "h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors",
                    draftSuspectWonOnly
                      ? "bg-warning text-warning-foreground"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title="Flags proposals marked Won within 1 minute of creation"
                >
                  Suspect won
                </button>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(me.role === "super_admin" || me.role === "sales_manager") && (
                <Select value={draftAssignedToFilter} onValueChange={setDraftAssignedToFilter}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={draftTeamQueryFilter} onValueChange={setDraftTeamQueryFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={draftRegionQueryFilter} onValueChange={setDraftRegionQueryFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TimeRangeFilter
                preset={draftTimeRangeFilter}
                customFrom={draftCustomFrom}
                customTo={draftCustomTo}
                onPresetChange={setDraftTimeRangeFilter}
                onCustomChange={(from, to) => {
                  setDraftCustomFrom(from);
                  setDraftCustomTo(to);
                }}
                customPlaceholder="Created date…"
              />
              <Select value={draftSortBy} onValueChange={(v) => setDraftSortBy(v as SortKey)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (newest)</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="customer">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                disabled={!hasActiveAppliedFilters && !hasPendingFilterChanges}
                onClick={clearFilters}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                disabled={!hasPendingFilterChanges}
                onClick={applyFilters}
              >
                Apply
              </Button>
            </div>
          </div>
        </FilterPanel>

        <motion.div variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <FileQuestion className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No proposals found</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Adjust filters or create a proposal.</p>
              {canCreate && (
                <Button size="sm" className="mt-3 h-8 px-2.5 text-xs" onClick={() => setFormOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> New
                </Button>
              )}
            </div>
          ) : (
            <>
              {!smUp ? (
                <div className="divide-y divide-border">
                  {pageItems.map((p) => {
                    const cust = customers.find((c) => c.id === p.customerId);
                    return (
                      <div key={p.id} className="flex items-start gap-2 px-2.5 py-2.5">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(p.id)}>
                          <p className="truncate font-mono text-xs font-medium text-primary">{p.proposalNumber}</p>
                          <p className="truncate text-sm font-medium">{cust?.companyName || cust?.customerName || p.customerName || "—"}</p>
                          <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                            <ProposalLineItemsPreview lineItems={p.lineItems} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <ProposalStatusBadge status={p.status} />
                            <span className="text-xs font-semibold tabular-nums">{formatINR(proposalValueExclGst(p))}</span>
                          </div>
                        </button>
                        {proposalActions(p)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="scrollbar-soft overflow-x-auto">
                  <Table responsiveShell={false}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proposal</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-right">Value excl. GST</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden lg:table-cell">Created</TableHead>
                        <TableHead className="hidden md:table-cell">Valid until</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageItems.map((p) => {
                        const cust = customers.find((c) => c.id === p.customerId);
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => setDetailId(p.id)}
                                className="font-mono text-xs font-medium text-primary hover:underline"
                              >
                                {p.proposalNumber}
                              </button>
                              <div className="mt-0.5">
                                <ProposalLineItemsPreview lineItems={p.lineItems} />
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[14rem]">
                              <button
                                type="button"
                                className="truncate text-left font-medium hover:underline"
                                onClick={() => navigate(`/customers/${p.customerId}`)}
                              >
                                {cust?.companyName || cust?.customerName || p.customerName || "—"}
                              </button>
                              <p className="truncate text-[11px] text-muted-foreground">{p.assignedToName}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                              {formatINR(proposalValueExclGst(p))}
                            </TableCell>
                            <TableCell>
                              <ProposalStatusBadge status={p.status} />
                            </TableCell>
                            <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                              {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "—"}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "hidden whitespace-nowrap md:table-cell",
                                validUntilExpired(p.validUntil, p.status) ? "font-medium text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {formatProposalDate(p.validUntil)}
                            </TableCell>
                            <TableCell className="text-right">{proposalActions(p)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {filtered.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Rows</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        const n = Number(v);
                        setPageSize(n);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[72px] text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {totalPages > 1 && (
                    <DataTablePagination
                      className="border-0 px-0 py-0"
                      page={currentPage}
                      totalPages={totalPages}
                      total={filtered.length}
                      perPage={pageSize}
                      onPageChange={setPage}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>
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

      <Dialog open={!!sharePdfId} onOpenChange={(o) => !o && (setSharePdfId(null), setSharePdfPhone(""), setSharePdfMessage(""))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share PDF via WhatsApp</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">WhatsApp Number (with country code)</label>
              <Input
                placeholder="e.g. 919876543210"
                value={sharePdfPhone}
                onChange={(e) => setSharePdfPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message (Optional)</label>
              <Textarea
                placeholder="Type an optional message..."
                value={sharePdfMessage}
                onChange={(e) => setSharePdfMessage(e.target.value)}
                rows={3}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSharePdfId(null)} disabled={sharePdfLoading}>
              Cancel
            </Button>
            <Button
              disabled={!sharePdfPhone.trim() || sharePdfLoading}
              onClick={async () => {
                if (!sharePdfId) return;
                const p = proposals.find((x) => x.id === sharePdfId);
                if (!p) return;

                try {
                  setSharePdfLoading(true);
                  toast({ title: "Generating PDF..." });

                  // Wait slightly for UI to update
                  await new Promise((r) => setTimeout(r, 100));

                  const blob = await generateProposalPdfBlob(p);
                  const file = new File([blob], `Proposal-${p.proposalNumber}.pdf`, { type: "application/pdf" });

                  const formData = new FormData();
                  formData.append("to", sharePdfPhone);
                  formData.append("message", sharePdfMessage);
                  formData.append("customerId", p.customerId);
                  formData.append("proposalId", p.id);
                  formData.append("userId", me.id);
                  formData.append("userName", me.name);
                  formData.append("file", file);

                  const res = await fetch(apiUrl("/api/send-media"), {
                    method: "POST",
                    body: formData,
                  });

                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || err.error || "Failed to send PDF");
                  }

                  toast({ title: "Sent successfully", description: "PDF shared via WhatsApp." });
                  setSharePdfId(null);
                  setSharePdfPhone("");
                  setSharePdfMessage("");

                  // Optionally mark as shared if draft
                  if (p.status === "draft") {
                    updateProposal(p.id, { status: "shared" });
                    void queryClient.invalidateQueries({ queryKey: QK.proposals() });
                  }
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Error sending PDF";
                  toast({ title: "Failed to share", description: message, variant: "destructive" });
                } finally {
                  setSharePdfLoading(false);
                }
              }}
            >
              {sharePdfLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send PDF"
              )}
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
