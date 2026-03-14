import { useMemo, useState } from "react";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { InventoryItemDialog } from "@/components/InventoryItemDialog";
import type { InventoryItem, ItemType } from "@/types";
import {
  Package,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  FileDown,
  PackageOpen,
} from "lucide-react";

const ITEM_TYPE_BADGE: Record<ItemType, string> = {
  product: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  service: "bg-green-500/15 text-green-700 dark:text-green-300",
  subscription: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  bundle: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
};

const PAGE_SIZE = 10;

const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? "";

export default function Inventory() {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.me);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const setInventoryItems = useAppStore((s) => s.setInventoryItems);
  const addInventoryItem = useAppStore((s) => s.addInventoryItem);
  const updateInventoryItem = useAppStore((s) => s.updateInventoryItem);
  const deleteInventoryItem = useAppStore((s) => s.deleteInventoryItem);

  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/inventory`);
      if (!res.ok) throw new Error("Failed to load inventory");
      return res.json() as Promise<InventoryItem[]>;
    },
    enabled: !!apiBase,
    onSuccess: (data) => {
      setInventoryItems(data);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">) => {
      const res = await fetch(`${apiBase}/api/inventory`, {
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
      const res = await fetch(`${apiBase}/api/inventory/${id}`, {
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
      const res = await fetch(`${apiBase}/api/inventory/${id}`, { method: "DELETE" });
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
    if (apiBase) {
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
    } else {
      updateInventoryItem(item.id, { isActive: nextActive });
      toast({
        title: item.isActive ? "Item deactivated" : "Item activated",
        description: `${item.name} is now ${item.isActive ? "inactive" : "active"}.`,
      });
    }
  };

  const handleDelete = (item: InventoryItem) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    if (apiBase) {
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
    } else {
      deleteInventoryItem(item.id);
      toast({ title: "Item deleted", description: `${item.name} has been removed.` });
      if (detailItem?.id === item.id) {
        setDetailItem(null);
        setSheetOpen(false);
      }
    }
  };

  const openDetail = (item: InventoryItem) => {
    setDetailItem(item);
    setSheetOpen(true);
  };

  const exportCsv = () => {
    const headers = [
      "Name",
      "SKU",
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
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-9 w-48 text-sm"
              placeholder="Search name, SKU, category..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <Select
              value={itemTypeFilter}
              onValueChange={(v) => {
                setItemTypeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[140px] text-xs">
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
              <SelectTrigger className="h-9 w-[120px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={exportCsv}>
                <FileDown className="w-4 h-4 mr-1.5" />
                Export
              </Button>
            )}
            {canCreate && (
              <Button size="sm" className="h-9 text-xs" onClick={() => { setEditingItem(null); setAddOpen(true); }}>
                + Add Item
              </Button>
            )}
          </div>
        </div>

        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            {apiBase && inventoryQuery.isLoading ? (
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
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Selling Price</TableHead>
                      <TableHead className="text-xs">GST %</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-[100px]">Actions</TableHead>
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
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={ITEM_TYPE_BADGE[item.itemType]}
                          >
                            {item.itemType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.category}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatINR(item.sellingPrice)}
                        </TableCell>
                        <TableCell className="text-xs">{item.taxRate}%</TableCell>
                        <TableCell>
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
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs">
                    <span className="text-muted-foreground">
                      Page {currentPage} of {totalPages} ({filtered.length} items)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={currentPage === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
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
      </div>

      <InventoryItemDialog
        open={addOpen}
        onOpenChange={handleCloseDialog}
        existingItems={inventoryItems}
        editingItem={editingItem}
        onSubmit={(item) => {
          if (apiBase) return createMutation.mutateAsync(item);
          addInventoryItem(item);
        }}
        onUpdate={(id, updates) => {
          if (apiBase) return updateMutation.mutateAsync({ id, updates });
          updateInventoryItem(id, updates);
        }}
        createdBy={me.id}
        toast={toast}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Inventory item</SheetTitle>
          </SheetHeader>
          {detailItem && (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label="Name" value={detailItem.name} />
              <DetailRow label="SKU" value={detailItem.sku} mono />
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
