import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useCustomersListQuery } from "@/hooks/useCustomersListQuery";
import { mapApiCustomerRowToCustomer } from "@/lib/customerApiToUi";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { apiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
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
  Upload,
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

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        STATUS_PILL[status] ?? STATUS_PILL.inactive,
      )}
    >
      {status}
    </span>
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

  const toApiPayload = (customer: Customer) => {
    const primary = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
    const displayName = (customer.companyName || customer.customerName || customer.customerNumber).trim();
    return {
      id: customer.id,
      leadId: customer.customerNumber,
      name: displayName,
      customerName: customer.customerName,
      companyName: customer.companyName || null,
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
      tags: customer.tags ?? [],
    };
  };

  const customersQuery = useCustomersListQuery();

  useEffect(() => {
    if (!customersQuery.data) return;
    setCustomers(customersQuery.data.map((row) => mapApiCustomerRowToCustomer(row, { regions, users, me })));
  }, [customersQuery.data, regions, users, me.id, setCustomers]);

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
  const [createSuccessOpen, setCreateSuccessOpen] = useState(false);
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null);
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

  return (
    <>
      <Topbar
        title="Customers"
        subtitle={
          customerModuleTab === "renewals"
            ? "Renewal & subscription tracker"
            : `${filtered.length} customers across all regions`
        }
        actions={
          customerModuleTab === "directory" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  title="Table view"
                  onClick={() => persistView("table")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    viewMode === "table"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Card view"
                  onClick={() => persistView("card")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    viewMode === "card"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
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
                    className="h-9 shrink-0 px-4 text-sm font-medium"
                    onClick={() => {
                      setEditingCustomer(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Customer
                  </Button>
                </>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="w-full space-y-5">
        {customersQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading customers...</div>
        )}
        <div className="flex flex-wrap gap-2">
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
          <div className="w-full space-y-5">
              {/* STAT CARDS */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {(
                  [
                    {
                      label: "Total",
                      value: String(filtered.length),
                      color: "text-gray-900 dark:text-gray-100",
                    },
                    { label: "Active", value: String(activeCount), color: "text-emerald-600" },
                    {
                      label: "Revenue",
                      value: formatINR(totalRevenue),
                      color: "text-blue-600 dark:text-blue-400",
                    },
                    {
                      label: "New This Month",
                      value: String(newThisMonth),
                      color: "text-purple-600 dark:text-purple-400",
                    },
                  ] as const
                ).map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </p>
                    <p className={cn("text-2xl font-bold tracking-tight", color)}>{value}</p>
                  </div>
                ))}
              </div>

              {/* FILTERS */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 max-w-sm flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search company, GSTIN..."
                      className="h-9 pl-9 text-sm"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="scrollbar-none flex flex-shrink-0 items-center gap-1.5 overflow-x-auto">
                    {["All", "Active", "Inactive", "Lead", "Churned", "Blacklisted"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setStatusFilter((s === "All" ? "all" : s.toLowerCase()) as CustomerStatus | "all");
                          setPage(1);
                        }}
                        className={cn(
                          "h-8 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors duration-150",
                          statusFilter === (s === "All" ? "all" : s.toLowerCase())
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex flex-shrink-0 flex-wrap items-center gap-2">
                    <Select
                      value={regionFilter}
                      onValueChange={(v) => {
                        setRegionFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="h-9 w-full text-sm sm:w-36">
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
                      <SelectTrigger className="h-9 w-full text-sm sm:w-40">
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
                      triggerClassName="h-9 text-sm w-full sm:w-40"
                    />
                    {canExport && (
                      <Button variant="outline" size="sm" className="h-9" onClick={handleExportCsv}>
                        <FileDown className="mr-1.5 h-4 w-4" /> Export
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* TABLE */}
              {effectiveViewMode === "table" && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Building2 className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No customers found</p>
                      <p className="mt-1 text-xs text-muted-foreground">Add your first customer to get started.</p>
                      {canCreate && (
                        <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>
                          + Add Customer
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900">
                              {["Customer #", "Company", "Contact", "City", "Status", "Revenue", "Actions"].map(
                                (h) => (
                                  <th
                                    key={h}
                                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 first:pl-5 last:pr-5 whitespace-nowrap dark:text-gray-400"
                                  >
                                    {h}
                                  </th>
                                ),
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {pageItems.map((c) => {
                              const pc = primaryContact(c);
                              return (
                                <tr
                                  key={c.id}
                                  role="button"
                                  tabIndex={0}
                                  className="cursor-pointer border-b border-gray-100 transition-colors duration-100 hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-gray-800/50"
                                  onClick={() => navigate(`/customers/${c.id}`)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      navigate(`/customers/${c.id}`);
                                    }
                                  }}
                                >
                                  <td className="px-4 py-3.5 first:pl-5">
                                    <span className="font-mono text-sm font-medium text-blue-600 hover:text-blue-700">
                                      {c.customerNumber}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <div>
                                      <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                                        {c.companyName || c.customerName}
                                      </p>
                                      <p className="mt-0.5 text-xs text-gray-400">
                                        {c.customerName || c.companyName}
                                      </p>
                                      {c.industry && <p className="mt-0.5 text-xs text-gray-400">{c.industry}</p>}
                                    </div>
                                  </td>
                                  <td className="hidden px-4 py-3.5 md:table-cell">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">{pc?.name ?? "—"}</p>
                                    {pc?.email && (
                                      <p className="mt-0.5 text-xs text-gray-400">{pc.email}</p>
                                    )}
                                  </td>
                                  <td className="hidden px-4 py-3.5 lg:table-cell">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {c.address?.city ?? "—"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <CustomerStatusBadge status={c.status} />
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                      ₹{c.totalRevenue.toLocaleString("en-IN")}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 last:pr-5">
                                    <div
                                      className="flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                      role="presentation"
                                    >
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 rounded-md p-0"
                                        title="View"
                                        onClick={() => navigate(`/customers/${c.id}`)}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      {canUpdateCustomer(c) && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 rounded-md p-0"
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
                                          className="h-7 w-7 rounded-md p-0 text-destructive"
                                          title="Delete"
                                          onClick={() => setDeleteTarget(c)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {filtered.length > TABLE_PAGE_SIZE && (
                        <DataTablePagination
                          className="border-t border-gray-100 px-5 py-3 dark:border-gray-800"
                          page={currentPage}
                          totalPages={totalPages}
                          total={filtered.length}
                          perPage={TABLE_PAGE_SIZE}
                          onPageChange={setPage}
                        />
                      )}
                    </>
                  )}
                </div>
              )}

              {/* CARD GRID */}
              {effectiveViewMode === "card" && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
                            {c.companyName || c.customerName}
                          </h3>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                            {c.customerName || c.companyName}
                          </p>
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
                  className="rounded-xl border border-gray-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900"
                  page={currentPage}
                  totalPages={totalPages}
                  total={filtered.length}
                  perPage={CARD_PAGE_SIZE}
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
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
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
