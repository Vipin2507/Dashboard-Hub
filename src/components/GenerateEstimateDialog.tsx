import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2, Download, Loader2 } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Customer } from "@/types";
import type { EstimateData } from "@/types/estimate";
import { calculateEstimateTotals } from "@/lib/estimateCalculator";
import { determineGSTType, ESTIMATE_DEFAULTS, getStateCodeFromGSTIN } from "@/lib/estimateConfig";
import { generateEstimatePdfFromData } from "@/lib/generateEstimatePdf";
import { toast } from "sonner";

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  hsnSac: z.string().min(1, "Required"),
  qty: z.coerce.number().min(0.01),
  unit: z.string().min(1),
  rate: z.coerce.number().min(0),
  taxRate: z.coerce.number(),
});

const estimateSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1),
  notes: z.string().optional(),
  terms: z.string().optional(),
});

type EstimateFormData = z.infer<typeof estimateSchema>;

const UNIT_OPTIONS = ["Licence", "Credit", "Nos", "Hours", "Month", "Year", "Unit"] as const;
const TAX_RATE_OPTIONS = [0, 5, 12, 18, 28] as const;

export function GenerateEstimateDialog({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
}) {
  const [generating, setGenerating] = useState(false);
  const [estimateNumber, setEstimateNumber] = useState("");
  const [estimateNumberLoading, setEstimateNumberLoading] = useState(false);

  const customerStateCode = useMemo(() => getStateCodeFromGSTIN(customer.gstin ?? ""), [customer.gstin]);
  const gstType = useMemo(() => determineGSTType(customerStateCode), [customerStateCode]);

  useEffect(() => {
    if (!open) return;
    setEstimateNumberLoading(true);
    setEstimateNumber("");
    api
      .get<{ estimateNumber: string }>("/estimates/next-number")
      .then((d) => setEstimateNumber(d.estimateNumber))
      .catch(() => setEstimateNumber(""))
      .finally(() => setEstimateNumberLoading(false));
  }, [open]);

  const { register, control, handleSubmit, watch, reset, setValue } = useForm<EstimateFormData>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      lineItems: [
        {
          description: "Buildesk Sales Management Application (CRM )",
          hsnSac: "998313",
          qty: 1,
          unit: "Licence",
          rate: 0,
          taxRate: 18,
        },
      ],
      notes: ESTIMATE_DEFAULTS.notes,
      terms: ESTIMATE_DEFAULTS.terms,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      lineItems: [
        {
          description: "Buildesk Sales Management Application (CRM )",
          hsnSac: "998313",
          qty: 1,
          unit: "Licence",
          rate: 0,
          taxRate: 18,
        },
      ],
      notes: ESTIMATE_DEFAULTS.notes,
      terms: ESTIMATE_DEFAULTS.terms,
    });
  }, [open, reset]);

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedItems = watch("lineItems");

  const computedItems = useMemo(() => {
    return (watchedItems ?? []).map((item, idx) => ({
      id: String(fields[idx]?.id ?? `li-${idx}`),
      description: item?.description ?? "",
      hsnSac: item?.hsnSac ?? "",
      qty: Number(item?.qty ?? 0),
      unit: item?.unit ?? "",
      rate: Number(item?.rate ?? 0),
      amount: (Number(item?.qty ?? 0) || 0) * (Number(item?.rate ?? 0) || 0),
      taxRate: Number(item?.taxRate ?? 0),
    }));
  }, [watchedItems, fields]);

  const totals = useMemo(() => calculateEstimateTotals(computedItems as any, gstType), [computedItems, gstType]);

  const onSubmit = async (data: EstimateFormData) => {
    setGenerating(true);
    try {
      if (!estimateNumber.trim()) {
        toast.error("Estimate number not available. Please start/restart the server and reopen this dialog.");
        return;
      }

      const estimateData: EstimateData = {
        estimateNumber,
        estimateDate: new Date().toISOString(),
        customerName: customer.companyName,
        customerAddress: [customer.address?.line1, customer.address?.line2].filter(Boolean).join(", "),
        customerCity: customer.address?.city ?? "",
        customerState: customer.address?.state ?? "",
        customerPincode: customer.address?.pincode ?? "",
        customerCountry: customer.address?.country ?? "India",
        customerGstin: customer.gstin,
        customerStateCode: customerStateCode || "",
        gstType,
        lineItems: data.lineItems.map((item, idx) => ({
          id: String(fields[idx]?.id ?? `li-${idx}`),
          description: item.description,
          hsnSac: item.hsnSac,
          qty: Number(item.qty),
          unit: item.unit,
          rate: Number(item.rate),
          amount: Number(item.qty) * Number(item.rate),
          taxRate: Number(item.taxRate),
        })),
        notes: data.notes,
        termsAndConditions: data.terms,
      };

      await generateEstimatePdfFromData(estimateData);

      await api.post("/estimates", {
        estimateNumber,
        customerId: customer.id,
        grandTotal: totals.grandTotal,
        estimateJson: JSON.stringify(estimateData),
      });

      toast.success(`Estimate generated: ${estimateNumber}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full max-w-none h-[100dvh] sm:h-auto sm:max-h-[95vh] sm:max-w-5xl sm:rounded-xl flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b flex-shrink-0">
          <DialogTitle className="text-base font-semibold">Generate Estimate</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {estimateNumberLoading ? "Generating…" : estimateNumber || "—"} · {customer.companyName} ·{" "}
            <span className={gstType === "intra" ? "text-blue-600" : "text-purple-600"}>
              {gstType === "intra" ? "CGST + SGST (Intra-state)" : "IGST (Inter-state)"}
            </span>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <DialogBody className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div className="rounded-lg p-4 border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bill To (from profile)</p>
              <p className="text-sm font-semibold">{customer.companyName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {[customer.address?.line1, customer.address?.city, customer.address?.state, customer.address?.pincode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {customer.gstin && <p className="text-xs text-muted-foreground font-mono mt-0.5">GSTIN: {customer.gstin}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Line Items</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs rounded-lg"
                  onClick={() =>
                    append({
                      description: "",
                      hsnSac: "998313",
                      qty: 1,
                      unit: "Licence",
                      rate: 0,
                      taxRate: 18,
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="border rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Description *</label>
                      <Textarea
                        {...register(`lineItems.${index}.description` as const)}
                        rows={2}
                        className="text-sm resize-none rounded-lg"
                        placeholder="Item description…"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">HSN/SAC *</label>
                        <Input
                          {...register(`lineItems.${index}.hsnSac` as const)}
                          className="h-8 text-sm rounded-lg font-mono"
                          placeholder="998313"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Qty *</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          {...register(`lineItems.${index}.qty` as const)}
                          className="h-8 text-sm rounded-lg text-right"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
                        <Select
                          value={watchedItems?.[index]?.unit ?? "Licence"}
                          onValueChange={(v) => setValue(`lineItems.${index}.unit`, v, { shouldDirty: true, shouldTouch: true })}
                        >
                          <SelectTrigger className="h-8 text-sm rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input {...register(`lineItems.${index}.unit` as const)} className="hidden" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Rate (₹) *</label>
                        <Input
                          type="number"
                          min="0"
                          {...register(`lineItems.${index}.rate` as const)}
                          className="h-8 text-sm rounded-lg text-right"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">GST %</label>
                        <Select
                          value={String(watchedItems?.[index]?.taxRate ?? 18)}
                          onValueChange={(v) =>
                            setValue(`lineItems.${index}.taxRate`, Number(v), { shouldDirty: true, shouldTouch: true })
                          }
                        >
                          <SelectTrigger className="h-8 text-sm rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_RATE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={String(r)}>
                                {r}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input {...register(`lineItems.${index}.taxRate` as const)} className="hidden" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Amount: ₹
                        {(
                          (Number(watchedItems?.[index]?.qty ?? 0) || 0) * (Number(watchedItems?.[index]?.rate ?? 0) || 0)
                        ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg p-4 border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Total Preview</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="font-medium">₹{totals.subTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                {totals.taxBreakdown.map((row) => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium">₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-base">₹{totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Notes</label>
              <Textarea {...register("notes")} rows={2} className="text-sm resize-none rounded-lg" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Terms & Conditions</label>
              <Textarea {...register("terms")} rows={4} className="text-sm font-mono resize-none rounded-lg" />
            </div>
          </DialogBody>

          <DialogFooter className="flex justify-end gap-3 px-5 py-4 border-t flex-shrink-0 bg-background">
            <Button type="button" variant="outline" className="h-9 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={generating} className="h-9 px-5">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate & Download
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

