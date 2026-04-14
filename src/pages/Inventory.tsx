import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { can, formatINR } from "@/lib/rbac";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { InventoryItemDialog } from "@/components/InventoryItemDialog";
import { DataTablePagination } from "@/components/DataTablePagination";
import type { InventoryItem, ItemType } from "@/types";
import { apiUrl } from "@/lib/api";
import {
  Package,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  FileDown,
  PackageOpen,
  LayoutGrid,
  List,
  Search,
  Eye,
} from "lucide-react";

const ITEM_TYPE_BADGE: Record<ItemType, string> = {
  product: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  service: "bg-green-500/15 text-green-700 dark:text-green-300",
  subscription: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  bundle: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
};

const PAGE_SIZE = 10;

export default function Inventory() {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.me);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const setInventoryItems = useAppStore((s) => s.setInventoryItems);
  const updateInventoryItem = useAppStore((s) => s.updateInventoryItem);
  const deleteInventoryItem = useAppStore((s) => s.deleteInventoryItem);

  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/inventory"));
      if (!res.ok) throw new Error("Failed to load inventory");
      return res.json() as Promise<InventoryItem[]>;
    },
  });

  // React Query v5 removed per-query callbacks (onSuccess). Keep Zustand store in sync.
  useEffect(() => {
    if (inventoryQuery.data) setInventoryItems(inventoryQuery.data);
  }, [inventoryQuery.data, setInventoryItems]);

  const createMutation = useMutation({
    mutationFn: async (item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">) => {
      const res = await fetch(apiUrl("/api/inventory"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create item");
      }
      return res.json() as Promise<InventoryItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<InventoryItem> }) => {
      const res = await fetch(apiUrl(`/api/inventory/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update item");
      }
      return res.json() as Promise<InventoryItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/inventory/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const [search, setSearch] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const canCreate = can(me.role, "inventory", "create");
  const canUpdate = can(me.role, "inventory", "update");
  const canDelete = can(me.role, "inventory", "delete");
  const canExport = can(me.role, "inventory", "export");

  const filtered = useMemo(() => {
    let list = inventoryItems;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q)
      );
    }
    if (itemTypeFilter !== "all") {
      list = list.filter((it) => it.itemType === itemTypeFilter);
    }
    if (activeFilter === "active") list = list.filter((it) => it.isActive);
    if (activeFilter === "inactive") list = list.filter((it) => !it.isActive);
    return list;
  }, [inventoryItems, search, itemTypeFilter, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setAddOpen(true);
  };

  const handleCloseDialog = (open: boolean) => {
    setAddOpen(open);
    if (!open) setEditingItem(null);
  };

  const handleToggleActive = (item: InventoryItem) => {
    const nextActive = !item.isActive;
    updateMutation.mutate(
      { id: item.id, updates: { isActive: nextActive } },
      {
        onSuccess: () => {
          updateInventoryItem(item.id, { isActive: nextActive });
          toast({
            title: item.isActive ? "Item deactivated" : "Item activated",
            description: `${item.name} is now ${item.isActive ? "inactive" : "active"}.`,
          });
        },
        onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = (item: InventoryItem) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(item.id, {
      onSuccess: () => {
        deleteInventoryItem(item.id);
        toast({ title: "Item deleted", description: `${item.name} has been removed.` });
        if (detailItem?.id === item.id) {
          setDetailItem(null);
          setSheetOpen(false);
        }
      },
      onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const openDetail = (item: InventoryItem) => {
    setDetailItem(item);
    setSheetOpen(true);
  };

  const exportCsv = () => {
    const headers = [
      "Name",
      "Item code",
      "Type",
      "Category",
      "Unit",
      "Cost",
      "Selling Price",
      "GST %",
      "Status",
    ];
    const rows = filtered.map((it) =>
      [
        it.name,
        it.sku,
        it.itemType,
        it.category,
        it.unitOfMeasure,
        it.costPrice,
        it.sellingPrice,
        it.taxRate,
        it.isActive ? "Active" : "Inactive",
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export done", description: `${filtered.length} rows exported as CSV.` });
  };

  return (
    <>
      <Topbar
        title="Inventory"
        subtitle="Manage products, services & pricing"
      />
      <div className="space-y-4">
        <div className="mb-4 space-y-3 sm:mb-5 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
          <div className="relative w-full sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-full pl-9 text-sm"
              placeholder="Search name, item code, category..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
            <Select
              value={itemTypeFilter}
              onValueChange={(v) => {
                setItemTypeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full min-w-0 text-xs sm:w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="bundle">Bundle</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={activeFilter}
              onValueChange={(v) => {
                setActiveFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full min-w-0 text-xs sm:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <div className="flex gap-0.5 rounded-md border border-border p-0.5">
              <Button
                type="button"
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1 px-2"
                onClick={() => setViewMode("table")}
                title="Table view"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1 px-2"
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </div>
            {canExport && (
              <Button variant="outline" size="sm" className="h-9 flex-1 text-xs sm:flex-none" onClick={exportCsv}>
                <FileDown className="mr-1.5 h-4 w-4" />
                Export
              </Button>
            )}
            {canCreate && (
              <Button size="sm" className="h-9 flex-1 text-xs sm:flex-none" onClick={() => { setEditingItem(null); setAddOpen(true); }}>
                + Add Item
              </Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden border border-border bg-card">
          <CardContent className="p-0">
            {inventoryQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                Loading inventory...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <PackageOpen className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No inventory items yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add your first product or service to get started.
                </p>
                {canCreate && (
                  <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
                    + Add Item
                  </Button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((item) => (
                    <InventoryItemCard
                      key={item.id}
                      item={item}
                      onOpen={() => openDetail(item)}
                      onEdit={() => handleEdit(item)}
                      onToggleActive={() => handleToggleActive(item)}
                      onDelete={() => handleDelete(item)}
                      canUpdate={canUpdate}
                      canDelete={canDelete}
                    />
                  ))}
                </div>
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
            ) : (
              <>
                <Table responsiveShell={false} className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">Item code</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">Type</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">GST %</TableHead>
                      <TableHead className="text-right text-xs">Price</TableHead>
                      <TableHead className="hidden text-xs lg:table-cell">Category</TableHead>
                      <TableHead className="hidden text-right text-xs lg:table-cell">Cost Price</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">Status</TableHead>
                      <TableHead className="w-[100px] text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(item)}
                      >
                        <TableCell
                          className="font-medium text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="text-left text-primary hover:underline"
                            onClick={() => openDetail(item)}
                          >
                            {item.name}
                          </button>
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {item.sku}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="secondary"
                            className={ITEM_TYPE_BADGE[item.itemType]}
                          >
                            {item.itemType}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">{item.taxRate}%</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatINR(item.sellingPrice)}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                          {item.category}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-sm lg:table-cell">
                          {formatINR(item.costPrice)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="secondary"
                            className={item.isActive ? "bg-green-500/15 text-green-700" : "bg-muted text-muted-foreground"}
                          >
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {canUpdate && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEdit(item)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleToggleActive(item)}
                                >
                                  {item.isActive ? (
                                    <PowerOff className="w-4 h-4" />
                                  ) : (
                                    <Power className="w-4 h-4" />
                                  )}
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(item)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
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

      <InventoryItemDialog
        open={addOpen}
        onOpenChange={handleCloseDialog}
        existingItems={inventoryItems}
        editingItem={editingItem}
        onSubmit={(item) => {
          return createMutation.mutateAsync(item);
        }}
        onUpdate={(id, updates) => {
          return updateMutation.mutateAsync({ id, updates });
        }}
        createdBy={me.id}
        toast={toast}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className={cn(sheetContentDetail)}>
          <SheetHeader>
            <SheetTitle>Inventory item</SheetTitle>
          </SheetHeader>
          {detailItem && (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label="Name" value={detailItem.name} />
              <DetailRow label="Item code" value={detailItem.sku} mono />
              <DetailRow label="Type" value={detailItem.itemType} />
              <DetailRow label="Category" value={detailItem.category} />
              <DetailRow label="Unit of measure" value={detailItem.unitOfMeasure} />
              <DetailRow label="HSN/SAC code" value={detailItem.hsnSacCode ?? "—"} mono />
              <DetailRow label="Cost price" value={formatINR(detailItem.costPrice)} />
              <DetailRow label="Selling price" value={formatINR(detailItem.sellingPrice)} />
              <DetailRow label="GST rate" value={`${detailItem.taxRate}%`} />
              <DetailRow label="Status" value={detailItem.isActive ? "Active" : "Inactive"} />
              {detailItem.description && (
                <DetailRow label="Description" value={detailItem.description} />
              )}
              {detailItem.notes && (
                <DetailRow label="Notes" value={detailItem.notes} />
              )}
              <DetailRow label="Created" value={new Date(detailItem.createdAt).toLocaleString()} />
              <DetailRow label="Updated" value={new Date(detailItem.updatedAt).toLocaleString()} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function InventoryItemCard({
  item,
  onOpen,
  onEdit,
  onToggleActive,
  onDelete,
  canUpdate,
  canDelete,
}: {
  item: InventoryItem;
  onOpen: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      className="cursor-pointer border border-gray-200 shadow-none transition-shadow hover:bg-muted/30 hover:shadow-sm dark:border-gray-800"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</h3>
            <p className="mt-0.5 font-mono text-xs text-gray-400">{item.sku}</p>
          </div>
          <Badge variant="secondary" className={cn("flex-shrink-0", ITEM_TYPE_BADGE[item.itemType])}>
            {item.itemType}
          </Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Selling price</span>
            <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatINR(item.sellingPrice)}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {item.category} · GST {item.taxRate}%
          </p>
        </div>
        <div
          className="mt-4 flex gap-2 border-t border-gray-100 pt-3 dark:border-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          {canUpdate && (
            <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onOpen} title="View">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {canUpdate && (
            <Button variant="outline" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onToggleActive} title="Toggle active">
              {item.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" size="sm" className="h-8 w-8 shrink-0 p-0 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-border/50">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
