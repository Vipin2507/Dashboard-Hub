import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit inventory item" : "Add inventory item"}</DialogTitle>
        </DialogHeader>
        <TooltipProvider>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ITEM_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PRODUCT_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                        <Input type="number" min={0} step={0.01} placeholder="0" {...field} />
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
                        <Input type="number" min={0} step={0.01} placeholder="0" {...field} />
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
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select GST %" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GST_RATES.map((r) => (
                            <SelectItem key={r} value={String(r)}>
                              {r}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="md:col-span-2 flex items-center gap-2">
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
              </div>
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingItem ? "Update" : "Add item"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
