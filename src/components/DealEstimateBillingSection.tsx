import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumericInput } from "@/components/ui/numeric-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR } from "@/lib/rbac";
import type { InventoryItem } from "@/types";
import type { DealEstimateBillingState, DealEstimateLineItem } from "@/lib/dealEstimateBilling";
import { billingSubTotal } from "@/lib/dealEstimateBilling";
import { cn } from "@/lib/utils";

type Props = {
  billing: DealEstimateBillingState;
  onChange: (next: DealEstimateBillingState) => void;
  inventoryItems: InventoryItem[];
  gstTypeLabel: string;
  className?: string;
};

export function DealEstimateBillingSection({
  billing,
  onChange,
  inventoryItems,
  gstTypeLabel,
  className,
}: Props) {
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");

  const subTotal = useMemo(() => billingSubTotal(billing.items), [billing.items]);

  const patchBilling = (patch: Partial<DealEstimateBillingState>) => {
    onChange({ ...billing, ...patch });
  };

  const updateItem = (id: string, patch: Partial<DealEstimateLineItem>) => {
    onChange({
      ...billing,
      items: billing.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  };

  const addItem = () => {
    const id = "estli-" + Math.random().toString(36).slice(2, 10);
    patchBilling({
      items: [
        ...billing.items,
        {
          id,
          name: "",
          description: "",
          subDescription: "",
          hsnSac: "998313",
          qty: 1,
          unit: "Licence",
          rate: 0,
          taxRate: 18,
        },
      ],
    });
  };

  const removeItem = (id: string) => {
    patchBilling({ items: billing.items.filter((x) => x.id !== id) });
  };

  const activeInventory = useMemo(
    () => inventoryItems.filter((it) => it.isActive),
    [inventoryItems],
  );
  const inventoryFiltered = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return activeInventory;
    return activeInventory.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q),
    );
  }, [activeInventory, inventorySearch]);

  const addFromInventory = (it: InventoryItem) => {
    const id = "estli-" + Math.random().toString(36).slice(2, 10);
    patchBilling({
      items: [
        ...billing.items,
        {
          id,
          name: it.name,
          description: it.description ?? "",
          subDescription: it.sku ? `SKU: ${it.sku}` : "",
          hsnSac: it.hsnSacCode ?? "998313",
          qty: 1,
          unit: it.unitOfMeasure || "Licence",
          rate: it.sellingPrice ?? 0,
          taxRate: 18,
        },
      ],
    });
    setInventoryPickerOpen(false);
    setInventorySearch("");
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Estimate — Bill To
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Company name</Label>
            <Input
              value={billing.companyName}
              onChange={(e) => patchBilling({ companyName: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Contact name</Label>
            <Input
              value={billing.customerFullName}
              onChange={(e) => patchBilling({ customerFullName: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Email</Label>
            <Input
              value={billing.email}
              onChange={(e) => patchBilling({ email: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Phone</Label>
            <Input
              value={billing.phone}
              onChange={(e) => patchBilling({ phone: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Billing address</Label>
            <Textarea
              value={billing.billingAddress}
              onChange={(e) => patchBilling({ billingAddress: e.target.value })}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">City</Label>
            <Input
              value={billing.city}
              onChange={(e) => patchBilling({ city: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">State</Label>
            <Input
              value={billing.state}
              onChange={(e) => patchBilling({ state: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Pincode</Label>
            <Input
              value={billing.pincode}
              onChange={(e) => patchBilling({ pincode: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Country</Label>
            <Input
              value={billing.country}
              onChange={(e) => patchBilling({ country: e.target.value })}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">GSTIN</Label>
            <Input
              value={billing.gstin}
              onChange={(e) => patchBilling({ gstin: e.target.value })}
              className="h-9 rounded-lg font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Place of supply</Label>
            <Input
              value={billing.placeOfSupply}
              onChange={(e) => patchBilling({ placeOfSupply: e.target.value })}
              placeholder="e.g. Maharashtra (27)"
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm text-muted-foreground">GST on PDF</Label>
            <p className="text-sm font-medium">{gstTypeLabel}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Line items
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setInventoryPickerOpen(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Inventory
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addItem}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Custom
            </Button>
          </div>
        </div>

        {billing.items.length === 0 && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            No line items. Add from inventory or enter custom rows — used on each installment estimate.
          </p>
        )}

        {billing.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs w-24">HSN</TableHead>
                  <TableHead className="text-xs w-28">Qty</TableHead>
                  <TableHead className="text-xs w-24 text-right">Rate</TableHead>
                  <TableHead className="text-xs w-16 text-right">Tax%</TableHead>
                  <TableHead className="text-xs w-24 text-right">Amount</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {billing.items.map((it) => {
                  const amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="align-top py-2">
                        <Input
                          value={it.name}
                          onChange={(e) => updateItem(it.id, { name: e.target.value })}
                          placeholder="Name"
                          className="mb-1 h-8 text-xs"
                        />
                        <Textarea
                          value={it.description}
                          onChange={(e) => updateItem(it.id, { description: e.target.value })}
                          rows={2}
                          placeholder="Description"
                          className="min-h-[48px] text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <Input
                          value={it.hsnSac}
                          onChange={(e) => updateItem(it.id, { hsnSac: e.target.value })}
                          className="h-8 font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <NumericInput
                          value={it.qty}
                          onValueChange={(v) => updateItem(it.id, { qty: Number(v) || 0 })}
                          min={0}
                          emptyOnBlur={1}
                          className="mb-1 h-8 text-right text-xs"
                        />
                        <Input
                          value={it.unit}
                          onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top py-2 text-right">
                        <NumericInput
                          value={it.rate}
                          onValueChange={(v) => updateItem(it.id, { rate: Number(v) || 0 })}
                          min={0}
                          emptyOnBlur={0}
                          className="h-8 text-right text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top py-2 text-right">
                        <NumericInput
                          value={it.taxRate}
                          onValueChange={(v) => updateItem(it.id, { taxRate: Number(v) || 0 })}
                          min={0}
                          max={28}
                          emptyOnBlur={18}
                          className="h-8 text-right text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top py-2 text-right text-xs tabular-nums">
                        {formatINR(amount)}
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeItem(it.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t bg-muted/30 px-3 py-2 text-right text-sm font-medium">
              Subtotal (excl. tax): {formatINR(subTotal)}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Estimate notes</Label>
        <Textarea
          value={billing.estimateNotes}
          onChange={(e) => patchBilling({ estimateNotes: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>

      <Dialog open={inventoryPickerOpen} onOpenChange={setInventoryPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add from inventory</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Input
              placeholder="Search name, SKU…"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
            />
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {inventoryFiltered.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 border-b p-2 last:border-0 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.sku} · {formatINR(it.sellingPrice)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addFromInventory(it)}>
                    Add
                  </Button>
                </div>
              ))}
              {inventoryFiltered.length === 0 && (
                <p className="p-3 text-center text-sm text-muted-foreground">No items found</p>
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
