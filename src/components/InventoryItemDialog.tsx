import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { dialogSmMax2xl } from "@/lib/dialogLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { InventoryItem, ItemType } from "@/types";
import { PRODUCT_CATEGORIES } from "@/lib/masterData";

const UNIT_OPTIONS = [
  "per unit",
  "per month",
  "per year",
  "per hour",
  "per license",
  "per user",
  "per GB",
] as const;

const GST_RATES = [0, 5, 12, 18, 28] as const;
const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "subscription", label: "Subscription" },
  { value: "bundle", label: "Bundle" },
];

function buildSchema(existingSkus: string[], editingId: string | null) {
  return z
    .object({
      name: z.string().min(1, "Name is required"),
      itemType: z.enum(["product", "service", "subscription", "bundle"]),
      sku: z.string().min(1, "SKU is required"),
      hsnSacCode: z.string().optional(),
      category: z.string().min(1, "Category is required"),
      unitOfMeasure: z.string().min(1, "Unit of measure is required"),
      costPrice: z.coerce.number().min(0, "Must be ≥ 0"),
      sellingPrice: z.coerce.number().min(0, "Must be ≥ 0"),
      taxRate: z.coerce.number(),
      description: z.string().optional(),
      notes: z.string().optional(),
      isActive: z.boolean(),
    })
    .refine(
      (data) => {
        const sku = data.sku.trim().toUpperCase();
        const isDuplicate = existingSkus.some((s) => s.toUpperCase() === sku);
        return !isDuplicate;
      },
      { message: "SKU already exists", path: ["sku"] }
    );
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

interface InventoryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingItems: InventoryItem[];
  editingItem: InventoryItem | null;
  onSubmit: (item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">) => void;
  onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
  createdBy: string;
  toast: (opts: { title: string; description?: string }) => void;
}

export function InventoryItemDialog({
  open,
  onOpenChange,
  existingItems,
  editingItem,
  onSubmit,
  onUpdate,
  createdBy,
  toast,
}: InventoryItemDialogProps) {
  const existingSkus = existingItems
    .filter((it) => !editingItem || it.id !== editingItem.id)
    .map((it) => it.sku);
  const schema = buildSchema(existingSkus, editingItem?.id ?? null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      itemType: "product",
      sku: "",
      hsnSacCode: "",
      category: PRODUCT_CATEGORIES[0] ?? "",
      unitOfMeasure: "per unit",
      costPrice: 0,
      sellingPrice: 0,
      taxRate: 18,
      description: "",
      notes: "",
      isActive: true,
    },
  });

  const costPrice = form.watch("costPrice");
  const sellingPrice = form.watch("sellingPrice");
  const marginPct =
    typeof sellingPrice === "number" &&
    sellingPrice > 0 &&
    typeof costPrice === "number"
      ? ((sellingPrice - costPrice) / sellingPrice) * 100
      : 0;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(
        editingItem
          ? {
              name: editingItem.name,
              itemType: editingItem.itemType,
              sku: editingItem.sku,
              hsnSacCode: editingItem.hsnSacCode ?? "",
              category: editingItem.category,
              unitOfMeasure: editingItem.unitOfMeasure,
              costPrice: editingItem.costPrice,
              sellingPrice: editingItem.sellingPrice,
              taxRate: editingItem.taxRate,
              description: editingItem.description ?? "",
              notes: editingItem.notes ?? "",
              isActive: editingItem.isActive,
            }
          : {
              name: "",
              itemType: "product",
              sku: "",
              hsnSacCode: "",
              category: PRODUCT_CATEGORIES[0] ?? "",
              unitOfMeasure: "per unit",
              costPrice: 0,
              sellingPrice: 0,
              taxRate: 18,
              description: "",
              notes: "",
              isActive: true,
            }
      );
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (open && editingItem) {
      form.reset({
        name: editingItem.name,
        itemType: editingItem.itemType,
        sku: editingItem.sku,
        hsnSacCode: editingItem.hsnSacCode ?? "",
        category: editingItem.category,
        unitOfMeasure: editingItem.unitOfMeasure,
        costPrice: editingItem.costPrice,
        sellingPrice: editingItem.sellingPrice,
        taxRate: editingItem.taxRate,
        description: editingItem.description ?? "",
        notes: editingItem.notes ?? "",
        isActive: editingItem.isActive,
      });
    } else if (open && !editingItem) {
      form.reset({
        name: "",
        itemType: "product",
        sku: "",
        hsnSacCode: "",
        category: PRODUCT_CATEGORIES[0] ?? "",
        unitOfMeasure: "per unit",
        costPrice: 0,
        sellingPrice: 0,
        taxRate: 18,
        description: "",
        notes: "",
        isActive: true,
      });
    }
  }, [open, editingItem?.id]);

  const onFormSubmit = async (values: FormValues) => {
    const now = new Date().toISOString();
    const updates = {
      name: values.name,
      description: values.description || undefined,
      itemType: values.itemType as ItemType,
      sku: values.sku.trim(),
      hsnSacCode: values.hsnSacCode?.trim() || undefined,
      category: values.category,
      unitOfMeasure: values.unitOfMeasure,
      costPrice: Number(values.costPrice),
      sellingPrice: Number(values.sellingPrice),
      taxRate: Number(values.taxRate),
      isActive: values.isActive,
      notes: values.notes || undefined,
      updatedAt: now,
    };
    try {
      if (editingItem) {
        const result = onUpdate(editingItem.id, updates);
        if (result && typeof (result as Promise<unknown>).then === "function") await (result as Promise<unknown>);
      } else {
        const { updatedAt: _u, ...rest } = updates;
        const payload = { ...rest, createdBy };
        const result = onSubmit(payload);
        if (result && typeof (result as Promise<unknown>).then === "function") await (result as Promise<unknown>);
      }
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Something went wrong", variant: "destructive" });
      return;
    }
    toast({ title: editingItem ? "Item updated" : "Item added", description: `${values.name} has been ${editingItem ? "updated" : "added to inventory"}.` });
    handleOpenChange(false);
  };

  const suggestSku = () => {
    const name = form.getValues("name");
    if (!name || form.getValues("sku")) return;
    const base = name
      .replace(/[^a-zA-Z0-9]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s.slice(0, 3).toUpperCase())
      .join("-");
    if (base) form.setValue("sku", base);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={dialogSmMax2xl}>
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit inventory item" : "Add inventory item"}</DialogTitle>
        </DialogHeader>
        <TooltipProvider>
          <Form {...form}>
            <form id="inventory-item-form" onSubmit={form.handleSubmit(onFormSubmit)} className="contents">
        <DialogBody className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Buildesk CRM Pro" {...field} onBlur={() => suggestSku()} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="itemType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item type *</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                          placeholder="Select type"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CRM-PRO-001" {...field} />
                      </FormControl>
                      <FormDescription>Unique item code (auto-suggested from name when empty)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hsnSacCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        HSN / SAC code
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">HSN for goods, SAC for services under GST</p>
                          </TooltipContent>
                        </Tooltip>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 998314" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category *</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
                          placeholder="Select category"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unitOfMeasure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of measure *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. per unit, per month, per year, per license"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost price (₹) *</FormLabel>
                      <FormControl>
                        <NumericInput
                          placeholder="0"
                          min={0}
                          emptyOnBlur={0}
                          value={typeof field.value === "number" ? field.value : 0}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sellingPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selling price (₹) *</FormLabel>
                      <FormControl>
                        <NumericInput
                          placeholder="0"
                          min={0}
                          emptyOnBlur={0}
                          value={typeof field.value === "number" ? field.value : 0}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      {typeof costPrice === "number" &&
                        typeof sellingPrice === "number" &&
                        sellingPrice > 0 &&
                        sellingPrice < costPrice && (
                          <p className="text-xs text-amber-600">Selling price is lower than cost price.</p>
                        )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST rate % *</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={String(field.value)}
                          onValueChange={(v) => field.onChange(Number(v))}
                          options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))}
                          placeholder="Select GST %"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Margin %</span>
                  <span className="text-sm font-medium">
                    {Number.isFinite(marginPct) ? `${marginPct.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <FormLabel>Active</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Optional product/service description" {...field} rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (internal only)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Internal notes" {...field} rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
        </DialogBody>
            </form>
          </Form>
        </TooltipProvider>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="inventory-item-form">
            {editingItem ? "Update" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
