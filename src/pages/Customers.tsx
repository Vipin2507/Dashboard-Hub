import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { apiUrl } from "@/lib/api";
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
  Building2,
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
  FileDown,
  LayoutGrid,
  List,
  Users,
  UserCheck,
  IndianRupee,
  CalendarPlus,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSmUp } from "@/hooks/useSmUp";
import type { Customer, CustomerStatus } from "@/types";
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

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  inactive: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  lead: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  churned: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  blacklisted: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}

function StatCard({ label, value, icon, valueColor = "text-gray-900 dark:text-gray-100" }: StatCardProps) {
  return (
    <Card className="border border-gray-200 shadow-none dark:border-gray-800">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <div className="shrink-0 text-gray-400 dark:text-gray-500">{icon}</div>
        </div>
        <p className={cn("mt-3 truncate text-xl font-bold leading-none tracking-tight sm:text-2xl", valueColor)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
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
  const updateCustomer = useAppStore((s) => s.updateCustomer);
  const deleteCustomer = useAppStore((s) => s.deleteCustomer);

  type ApiCustomer = {
    id: string;
    leadId?: string;
    name: string;
    state?: string | null;
    gstin?: string | null;
    regionId: string;
    city?: string | null;
    email?: string | null;
    primaryPhone?: string | null;
    status?: string | null;
    createdAt?: string;
    salesExecutive?: string | null;
    accountManager?: string | null;
    deliveryExecutive?: string | null;
  };

  const toUiCustomer = (row: ApiCustomer): Customer => {
    const regionName = regions.find((r) => r.id === row.regionId)?.name ?? "Unknown";
    const assignedUser =
      users.find((u) => u.name === row.salesExecutive) ??
      users.find((u) => u.regionId === row.regionId && u.role === "sales_rep") ??
      users[0];
    const nowIso = row.createdAt ?? new Date().toISOString();
    return {
      id: row.id,
      customerNumber: row.leadId ?? `CUST-${row.id.slice(-4).toUpperCase()}`,
      companyName: row.name,
      status: (row.status as CustomerStatus) ?? "active",
      gstin: row.gstin ?? undefined,
      pan: undefined,
      industry: undefined,
      website: undefined,
      address: {
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        country: "India",
      },
      contacts: [
        {
          id: `ct-${row.id}`,
          name: row.name,
          email: row.email ?? undefined,
          phone: row.primaryPhone ?? undefined,
          isPrimary: true,
        },
      ],
      regionId: row.regionId,
      regionName,
      teamId: assignedUser?.teamId ?? users[0]?.teamId ?? "t1",
      assignedTo: assignedUser?.id ?? users[0]?.id ?? me.id,
      assignedToName: assignedUser?.name ?? row.salesExecutive ?? "Unassigned",
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
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: me.id,
    };
  };

  const toApiPayload = (customer: Customer) => {
    const primary = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
    return {
      id: customer.id,
      leadId: customer.customerNumber,
      name: customer.companyName,
      state: customer.address?.state ?? null,
      gstin: customer.gstin ?? null,
      regionId: customer.regionId,
      city: customer.address?.city ?? null,
      email: primary?.email ?? null,
      primaryPhone: primary?.phone ?? null,
      status: customer.status,
      salesExecutive: users.find((u) => u.id === customer.assignedTo)?.name ?? customer.assignedToName ?? null,
      accountManager: null,
      deliveryExecutive: null,
    };
  };

  const customersQuery = useQuery({
    queryKey: ["customers-old-ui-sync"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/customers"));
      if (!res.ok) throw new Error("Failed to load customers");
      return (await res.json()) as ApiCustomer[];
    },
  });

  useEffect(() => {
    if (!customersQuery.data) return;
    setCustomers(customersQuery.data.map(toUiCustomer));
  }, [customersQuery.data, regions, users]);

  const createCustomerMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      const res = await fetch(apiUrl("/api/customers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiPayload(customer)),
      });
      if (!res.ok) throw new Error("Failed to create customer");
    },
    onSettled: () => customersQuery.refetch(),
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      const res = await fetch(apiUrl(`/api/customers/${customer.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiPayload(customer)),
      });
      if (!res.ok) throw new Error("Failed to update customer");
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

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [teamQueryFilter, setTeamQueryFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [tagsFilter, setTagsFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [customerModuleTab, setCustomerModuleTab] = useState<"directory" | "renewals">("directory");
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
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (q) setSearch(q);
    if (status && STATUS_OPTIONS.some((s) => s.value === status)) setStatusFilter(status as CustomerStatus | "all");
    if (owner) setAssignedToFilter(owner);
    if (team) setTeamQueryFilter(team);
    if (region) setRegionFilter(region);
    if (from) setDateFrom(from);
    if (to) setDateTo(to);
  }, [searchParams]);
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
          c.companyName.toLowerCase().includes(q) ||
          c.customerNumber.toLowerCase().includes(q) ||
          (c.gstin?.toLowerCase().includes(q) ?? false) ||
          (c.address?.city?.toLowerCase().includes(q) ?? false)
      );
    }
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (regionFilter !== "all") list = list.filter((c) => c.regionId === regionFilter);
    if (assignedToFilter !== "all") list = list.filter((c) => c.assignedTo === assignedToFilter);
    if (teamQueryFilter !== "all") list = list.filter((c) => c.teamId === teamQueryFilter);
    if (dateFrom) list = list.filter((c) => c.createdAt.slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter((c) => c.createdAt.slice(0, 10) <= dateTo);
    if (industryFilter !== "all") list = list.filter((c) => c.industry === industryFilter);
    if (tagsFilter) {
      const tag = tagsFilter.trim().toLowerCase();
      list = list.filter((c) => c.tags.some((t) => t.toLowerCase().includes(tag)));
    }
    return list;
  }, [visible, search, statusFilter, regionFilter, assignedToFilter, teamQueryFilter, dateFrom, dateTo, industryFilter, tagsFilter]);

  const effectiveViewMode = smUp ? viewMode : "table";
  const totalPages =
    effectiveViewMode === "table"
      ? Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE))
      : Math.max(1, Math.ceil(filtered.length / CARD_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems =
    effectiveViewMode === "table"
      ? filtered.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE)
      : filtered.slice((currentPage - 1) * CARD_PAGE_SIZE, currentPage * CARD_PAGE_SIZE);

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
      "Company",
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
        c.companyName,
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
    toast({ title: "Customer deleted", description: `${c.companyName} has been removed.` });
    setDeleteTarget(null);
  };

  const primaryContact = (c: Customer) => c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];

  return (
    <>
      <Topbar
        title="Customers"
        subtitle={
          customerModuleTab === "renewals"
            ? "Renewal & subscription tracker"
            : `${visible.length} customers`
        }
      />
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        {customersQuery.isLoading && (
          <div className="mb-4 text-sm text-muted-foreground">Loading customers...</div>
        )}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            type="button"
            variant={customerModuleTab === "directory" ? "default" : "outline"}
            size="sm"
            onClick={() => setCustomerModuleTab("directory")}
          >
            Customer directory
          </Button>
          <Button
            type="button"
            variant={customerModuleTab === "renewals" ? "default" : "outline"}
            size="sm"
            onClick={() => setCustomerModuleTab("renewals")}
          >
            Renewal &amp; subscription tracker
          </Button>
        </div>
        {customerModuleTab === "renewals" ? (
          <RenewalSubscriptionTracker />
        ) : (
          <>
        {/* Zone 1: Page title row */}
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">Customers</h1>
            <p className="mt-0.5 text-sm text-gray-500">{filtered.length} customers</p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:justify-end sm:gap-2">
            <div className="hidden items-center justify-end rounded-lg border border-gray-200 p-0.5 sm:flex dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 rounded-md p-0", viewMode === "table" && "bg-white shadow-sm dark:bg-gray-800")}
                onClick={() => persistView("table")}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 rounded-md p-0", viewMode === "card" && "bg-white shadow-sm dark:bg-gray-800")}
                onClick={() => persistView("card")}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            {canCreate && (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full min-w-0 sm:w-auto sm:min-w-[9.5rem]"
                  onClick={() => setBulkImportOpen(true)}
                >
                  <Upload className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="truncate">Bulk import</span>
                </Button>
                <Button
                  className="h-9 w-full min-w-0 bg-blue-600 px-4 text-white hover:bg-blue-700 sm:w-auto sm:min-w-[9.5rem]"
                  onClick={() => {
                    setEditingCustomer(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="truncate">Add Customer</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Zone 2: Search + filters */}
        <div className="mb-4 space-y-3 sm:mb-5 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
          <div className="relative w-full sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search company, customer #, GSTIN..."
              className="h-9 w-full pl-9 text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:pb-0">
            {["All", "Active", "Inactive", "Lead", "Churned", "Blacklisted"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter((s === "All" ? "all" : s.toLowerCase()) as CustomerStatus | "all");
                  setPage(1);
                }}
                className={cn(
                  "flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === (s === "All" ? "all" : s.toLowerCase())
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-1 sm:flex-wrap sm:items-center sm:gap-2">
            <Select
              value={regionFilter}
              onValueChange={(v) => {
                setRegionFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 min-w-0 w-full text-sm sm:w-36">
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
              <SelectTrigger className="h-9 min-w-0 w-full text-sm sm:w-40">
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
            {canExport && (
              <div className="col-span-2 flex sm:col-span-1 sm:ml-auto">
                <Button variant="outline" size="sm" className="h-9 w-full sm:w-auto" onClick={handleExportCsv}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Export
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* KPI Stat cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Total Customers" value={String(filtered.length)} icon={<Users className="h-4 w-4" />} />
          <StatCard
            label="Active"
            value={String(activeCount)}
            icon={<UserCheck className="h-4 w-4" />}
            valueColor="text-emerald-600"
          />
          <StatCard
            label="Total Revenue"
            value={formatINR(totalRevenue)}
            icon={<IndianRupee className="h-4 w-4" />}
          />
          <StatCard
            label="New This Month"
            value={String(newThisMonth)}
            icon={<CalendarPlus className="h-4 w-4" />}
            valueColor="text-blue-600"
          />
        </div>

        {/* Table View */}
        {effectiveViewMode === "table" && (
          <Card className="border border-gray-200 dark:border-gray-800 shadow-none overflow-hidden">
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Building2 className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No customers found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add your first customer to get started.
                  </p>
                  {canCreate && (
                    <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>
                      + Add Customer
                    </Button>
                  )}
                </div>
              ) : (
                <>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                          <TableHead className="h-10 whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                            Customer #
                          </TableHead>
                          <TableHead className="h-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                            Company
                          </TableHead>
                          <TableHead className="hidden h-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell md:px-4 md:py-3">
                            Primary Contact
                          </TableHead>
                          <TableHead className="hidden h-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell md:px-4 md:py-3">
                            City
                          </TableHead>
                          <TableHead className="h-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                            Status
                          </TableHead>
                          <TableHead className="hidden h-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell md:px-4 md:py-3">
                            Assigned To
                          </TableHead>
                          <TableHead className="hidden h-10 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell md:px-4 md:py-3">
                            Total Revenue
                          </TableHead>
                          <TableHead className="h-10 w-[140px] px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border">
                        {pageItems.map((c) => {
                          const pc = primaryContact(c);
                          return (
                            <TableRow key={c.id} className="border-b border-border transition-colors hover:bg-muted/50">
                              <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                                <button
                                  type="button"
                                  className="text-left font-mono text-sm text-primary hover:underline"
                                  onClick={() => navigate(`/customers/${c.id}`)}
                                >
                                  {c.customerNumber}
                                </button>
                              </TableCell>
                              <TableCell className="px-3 py-3 text-sm font-medium md:px-4 md:py-3.5">
                                {c.companyName}
                              </TableCell>
                              <TableCell className="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell md:px-4 md:py-3.5">
                                {pc ? `${pc.name}${pc.email ? ` · ${pc.email}` : ""}` : "—"}
                              </TableCell>
                              <TableCell className="hidden px-3 py-3 text-xs md:table-cell md:px-4 md:py-3.5">
                                {c.address?.city ?? "—"}
                              </TableCell>
                              <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                                    STATUS_PILL[c.status] ?? STATUS_PILL.inactive
                                  )}
                                >
                                  {c.status}
                                </span>
                              </TableCell>
                              <TableCell className="hidden px-3 py-3 lg:table-cell md:px-4 md:py-3.5">
                                <div>
                                  <span className="text-sm text-gray-800 dark:text-gray-200">
                                    {c.assignedToName.replace(/\s*\(.*?\)\s*/g, "").trim()}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden px-3 py-3 text-right font-mono text-sm lg:table-cell md:px-4 md:py-3.5">
                                {formatINR(c.totalRevenue)}
                              </TableCell>
                              <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="View"
                                    onClick={() => navigate(`/customers/${c.id}`)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {canUpdateCustomer(c) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Edit"
                                      onClick={() => {
                                        setEditingCustomer(c);
                                        setFormOpen(true);
                                      }}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canDeleteCustomer(c) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      title="Delete"
                                      onClick={() => setDeleteTarget(c)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  {filtered.length > TABLE_PAGE_SIZE && (
                    <DataTablePagination
                      page={currentPage}
                      totalPages={totalPages}
                      total={filtered.length}
                      perPage={TABLE_PAGE_SIZE}
                      onPageChange={setPage}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card View */}
        {effectiveViewMode === "card" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <Card className="col-span-full border border-border">
                <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                  <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium text-foreground">No customers found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add your first customer to get started.
                  </p>
                  {canCreate && (
                    <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>
                      + Add Customer
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              pageItems.map((c) => {
                const pc = primaryContact(c);
                const assignedUser = users.find((u) => u.id === c.assignedTo);
                return (
                  <Card
                    key={c.id}
                    className="flex flex-col overflow-hidden border border-gray-200 bg-card shadow-none transition-shadow hover:shadow-sm dark:border-gray-800"
                  >
                    <CardContent className="flex flex-1 flex-col p-4 sm:p-5">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {c.companyName}
                          </h3>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">{c.customerNumber}</p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                            STATUS_PILL[c.status] ?? STATUS_PILL.inactive
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {pc && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {pc.name}
                            {pc.email ? ` · ${pc.email}` : ""}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {c.address?.city ?? "—"} · {c.regionName}
                        </p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {formatINR(c.totalRevenue)}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            Proposals: {c.activeProposalsCount}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Deals: {c.activeDealsCount}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px]">
                            {assignedUser?.name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2) ?? "—"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-1 justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 flex-1 text-xs sm:flex-none"
                            onClick={() => navigate(`/customers/${c.id}`)}
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            View
                          </Button>
                          {canUpdateCustomer(c) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 flex-1 text-xs sm:flex-none"
                              onClick={() => {
                                setEditingCustomer(c);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {effectiveViewMode === "card" && filtered.length > CARD_PAGE_SIZE && (
          <DataTablePagination
            page={currentPage}
            totalPages={totalPages}
            total={filtered.length}
            perPage={CARD_PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
          </>
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
        onSaved={() => {
          setFormOpen(false);
          setEditingCustomer(null);
        }}
      />

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
