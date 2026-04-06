import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Check,
  X,
  Trash2,
  FileDown,
  ChevronDown,
  FileQuestion,
  Loader2,
  Filter,
  Upload,
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
import { apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";

const PAGE_SIZE = 10;
const STATUS_OPTIONS: { value: ProposalStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approval_pending", label: "Approval Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "deal_created", label: "Deal Created" },
];

const STATUS_BADGE: Record<ProposalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  approval_pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-green-500/15 text-green-700 dark:text-green-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  deal_created: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

type SortKey = "date" | "value" | "customer";

const PROPOSAL_STATUS_VALUES: (ProposalStatus | "all")[] = ["all", "draft", "sent", "approval_pending", "approved", "rejected", "deal_created"];

function formatProposalDate(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
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

  const pendingCount = useMemo(() => visible.filter((p) => p.status === "approval_pending").length, [visible]);
  const totalValue = useMemo(() => filtered.reduce((s, p) => s + (p.finalQuoteValue ?? p.grandTotal), 0), [filtered]);
  const approvedThisMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return visible
      .filter((p) => p.status === "approved" && p.approvedAt && p.approvedAt >= start)
      .reduce((s, p) => s + (p.finalQuoteValue ?? p.grandTotal), 0);
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

  const isExpired = (p: Proposal) => {
    if (p.status === "approved" || p.status === "deal_created") return false;
    return p.validUntil && new Date(p.validUntil) < new Date();
  };

  const detailProposal = detailId ? proposals.find((p) => p.id === detailId) : null;
  const canEditProposal = (p: Proposal) => {
    if (!canUpdate) return false;
    if (p.status !== "draft" && p.status !== "rejected") return false;
    if (scope === "SELF" && p.assignedTo !== me.id) return false;
    return true;
  };

  return (
    <>
      <Topbar
        title="Proposals"
        subtitle={`${visible.length} proposals`}
      />
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        {proposalsQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading proposals...</div>
        )}

        {/* Title + primary actions (matches Customers page pattern) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">Proposals</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {filtered.length} shown
              {visible.length !== filtered.length ? ` · ${visible.length} in your access` : ""}
            </p>
          </div>
          {(canExport || canCreate) && (
            <div className="flex w-full flex-wrap items-stretch justify-end gap-2 sm:w-auto sm:items-center">
              {canExport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 min-h-9 min-w-0 flex-1 sm:min-w-[7.5rem] sm:flex-initial"
                  onClick={handleExportCsv}
                >
                  <FileDown className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="truncate">Export</span>
                </Button>
              )}
              {canCreate && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 min-h-9 min-w-0 flex-1 sm:min-w-[9rem] sm:flex-initial"
                    onClick={() => setBulkImportOpen(true)}
                  >
                    <Upload className="mr-1.5 h-4 w-4 shrink-0" />
                    <span className="truncate">Bulk import</span>
                  </Button>
                  <Button
                    className={cn(
                      "h-9 min-h-9 min-w-0 bg-primary text-primary-foreground hover:bg-primary/90 sm:min-w-[9rem] sm:flex-initial",
                      canExport ? "flex-[1_1_100%]" : "flex-1",
                    )}
                    onClick={() => {
                      setEditingId(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                    <span className="truncate">New Proposal</span>
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Search + filters only */}
        <div className="space-y-3">
          <div className="flex gap-2 sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search proposals..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full pl-9 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-3 sm:hidden"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
          <div
            className={cn(
              "flex flex-col gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3",
              !filtersOpen && "hidden sm:flex",
            )}
          >
            <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5 sm:max-w-full sm:flex-wrap sm:overflow-visible sm:pb-0">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(o.value);
                    setPage(1);
                  }}
                  className={cn(
                    "flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === o.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 lg:max-w-4xl">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 min-w-0 w-full sm:w-[140px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 min-w-0 w-full sm:w-[140px]"
              />
              {(me.role === "super_admin" || me.role === "sales_manager") && (
                <Select value={assignedToFilter} onValueChange={(v) => { setAssignedToFilter(v); setPage(1); }}>
                  <SelectTrigger className="col-span-2 h-9 w-full min-w-0 sm:col-span-1 sm:w-40">
                    <SelectValue placeholder="Assigned to" />
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
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="col-span-2 h-9 w-full min-w-0 sm:col-span-1 sm:w-36">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (newest)</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Total Proposals</p>
              <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Pending Approval</p>
              <p className="text-2xl font-bold text-amber-600">{visible.filter((p) => p.status === "approval_pending").length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Total Value</p>
              <p className="text-2xl font-bold text-foreground">{formatINR(totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Approved This Month</p>
              <p className="text-2xl font-bold text-green-600">{formatINR(approvedThisMonth)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="overflow-hidden border border-border bg-card">
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileQuestion className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No proposals found</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first proposal to get started.</p>
                {canCreate && (
                  <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>+ New Proposal</Button>
                )}
              </div>
            ) : (
              <>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                        <TableHead className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                          Proposal #
                        </TableHead>
                        <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                          Customer
                        </TableHead>
                        <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell md:px-4 md:py-3">
                          Grand Total
                        </TableHead>
                        <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell md:px-4 md:py-3">
                          Valid Until
                        </TableHead>
                        <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                          Status
                        </TableHead>
                        <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell md:px-4 md:py-3">
                          Assigned To
                        </TableHead>
                        <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell md:px-4 md:py-3">
                          Created
                        </TableHead>
                        <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground xl:table-cell md:px-4 md:py-3">
                          Title
                        </TableHead>
                        <TableHead className="w-[200px] px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border">
                      {pageItems.map((p) => (
                        <TableRow key={p.id} className="transition-colors hover:bg-muted/50">
                          <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                            <button
                              type="button"
                              className="text-left font-mono text-sm text-primary hover:underline"
                              onClick={() => setDetailId(p.id)}
                            >
                              {p.proposalNumber}
                            </button>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-sm text-muted-foreground md:px-4 md:py-3.5">
                              <button
                                type="button"
                                className="text-left text-primary hover:underline"
                                onClick={() => navigate(`/customers/${p.customerId}`)}
                              >
                                {p.customerName}
                              </button>
                            </TableCell>
                          <TableCell className="hidden px-3 py-3 text-right font-mono text-sm md:table-cell md:px-4 md:py-3.5">{formatINR(p.finalQuoteValue ?? p.grandTotal)}</TableCell>
                          <TableCell className={`hidden px-3 py-3 text-xs md:table-cell md:px-4 md:py-3.5 ${isExpired(p) ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                            {p.validUntil}
                          </TableCell>
                          <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                            <Badge variant="secondary" className={STATUS_BADGE[p.status]}>
                              {p.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell md:px-4 md:py-3.5">{p.assignedToName}</TableCell>
                          <TableCell className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell md:px-4 md:py-3.5">
                            {formatProposalDate(p.createdAt)}
                          </TableCell>
                          <TableCell className="hidden px-3 py-3 text-sm font-medium xl:table-cell md:px-4 md:py-3.5">{p.title}</TableCell>
                          <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              {canUpdate && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setDetailId(p.id)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                              {canEditProposal(p) && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditingId(p.id); setFormOpen(true); }}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {canSend && (p.status === "approved" || p.status === "draft") && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Send" onClick={() => setSendId(p.id)}>
                                  <Send className="w-4 h-4" />
                                </Button>
                              )}
                              {canApprove && p.status === "approval_pending" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" title="Approve" onClick={() => setApproveId(p.id)}>
                                  <Check className="w-4 h-4" />
                                </Button>
                              )}
                              {canReject && p.status === "approval_pending" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Reject" onClick={() => setRejectId(p.id)}>
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                              {(canApprove || me.role === "super_admin") && p.status === "approved" && !p.dealId && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Create Deal" onClick={() => setCreateDealId(p.id)}>
                                  <FileText className="w-4 h-4" />
                                </Button>
                              )}
                              {canDelete && p.status === "draft" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setDeleteProposal(p)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Download PDF" disabled={pdfLoading} onClick={() => handleDownloadPdf(p)}>
                                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                {totalPages > 1 && (
                  <DataTablePagination
                    page={currentPage}
                    totalPages={totalPages}
                    total={filtered.length}
                    perPage={PAGE_SIZE}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
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
