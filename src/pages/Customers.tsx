import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer, CustomerStatus } from "@/types";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
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
    <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {label}
          </p>
          <div className="text-gray-400 dark:text-gray-500">{icon}</div>
        </div>
        <p className={cn("text-2xl font-bold mt-3 leading-none tracking-tight", valueColor)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const regions = useAppStore((s) => s.regions);
  const users = useAppStore((s) => s.users);
  const updateCustomer = useAppStore((s) => s.updateCustomer);
  const deleteCustomer = useAppStore((s) => s.deleteCustomer);

  const scope = getScope(me.role, "customers");
  const visible = visibleWithScope(scope, me, customers);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [tagsFilter, setTagsFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY) as "table" | "card" | null;
    if (stored === "table" || stored === "card") setViewMode(stored);
  }, []);
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
    if (industryFilter !== "all") list = list.filter((c) => c.industry === industryFilter);
    if (tagsFilter) {
      const tag = tagsFilter.trim().toLowerCase();
      list = list.filter((c) => c.tags.some((t) => t.toLowerCase().includes(tag)));
    }
    return list;
  }, [visible, search, statusFilter, regionFilter, assignedToFilter, industryFilter, tagsFilter]);

  const totalPages =
    viewMode === "table"
      ? Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE))
      : Math.max(1, Math.ceil(filtered.length / CARD_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems =
    viewMode === "table"
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
    toast({ title: "Customer deleted", description: `${c.companyName} has been removed.` });
    setDeleteTarget(null);
  };

  const primaryContact = (c: Customer) => c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];

  return (
    <>
      <Topbar title="Customers" subtitle={`${visible.length} customers`} />
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Zone 1: Page title row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Customers</h1>
            <p className="text-sm text-gray-500 mt-0.5">{filtered.length} customers</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0 rounded-md", viewMode === "table" && "bg-white dark:bg-gray-800 shadow-sm")}
                onClick={() => persistView("table")}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0 rounded-md", viewMode === "card" && "bg-white dark:bg-gray-800 shadow-sm")}
                onClick={() => persistView("card")}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            {canCreate && (
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4"
                onClick={() => {
                  setEditingCustomer(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Customer
              </Button>
            )}
          </div>
        </div>

        {/* Zone 2: Search + filters in ONE row */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search company, customer #, GSTIN..."
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {["All", "Active", "Inactive", "Lead", "Churned", "Blacklisted"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter((s === "All" ? "all" : s.toLowerCase()) as CustomerStatus | "all");
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  statusFilter === (s === "All" ? "all" : s.toLowerCase())
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Select
              value={regionFilter}
              onValueChange={(v) => {
                setRegionFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-sm w-[130px]">
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
              <SelectTrigger className="h-9 text-sm w-[140px]">
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
              <Button variant="outline" size="sm" className="h-9" onClick={handleExportCsv}>
                <FileDown className="w-4 h-4 mr-1.5" /> Export
              </Button>
            )}
          </div>
        </div>

        {/* KPI Stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
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
        {viewMode === "table" && (
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border">
                          <TableHead className="text-xs font-medium h-10 px-4">Customer #</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4">Company</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4">Primary Contact</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4">City</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4">Assigned To</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4">Status</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4 text-right">Total Revenue</TableHead>
                          <TableHead className="text-xs font-medium h-10 px-4 w-[140px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageItems.map((c) => {
                          const pc = primaryContact(c);
                          return (
                            <TableRow key={c.id} className="hover:bg-muted/50 border-b border-border">
                              <TableCell className="px-4 py-3">
                                <button
                                  type="button"
                                  className="text-left font-mono text-primary hover:underline text-sm"
                                  onClick={() => navigate(`/customers/${c.id}`)}
                                >
                                  {c.customerNumber}
                                </button>
                              </TableCell>
                              <TableCell className="px-4 py-3 text-sm font-medium">
                                {c.companyName}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                {pc ? `${pc.name}${pc.email ? ` · ${pc.email}` : ""}` : "—"}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-xs">{c.address?.city ?? "—"}</TableCell>
                              <TableCell className="px-4 py-3">
                                <div>
                                  <span className="text-sm text-gray-800 dark:text-gray-200">
                                    {c.assignedToName.replace(/\s*\(.*?\)\s*/g, "").trim()}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                                    STATUS_PILL[c.status] ?? STATUS_PILL.inactive
                                  )}
                                >
                                  {c.status}
                                </span>
                              </TableCell>
                              <TableCell className="px-4 py-3 text-right font-mono text-sm">
                                {formatINR(c.totalRevenue)}
                              </TableCell>
                              <TableCell className="px-4 py-3">
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
                  </div>
                  {filtered.length > TABLE_PAGE_SIZE && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border text-sm">
                      <span className="text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={currentPage === 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={currentPage === totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card View */}
        {viewMode === "card" && (
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
                  <Card key={c.id} className="bg-card border border-border flex flex-col overflow-hidden">
                    <CardContent className="p-5 flex flex-col flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{c.companyName}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {c.customerNumber}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                            STATUS_PILL[c.status] ?? STATUS_PILL.inactive
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                      {pc && (
                        <p className="text-xs text-muted-foreground">
                          {pc.name}
                          {pc.email ? ` · ${pc.email}` : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {c.address?.city ?? "—"} · {c.regionName}
                      </p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatINR(c.totalRevenue)}
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          Proposals: {c.activeProposalsCount}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Deals: {c.activeDealsCount}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between pt-3 mt-auto border-t border-border">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px]">
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
                            className="h-8 text-xs"
                            onClick={() => navigate(`/customers/${c.id}`)}
                          >
                            View
                          </Button>
                          {canUpdateCustomer(c) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                setEditingCustomer(c);
                                setFormOpen(true);
                              }}
                            >
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

        {viewMode === "card" && filtered.length > CARD_PAGE_SIZE && (
          <div className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingCustomer={editingCustomer}
        onSaved={() => {
          setFormOpen(false);
          setEditingCustomer(null);
        }}
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
