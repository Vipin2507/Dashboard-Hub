import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useCustomersListQuery } from "@/hooks/useCustomersListQuery";
import { mapCustomersApiRowsToStore, patchCustomerRowInStore, persistCustomerCreate, persistCustomerUpdate } from "@/lib/customerPersistence";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { apiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { TimeRangeFilter } from "@/components/TimeRangeFilter";
import {
  hydrateTimeRange,
  isoToLocalYmd,
  parseTimeRangeFromSearchParams,
  resolveTimeRangeYmd,
  timeRangeChip,
  ymdInInclusiveRange,
  type TimeRangePreset,
} from "@/lib/dateRange";
import {
  FILTER_SESSION_KEYS,
  clearSessionFilters,
  hasAnySearchParam,
  loadSessionFilters,
  saveSessionFilters,
} from "@/lib/filterSessionPersistence";
import { FilterPanel } from "@/components/FilterPanel";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { CountUp } from "@/components/CountUp";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
  FileDown,
  LayoutGrid,
  List,
  Upload,
  Users,
  UserPlus,
  DollarSign,
  CheckCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSmUp } from "@/hooks/useSmUp";
import type { Customer, CustomerStatus } from "@/types";
import { Topbar } from "@/components/Topbar";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { BulkImportCustomersDialog } from "@/components/BulkImportCustomersDialog";
import { RenewalSubscriptionTracker } from "@/components/RenewalSubscriptionTracker";
import { DataTablePagination } from "@/components/DataTablePagination";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { hoverLift, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { motion } from "framer-motion";

const VIEW_STORAGE_KEY = "buildesk_customers_view";
const TABLE_PAGE_SIZE = 10;
const CARD_PAGE_SIZE = 12;

const STATUS_OPTIONS: { value: CustomerStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "lead", label: "Lead" },
  { value: "churned", label: "Churned" },
  { value: "blacklisted", label: "Blacklisted" },
];

function statusTone(status: CustomerStatus): StatusTone {
  if (status === "active") return "success";
  if (status === "lead") return "info";
  if (status === "churned") return "warning";
  if (status === "blacklisted") return "danger";
  return "muted";
}

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <StatusPill tone={statusTone(status)} className="capitalize">
      {status}
    </StatusPill>
  );
}

function CustomerKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const isPlainInt = /^\d+$/.test(String(value).trim());
  const inner = (
    <>
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
          {isPlainInt ? <CountUp value={Number(value)} /> : value}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        variants={staggerItem}
        whileHover={hoverLift}
        whileTap={tapPress}
        className={cn(
          "card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0",
          active && "border-primary/40 bg-primary/5",
        )}
      >
        {inner}
      </motion.button>
    );
  }
  return (
    <motion.div variants={staggerItem} className="card-kpi w-full">
      {inner}
    </motion.div>
  );
}

type PersistedCustomerFilters = {
  search: string;
  statusFilter: CustomerStatus | "all";
  regionFilter: string;
  assignedToFilter: string;
  teamQueryFilter: string;
  industryFilter: string;
  tagsFilter: string;
  dateFrom: string;
  dateTo: string;
  timeRangeFilter?: TimeRangePreset;
  customFrom?: string;
  customTo?: string;
};

function defaultCustomerFilters(): PersistedCustomerFilters {
  return {
    search: "",
    statusFilter: "all",
    regionFilter: "all",
    assignedToFilter: "all",
    teamQueryFilter: "all",
    industryFilter: "all",
    tagsFilter: "",
    dateFrom: "",
    dateTo: "",
    timeRangeFilter: "this_month",
  };
}

function filtersFromSearchParams(params: URLSearchParams): Partial<PersistedCustomerFilters> {
  const next: Partial<PersistedCustomerFilters> = {};
  const q = params.get("q");
  const status = params.get("status");
  const owner = params.get("owner");
  const team = params.get("team");
  const region = params.get("region");
  const from = params.get("from");
  const to = params.get("to");
  const range = params.get("range");
  if (q != null) next.search = q;
  if (status && STATUS_OPTIONS.some((s) => s.value === status)) {
    next.statusFilter = status as CustomerStatus | "all";
  }
  if (owner) next.assignedToFilter = owner;
  if (team) next.teamQueryFilter = team;
  if (region) next.regionFilter = region;
  if (range === "all" || range === "this_week" || range === "this_month" || range === "this_year" || range === "previous_year" || range === "custom") {
    next.timeRangeFilter = range;
  }
  if (from) next.dateFrom = from;
  if (to) next.dateTo = to;
  return next;
}

function loadInitialCustomerFilters(searchParams: URLSearchParams): PersistedCustomerFilters {
  if (hasAnySearchParam(searchParams, ["q", "status", "owner", "team", "region", "from", "to", "range", "tab"])) {
    return { ...defaultCustomerFilters(), ...filtersFromSearchParams(searchParams) };
  }
  return loadSessionFilters<PersistedCustomerFilters>(FILTER_SESSION_KEYS.customers) ?? defaultCustomerFilters();
}

export default function Customers() {
  const navigate = useNavigate();
  const smUp = useSmUp();
  const [searchParams] = useSearchParams();
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const setCustomers = useAppStore((s) => s.setCustomers);
  const regions = useAppStore((s) => s.regions);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const updateCustomer = useAppStore((s) => s.updateCustomer);
  const deleteCustomer = useAppStore((s) => s.deleteCustomer);

  const customersQuery = useCustomersListQuery();

  useEffect(() => {
    if (!customersQuery.data) return;
    setCustomers(mapCustomersApiRowsToStore(customersQuery.data, { regions, users, me }));
  }, [customersQuery.data, regions, users, me.id, setCustomers]);

  const createCustomerMutation = useMutation({
    mutationFn: (customer: Customer) => persistCustomerCreate(customer, users),
    onSuccess: (row) => {
      patchCustomerRowInStore(row, { regions, users, me });
    },
    onSettled: () => customersQuery.refetch(),
  });

  const updateCustomerMutation = useMutation({
    mutationFn: (customer: Customer) => persistCustomerUpdate(customer, users),
    onSuccess: (row) => {
      patchCustomerRowInStore(row, { regions, users, me });
    },
    onSettled: () => customersQuery.refetch(),
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/customers/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete customer");
    },
    onSettled: () => customersQuery.refetch(),
  });

  const scope = getScope(me.role, "customers");
  const visible = visibleWithScope(scope, me, customers);

  const initialCustomerFilters = useMemo(
    () => loadInitialCustomerFilters(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore session once on mount
    [],
  );
  const [search, setSearch] = useState(() => initialCustomerFilters.search);
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">(
    () => initialCustomerFilters.statusFilter,
  );
  const [regionFilter, setRegionFilter] = useState<string>(() => initialCustomerFilters.regionFilter);
  const [assignedToFilter, setAssignedToFilter] = useState<string>(() => initialCustomerFilters.assignedToFilter);
  const [teamQueryFilter, setTeamQueryFilter] = useState<string>(() => initialCustomerFilters.teamQueryFilter);
  const [industryFilter, setIndustryFilter] = useState<string>(() => initialCustomerFilters.industryFilter);
  const [tagsFilter, setTagsFilter] = useState<string>(() => initialCustomerFilters.tagsFilter);
  const initialCustomerTimeRange = hydrateTimeRange({
    timeRangeFilter: initialCustomerFilters.timeRangeFilter,
    dateFrom: initialCustomerFilters.customFrom || initialCustomerFilters.dateFrom,
    dateTo: initialCustomerFilters.customTo || initialCustomerFilters.dateTo,
  });
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangePreset>(() => initialCustomerTimeRange.preset);
  const [customFrom, setCustomFrom] = useState(() => initialCustomerTimeRange.customFrom);
  const [customTo, setCustomTo] = useState(() => initialCustomerTimeRange.customTo);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [createSuccessOpen, setCreateSuccessOpen] = useState(false);
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [customerModuleTab, setCustomerModuleTab] = useState<"directory" | "renewals">(
    () => (searchParams.get("tab") === "renewals" ? "renewals" : "directory"),
  );
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY) as "table" | "card" | null;
    if (stored === "table" || stored === "card") setViewMode(stored);
  }, []);
  useEffect(() => {
    const q = searchParams.get("q");
    const status = searchParams.get("status");
    const owner = searchParams.get("owner");
    const team = searchParams.get("team");
    const region = searchParams.get("region");
    const tab = searchParams.get("tab");
    if (q != null) setSearch(q);
    if (status && STATUS_OPTIONS.some((s) => s.value === status)) setStatusFilter(status as CustomerStatus | "all");
    if (owner) setAssignedToFilter(owner);
    if (team) setTeamQueryFilter(team);
    if (region) setRegionFilter(region);
    const parsed = parseTimeRangeFromSearchParams(searchParams);
    if (parsed) {
      setTimeRangeFilter(parsed.preset);
      setCustomFrom(parsed.customFrom);
      setCustomTo(parsed.customTo);
    }
    if (tab === "renewals" || tab === "directory") setCustomerModuleTab(tab);
  }, [searchParams]);

  const { from: dateFrom, to: dateTo } = resolveTimeRangeYmd(timeRangeFilter, customFrom, customTo);

  useEffect(() => {
    saveSessionFilters(FILTER_SESSION_KEYS.customers, {
      search,
      statusFilter,
      regionFilter,
      assignedToFilter,
      teamQueryFilter,
      industryFilter,
      tagsFilter,
      dateFrom,
      dateTo,
      timeRangeFilter,
      customFrom,
      customTo,
    });
  }, [search, statusFilter, regionFilter, assignedToFilter, teamQueryFilter, industryFilter, tagsFilter, dateFrom, dateTo, timeRangeFilter, customFrom, customTo]);

  const hasActiveAppliedFilters =
    search !== "" ||
    statusFilter !== "all" ||
    regionFilter !== "all" ||
    assignedToFilter !== "all" ||
    teamQueryFilter !== "all" ||
    industryFilter !== "all" ||
    tagsFilter !== "" ||
    timeRangeFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRegionFilter("all");
    setAssignedToFilter("all");
    setTeamQueryFilter("all");
    setIndustryFilter("all");
    setTagsFilter("");
    setTimeRangeFilter("all");
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
    clearSessionFilters(FILTER_SESSION_KEYS.customers);
  };
  const persistView = (mode: "table" | "card") => {
    setViewMode(mode);
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  };

  const industries = useMemo(() => {
    const set = new Set(visible.map((c) => c.industry).filter(Boolean));
    return Array.from(set).sort();
  }, [visible]);

  const allTags = useMemo(() => {
    const set = new Set(visible.flatMap((c) => c.tags));
    return Array.from(set).sort();
  }, [visible]);

  const filtered = useMemo(() => {
    let list = visible;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.companyName || "").toLowerCase().includes(q) ||
          (c.customerName || "").toLowerCase().includes(q) ||
          c.customerNumber.toLowerCase().includes(q) ||
          (c.gstin?.toLowerCase().includes(q) ?? false) ||
          (c.address?.city?.toLowerCase().includes(q) ?? false)
      );
    }
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (regionFilter !== "all") list = list.filter((c) => c.regionId === regionFilter);
    if (assignedToFilter !== "all") list = list.filter((c) => c.assignedTo === assignedToFilter);
    if (teamQueryFilter !== "all") list = list.filter((c) => c.teamId === teamQueryFilter);
    if (dateFrom || dateTo) {
      list = list.filter((c) => ymdInInclusiveRange(isoToLocalYmd(c.createdAt), dateFrom, dateTo));
    }
    if (industryFilter !== "all") list = list.filter((c) => c.industry === industryFilter);
    if (tagsFilter) {
      const tag = tagsFilter.trim().toLowerCase();
      list = list.filter((c) => c.tags.some((t) => t.toLowerCase().includes(tag)));
    }
    return list;
  }, [visible, search, statusFilter, regionFilter, assignedToFilter, teamQueryFilter, dateFrom, dateTo, industryFilter, tagsFilter]);

  const listLayout: "stack" | "table" | "card" = smUp ? viewMode : "stack";
  const pageSize = listLayout === "card" ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalRevenue = useMemo(() => filtered.reduce((s, c) => s + c.totalRevenue, 0), [filtered]);
  const activeCount = useMemo(() => filtered.filter((c) => c.status === "active").length, [filtered]);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const newThisMonth = useMemo(
    () => filtered.filter((c) => c.createdAt >= startOfMonth).length,
    [filtered, startOfMonth]
  );

  const canCreate = can(me.role, "customers", "create");
  const canUpdate = can(me.role, "customers", "update");
  const canDelete = can(me.role, "customers", "delete");
  const canExport = can(me.role, "customers", "export");
  const canUpdateCustomer = (c: Customer) => {
    if (!canUpdate) return false;
    if (scope === "SELF" && c.assignedTo !== me.id) return false;
    return true;
  };
  const canDeleteCustomer = (c: Customer) => {
    if (!canDelete) return false;
    if (scope === "SELF" && c.assignedTo !== me.id) return false;
    return true;
  };

  const handleExportCsv = () => {
    const headers = [
      "Customer #",
      "Company Name",
      "Customer Name",
      "Primary Contact",
      "City",
      "Assigned To",
      "Status",
      "Total Revenue",
    ];
    const primaryContact = (c: Customer) =>
      c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
    const rows = filtered.map((c) => {
      const pc = primaryContact(c);
      return [
        c.customerNumber,
        c.companyName || c.customerName,
        c.customerName || "",
        pc ? `${pc.name} (${pc.email})` : "",
        c.address?.city ?? "",
        c.assignedToName,
        c.status,
        c.totalRevenue,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export done", description: `${filtered.length} customers exported.` });
  };

  const handleDelete = (c: Customer) => {
    deleteCustomer(c.id);
    deleteCustomerMutation.mutate(c.id, {
      onError: (e: Error) =>
        toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
    });
    toast({ title: "Customer deleted", description: `${c.companyName || c.customerName} has been removed.` });
    setDeleteTarget(null);
  };

  const primaryContact = (c: Customer) => c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];

  const dateChip = timeRangeChip(timeRangeFilter, dateFrom, dateTo);

  return (
    <>
      <Topbar
        title="Customers"
        subtitle={
          customerModuleTab === "renewals"
            ? smUp
              ? "Expiries, reminders, and renewals."
              : undefined
            : `${filtered.length} in scope`
        }
        actions={
          customerModuleTab === "directory" ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="hidden items-center rounded-md border border-border bg-muted/40 p-0.5 sm:flex">
                <button
                  type="button"
                  title="Table view"
                  onClick={() => persistView("table")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-[5px] transition-colors",
                    viewMode === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Card view"
                  onClick={() => persistView("card")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-[5px] transition-colors",
                    viewMode === "card" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
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
                      setEditingCustomer(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="space-y-2.5">
        <div className="inline-flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setCustomerModuleTab("directory")}
            className={cn(
              "h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors",
              customerModuleTab === "directory" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Directory
          </button>
          <button
            type="button"
            onClick={() => setCustomerModuleTab("renewals")}
            className={cn(
              "h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors",
              customerModuleTab === "renewals" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Renewals
          </button>
        </div>
        {customerModuleTab === "renewals" ? (
          <RenewalSubscriptionTracker />
        ) : (
          <div className="space-y-2.5">
            {customersQuery.isLoading && (
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Syncing customers
              </p>
            )}
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4"
            >
              <CustomerKpiCard
                label="Total"
                value={String(filtered.length)}
                sub="In current filters"
                icon={Users}
                iconColor="text-primary"
                iconBg="bg-primary/10"
                active={statusFilter === "all"}
                onClick={() => {
                  setStatusFilter("all");
                  setPage(1);
                }}
              />
              <CustomerKpiCard
                label="Active"
                value={String(activeCount)}
                sub="Paying accounts"
                icon={CheckCircle}
                iconColor="text-success"
                iconBg="bg-success/15"
                active={statusFilter === "active"}
                onClick={() => {
                  setStatusFilter("active");
                  setPage(1);
                }}
              />
              <CustomerKpiCard
                label="Revenue"
                value={formatINR(totalRevenue)}
                sub="Lifetime collected"
                icon={DollarSign}
                iconColor="text-success"
                iconBg="bg-success/15"
              />
              <CustomerKpiCard
                label="New this month"
                value={String(newThisMonth)}
                sub="Created in calendar month"
                icon={UserPlus}
                iconColor="text-info"
                iconBg="bg-info/15"
                active={timeRangeFilter === "this_month"}
                onClick={() => {
                  setTimeRangeFilter("this_month");
                  setCustomFrom("");
                  setCustomTo("");
                  setPage(1);
                }}
              />
            </motion.div>

            <FilterPanel
              title="Filters"
              storageKey="ui:customers:filtersOpen"
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
                        {statusFilter}
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
                    {regionFilter !== "all" ? (
                      <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {regions.find((r) => r.id === regionFilter)?.name ?? "Region"}
                      </span>
                    ) : null}
                    {industryFilter !== "all" ? (
                      <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {industryFilter}
                      </span>
                    ) : null}
                    {tagsFilter ? (
                      <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tagsFilter}
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
                      placeholder="Search company, GSTIN, city…"
                      className="h-9 pl-8 text-sm"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1 sm:max-w-[min(100%,28rem)] sm:flex-shrink-0">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(s.value);
                          setPage(1);
                        }}
                        className={cn(
                          "h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors",
                          statusFilter === s.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <TimeRangeFilter
                    preset={timeRangeFilter}
                    customFrom={customFrom}
                    customTo={customTo}
                    onPresetChange={(preset) => {
                      setTimeRangeFilter(preset);
                      setPage(1);
                    }}
                    onCustomChange={(from, to) => {
                      setCustomFrom(from);
                      setCustomTo(to);
                      setPage(1);
                    }}
                    customPlaceholder="Created date…"
                  />
                  <Select
                    value={assignedToFilter}
                    onValueChange={(v) => {
                      setAssignedToFilter(v);
                      setPage(1);
                    }}
                  >
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
                  <Select
                    value={teamQueryFilter}
                    onValueChange={(v) => {
                      setTeamQueryFilter(v);
                      setPage(1);
                    }}
                  >
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
                  <Select
                    value={regionFilter}
                    onValueChange={(v) => {
                      setRegionFilter(v);
                      setPage(1);
                    }}
                  >
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
                  <Select
                    value={industryFilter}
                    onValueChange={(v) => {
                      setIndustryFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="All industries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All industries</SelectItem>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind!}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <SearchableSelect
                    value={tagsFilter}
                    onValueChange={(v) => {
                      setTagsFilter(v === "__all__" ? "" : v);
                      setPage(1);
                    }}
                    options={[
                      { value: "__all__", label: "All tags" },
                      ...allTags.map((t) => ({ value: t, label: t })),
                    ]}
                    placeholder="All tags"
                    searchPlaceholder="Search tags…"
                    emptyText="No tags found."
                    triggerClassName="h-9 w-full text-sm"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {canExport && (
                    <Button variant="outline" size="sm" className="h-8 flex-1 px-2.5 text-xs sm:flex-none" onClick={handleExportCsv}>
                      <FileDown className="mr-1 h-3.5 w-3.5" /> Export
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                    disabled={!hasActiveAppliedFilters}
                    onClick={clearFilters}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </FilterPanel>

            {listLayout === "stack" && (
              <motion.div variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No customers found</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Adjust filters or add a customer.</p>
                    {canCreate && (
                      <Button size="sm" className="mt-3 h-8 px-2.5 text-xs" onClick={() => setFormOpen(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border">
                      {pageItems.map((c) => (
                        <div key={c.id} className="flex items-start gap-2 px-2.5 py-2.5">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => navigate(`/customers/${c.id}`)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{c.companyName || c.customerName}</p>
                                <p className="truncate font-mono text-[11px] text-primary">{c.customerNumber}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {c.address?.city ?? c.industry ?? "—"}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <CustomerStatusBadge status={c.status} />
                                <p className="mt-1 text-xs font-semibold tabular-nums">{formatINR(c.totalRevenue)}</p>
                              </div>
                            </div>
                          </button>
                          <div className="flex shrink-0 flex-col gap-0.5">
                            {canUpdateCustomer(c) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Edit"
                                onClick={() => {
                                  setEditingCustomer(c);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDeleteCustomer(c) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget(c)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {filtered.length > pageSize && (
                      <DataTablePagination
                        className="border-t border-border px-2.5 py-2"
                        page={currentPage}
                        totalPages={totalPages}
                        total={filtered.length}
                        perPage={pageSize}
                        onPageChange={setPage}
                      />
                    )}
                  </>
                )}
              </motion.div>
            )}

            {listLayout === "table" && (
              <motion.div variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No customers found</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Adjust filters or add a customer.</p>
                    {canCreate && (
                      <Button size="sm" className="mt-3 h-8 px-2.5 text-xs" onClick={() => setFormOpen(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="scrollbar-soft overflow-x-auto">
                    <Table responsiveShell={false}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer #</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead className="hidden md:table-cell">Contact</TableHead>
                          <TableHead className="hidden lg:table-cell">City</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageItems.map((c) => {
                          const pc = primaryContact(c);
                          return (
                            <TableRow
                              key={c.id}
                              role="button"
                              tabIndex={0}
                              className="cursor-pointer"
                              onClick={() => navigate(`/customers/${c.id}`)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  navigate(`/customers/${c.id}`);
                                }
                              }}
                            >
                              <TableCell>
                                <span className="font-mono text-xs font-medium text-primary">{c.customerNumber}</span>
                              </TableCell>
                              <TableCell className="max-w-[14rem]">
                                <p className="truncate font-medium leading-snug">{c.companyName || c.customerName}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {c.industry || c.customerName || c.assignedToName || "—"}
                                </p>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <p>{pc?.name ?? "—"}</p>
                                {pc?.email ? <p className="truncate text-[11px] text-muted-foreground">{pc.email}</p> : null}
                              </TableCell>
                              <TableCell className="hidden text-muted-foreground lg:table-cell">
                                {c.address?.city ?? "—"}
                              </TableCell>
                              <TableCell>
                                <CustomerStatusBadge status={c.status} />
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">
                                {formatINR(c.totalRevenue)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div
                                  className="flex items-center justify-end gap-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                  role="presentation"
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    title="View"
                                    onClick={() => navigate(`/customers/${c.id}`)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {canUpdateCustomer(c) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="Edit"
                                      onClick={() => {
                                        setEditingCustomer(c);
                                        setFormOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {canDeleteCustomer(c) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-destructive"
                                      title="Delete"
                                      onClick={() => setDeleteTarget(c)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                    {filtered.length > pageSize && (
                      <DataTablePagination
                        className="border-t border-border px-2.5 py-2"
                        page={currentPage}
                        totalPages={totalPages}
                        total={filtered.length}
                        perPage={pageSize}
                        onPageChange={setPage}
                      />
                    )}
                  </>
                )}
              </motion.div>
            )}

            {listLayout === "card" && (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3"
              >
                {filtered.length === 0 ? (
                  <div className="card-soft col-span-full flex flex-col items-center justify-center px-4 py-12 text-center">
                    <Building2 className="mb-3 h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-medium">No customers found</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Adjust filters or add a customer.</p>
                    {canCreate && (
                      <Button size="sm" className="mt-3 h-8 px-2.5 text-xs" onClick={() => setFormOpen(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                  </div>
                ) : (
                  pageItems.map((c) => {
                    const pc = primaryContact(c);
                    const assignedUser = users.find((u) => u.id === c.assignedTo);
                    return (
                      <motion.div
                        key={c.id}
                        variants={staggerItem}
                        whileHover={hoverLift}
                        className="card-soft flex flex-col p-2.5"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.companyName || c.customerName}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">{c.customerNumber}</p>
                          </div>
                          <CustomerStatusBadge status={c.status} />
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {pc ? `${pc.name}${pc.email ? ` · ${pc.email}` : ""}` : "No contact"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {c.address?.city ?? "—"}
                          {c.regionName ? ` · ${c.regionName}` : ""}
                        </p>
                        <p className="mt-1.5 text-sm font-semibold tabular-nums">{formatINR(c.totalRevenue)}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {c.activeProposalsCount} proposals
                          </Badge>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {c.activeDealsCount} deals
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-[9px]">
                              {assignedUser?.name
                                ?.split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2) ?? "—"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => navigate(`/customers/${c.id}`)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              View
                            </Button>
                            {canUpdateCustomer(c) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  setEditingCustomer(c);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}

            {listLayout === "card" && filtered.length > pageSize && (
              <DataTablePagination
                className="card-soft px-2.5 py-2"
                page={currentPage}
                totalPages={totalPages}
                total={filtered.length}
                perPage={pageSize}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingCustomer={editingCustomer}
        onPersist={async (customer, mode) => {
          if (mode === "create") {
            await createCustomerMutation.mutateAsync(customer);
            return;
          }
          await updateCustomerMutation.mutateAsync(customer);
        }}
        onSaved={(customer, mode) => {
          setFormOpen(false);
          setEditingCustomer(null);
          if (mode === "create") {
            setCreatedCustomerId(customer.id);
            setCreateSuccessOpen(true);
          }
        }}
      />

      <AlertDialog
        open={createSuccessOpen}
        onOpenChange={(open) => {
          setCreateSuccessOpen(open);
          if (!open) setCreatedCustomerId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Customer added successfully!</AlertDialogTitle>
            <AlertDialogDescription>
              You can go back to the customer list or create a proposal for this customer now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel
              className="w-full sm:w-auto"
              onClick={() => {
                setCreateSuccessOpen(false);
                setCreatedCustomerId(null);
              }}
            >
              Go to Customer List
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto"
              onClick={() => {
                const cid = createdCustomerId;
                setCreateSuccessOpen(false);
                setCreatedCustomerId(null);
                if (cid) navigate("/proposals", { state: { customerId: cid } });
              }}
            >
              + Create Proposal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkImportCustomersDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        regions={regions}
        onImported={() => void customersQuery.refetch()}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.companyName} and all related data. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
