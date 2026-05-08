import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  calculateInstallments,
  type PlanSlug,
  type DistributionMode,
  type InstallmentPreview,
} from "@/lib/paymentPlanCalculator";
import { generateEstimatePdfFromData } from "@/lib/generateEstimatePdf";
import { determineGSTType, ESTIMATE_DEFAULTS, getStateCodeFromGSTIN } from "@/lib/estimateConfig";
import { calculateEstimateTotals } from "@/lib/estimateCalculator";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { INVALIDATE, QK } from "@/lib/queryKeys";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import type { Customer, Deal, Proposal, ProposalLineItem } from "@/types";
import type { EstimateData } from "@/types/estimate";

const schema = z.object({
  title: z.string().min(1, "Required"),
  customerId: z.string().min(1, "Customer is required"),
  regionId: z.string().min(1, "Region is required"),
  teamId: z.string().min(1, "Team is required"),
  ownerUserId: z.string().min(1, "Deal owner is required"),
  dealValue: z.number().min(1, "Must be greater than 0"),
  expectedCloseDate: z.string().min(1, "Required"),
  notes: z.string().optional(),
  enablePaymentPlan: z.boolean(),
  planSlug: z.enum(["annual", "half_yearly", "quarterly", "monthly", "custom"]),
  startDate: z.string().min(1, "Required"),
  distributionMode: z.enum(["even", "advance_then_equal", "custom_percent"]),
  advancePercent: z.number().min(0).max(100),
  customInstallments: z.number().min(2).max(24),
  intervalMonths: z.number().min(1).max(12),
  customPercentages: z.array(z.number()).optional(),
});

type FormData = z.infer<typeof schema>;

const PLAN_OPTIONS: {
  slug: PlanSlug;
  label: string;
  count: number;
  intervalMonths: number;
}[] = [
  { slug: "annual", label: "Annual (1 payment)", count: 1, intervalMonths: 12 },
  { slug: "half_yearly", label: "Half-Yearly (2 payments)", count: 2, intervalMonths: 6 },
  { slug: "quarterly", label: "Quarterly (4 payments)", count: 4, intervalMonths: 3 },
  { slug: "monthly", label: "Monthly (12 payments)", count: 12, intervalMonths: 1 },
  { slug: "custom", label: "Custom", count: 0, intervalMonths: 0 },
];

const DISTRIBUTION_OPTIONS = [
  {
    value: "even" as const,
    label: "Equal Split",
    description: "All installments are the same amount",
  },
  {
    value: "advance_then_equal" as const,
    label: "Advance + Equal",
    description: "First payment is an advance, rest are equal",
  },
  {
    value: "custom_percent" as const,
    label: "Custom %",
    description: "You define the % for each installment",
  },
];

function allocateAmountAcrossProposalLines(
  installmentAmount: number,
  lines: ProposalLineItem[],
): number[] {
  if (!lines.length) return [];
  const weights = lines.map((li) => Math.max(0, Number(li.lineTotal) || 0));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const n = lines.length;
    const base = Math.floor((installmentAmount / n) * 100) / 100;
    const remainder = Math.round((installmentAmount - base * n) * 100) / 100;
    return lines.map((_, i) => (i === n - 1 ? base + remainder : base));
  }
  let allocated = 0;
  return weights.map((w, i) => {
    const isLast = i === weights.length - 1;
    if (isLast) {
      return Math.round((installmentAmount - allocated) * 100) / 100;
    }
    const amt = Math.round(((installmentAmount * w) / sumW) * 100) / 100;
    allocated += amt;
    return amt;
  });
}

function resolveDealAssignmentFromForm(
  form: Pick<FormData, "customerId" | "regionId" | "teamId" | "ownerUserId">,
  proposal: Proposal,
  customer: Customer | undefined,
  me: { id: string; teamId: string; regionId: string },
) {
  const customerId = String(form.customerId || proposal.customerId || "").trim();
  const regionId = String(
    form.regionId || proposal.regionId || customer?.regionId || me.regionId || "",
  ).trim();
  const teamId = String(form.teamId || proposal.teamId || customer?.teamId || me.teamId || "").trim();
  const assignedTo = String(form.ownerUserId || proposal.assignedTo || me.id || "").trim();
  return { customerId, regionId, teamId, assignedTo };
}

function customerBillToName(customer: {
  companyName: string;
  customerName?: string;
}): string {
  return customer.companyName?.trim() || customer.customerName?.trim() || "Customer";
}

type WithPaymentPlanResponse = {
  deal: Deal;
  plan: unknown;
  installments: { id: string }[];
};

export function ConvertToDealDialog({
  open,
  proposal,
  onClose,
  onSuccess,
}: {
  open: boolean;
  proposal: Proposal | null;
  onClose: () => void;
  onSuccess?: (deal: Deal) => void;
}) {
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const regions = useAppStore((s) => s.regions);
  const teams = useAppStore((s) => s.teams);
  const users = useAppStore((s) => s.users);
  const qc = useQueryClient();

  const [step, setStep] = useState<"form" | "preview">("form");
  const [preview, setPreview] = useState<InstallmentPreview[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(-1);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      customerId: "",
      regionId: "",
      teamId: "",
      ownerUserId: "",
      dealValue: 0,
      expectedCloseDate: "",
      notes: "",
      enablePaymentPlan: true,
      planSlug: "quarterly",
      startDate: new Date().toISOString().split("T")[0],
      distributionMode: "even",
      advancePercent: 30,
      customInstallments: 4,
      intervalMonths: 3,
      customPercentages: [25, 25, 25, 25],
    },
  });

  useEffect(() => {
    if (!open || !proposal) return;
    setStep("form");
    setPreview([]);
    const value = proposal.finalQuoteValue ?? proposal.grandTotal ?? 0;
    const cust = customers.find((c) => c.id === proposal.customerId);
    reset({
      title: proposal.title ?? "",
      customerId: proposal.customerId ?? "",
      regionId: proposal.regionId || cust?.regionId || me.regionId || "",
      teamId: proposal.teamId || cust?.teamId || me.teamId || "",
      ownerUserId: proposal.assignedTo || me.id || "",
      dealValue: Number.isFinite(value) && value > 0 ? value : 0,
      expectedCloseDate: "",
      notes: proposal.notes ?? "",
      enablePaymentPlan: true,
      planSlug: "quarterly",
      startDate: new Date().toISOString().split("T")[0],
      distributionMode: "even",
      advancePercent: 30,
      customInstallments: 4,
      intervalMonths: 3,
      customPercentages: [25, 25, 25, 25],
    });
  }, [open, proposal, reset, customers, me.regionId, me.teamId, me.id]);

  const watched = watch();
  const watchedCustomerId = watch("customerId");
  const watchedRegionId = watch("regionId");
  const teamIdW = watch("teamId");

  const selectedCustomer = useMemo(() => {
    const cid = watchedCustomerId || proposal?.customerId;
    if (!cid) return undefined;
    return customers.find((c) => c.id === cid);
  }, [customers, watchedCustomerId, proposal?.customerId]);

  const teamsForRegion = useMemo(() => {
    const list = teams.filter((t) => t.regionId === watchedRegionId);
    return list.length ? list : teams;
  }, [teams, watchedRegionId]);

  useEffect(() => {
    if (!open || !watchedRegionId) return;
    const ok = teamsForRegion.some((t) => t.id === teamIdW);
    if (!ok && teamsForRegion[0]) {
      setValue("teamId", teamsForRegion[0].id, { shouldValidate: true });
    }
  }, [open, watchedRegionId, teamIdW, teamsForRegion, setValue]);

  const activeUsers = useMemo(
    () => users.filter((u) => u.status === "active").sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const customersSorted = useMemo(
    () =>
      [...customers].sort((a, b) =>
        (a.companyName || a.customerName || "").localeCompare(b.companyName || b.customerName || "", undefined, {
          sensitivity: "base",
        }),
      ),
    [customers],
  );

  const regionsSorted = useMemo(
    () => [...regions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [regions],
  );

  const customerStateCode = getStateCodeFromGSTIN(selectedCustomer?.gstin ?? "");
  const gstType = determineGSTType(customerStateCode);

  const liveInstallments: InstallmentPreview[] = useMemo(() => {
    if (!watched.enablePaymentPlan || !watched.startDate) return [];
    try {
      const selectedPlan = PLAN_OPTIONS.find((p) => p.slug === watched.planSlug);
      const count =
        watched.planSlug === "custom" ? watched.customInstallments : (selectedPlan?.count ?? 4);
      const interval =
        watched.planSlug === "custom"
          ? watched.intervalMonths
          : (selectedPlan?.intervalMonths ?? 3);

      return calculateInstallments({
        slug: watched.planSlug as PlanSlug,
        planName: selectedPlan?.label ?? "Custom Plan",
        totalAmount: watched.dealValue ?? 0,
        startDate: watched.startDate,
        installmentCount: count,
        distributionMode: watched.distributionMode as DistributionMode,
        advancePercent: watched.advancePercent,
        customPercentages: watched.customPercentages,
        intervalMonths: interval,
      });
    } catch {
      return [];
    }
  }, [
    watched.planSlug,
    watched.dealValue,
    watched.startDate,
    watched.distributionMode,
    watched.advancePercent,
    watched.customInstallments,
    watched.intervalMonths,
    watched.customPercentages,
    watched.enablePaymentPlan,
  ]);

  const handlePreview = handleSubmit((data) => {
    if (!proposal) return;
    if (data.enablePaymentPlan) {
      if (!liveInstallments.length) {
        toast.error("Could not build installments. Check amounts, dates, and custom percentages.");
        return;
      }
      if (data.distributionMode === "custom_percent") {
        const sum =
          data.customPercentages?.reduce((s, p) => s + (Number(p) || 0), 0) ?? 0;
        if (Math.abs(sum - 100) > 0.02) {
          toast.error("Custom percentages must total 100%.");
          return;
        }
      }
      setPreview(liveInstallments);
      setStep("preview");
    }
  });

  const handleCreateDealWithoutPlan = async () => {
    if (!proposal || !me?.id) return;
    const valid = await trigger();
    if (!valid) {
      toast.error("Fix the highlighted fields.");
      return;
    }
    const data = getValues();
    const value = data.dealValue;
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Deal value must be greater than 0.");
      return;
    }
    setGenerating(true);
    try {
      const cust = customers.find((c) => c.id === data.customerId);
      const { customerId, regionId, teamId, assignedTo } = resolveDealAssignmentFromForm(
        data,
        proposal,
        cust,
        me,
      );
      if (!customerId || !assignedTo || !regionId || !teamId) {
        toast.error(
          "Missing region, team, or deal owner. Select customer, region, team, and owner above.",
        );
        return;
      }
      const body = {
        name: data.title.trim(),
        customerId,
        ownerUserId: assignedTo,
        teamId,
        regionId,
        stage: "Negotiation",
        value,
        locked: true,
        proposalId: proposal.id,
        dealStatus: "Active",
        dealSource: "proposal",
        expectedCloseDate: data.expectedCloseDate,
        priority: "Medium",
        remarks: data.notes?.trim() || null,
        changedByUserId: me.id,
        changedByName: me.name,
        createdByUserId: me.id,
        createdByName: me.name,
        actorRole: me.role,
        actorUserId: me.id,
        actorTeamId: me.teamId,
        actorRegionId: me.regionId,
      };
      const deal = await api.post<Deal>("/deals", body);
      const proposalUpdated: Proposal = {
        ...proposal,
        status: "deal_created",
        dealId: deal.id,
        updatedAt: new Date().toISOString(),
      };
      await api.put<Proposal>(`/proposals/${proposal.id}`, proposalUpdated);

      INVALIDATE.deal(qc, deal.id, customerId);
      INVALIDATE.proposal(qc, proposal.id, customerId);

      toast.success(`Deal created: ${deal.id}`);
      onSuccess?.(deal);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create deal");
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async () => {
    if (!proposal || !me?.id) return;
    const formVals = getValues();
    if (!preview.length) {
      toast.error("Nothing to generate.");
      return;
    }

    setGenerating(true);
    try {
      const dealTitle = (formVals.title || proposal.title || "").trim();
      const cust = customers.find((c) => c.id === formVals.customerId);
      const { customerId, regionId, teamId, assignedTo } = resolveDealAssignmentFromForm(
        formVals,
        proposal,
        cust,
        me,
      );
      if (!dealTitle || !customerId || !assignedTo || !regionId || !teamId) {
        toast.error(
          "Missing deal title, customer, region, team, or owner. Fill all fields in Deal Details.",
        );
        return;
      }
      const selectedPlan = PLAN_OPTIONS.find((p) => p.slug === formVals.planSlug);

      const result = await api.post<WithPaymentPlanResponse>("/deals/with-payment-plan", {
        title: dealTitle,
        name: dealTitle,
        customerId,
        customerName: cust ? customerBillToName(cust) : proposal.customerName,
        proposalId: proposal.id,
        assignedTo,
        assignedToName:
          users.find((u) => u.id === assignedTo)?.name ?? proposal.assignedToName,
        regionId,
        teamId,
        stage: "Negotiation",
        dealValue: formVals.dealValue,
        expectedCloseDate: formVals.expectedCloseDate,
        source: "proposal",
        notes: formVals.notes,
        createdByUserId: me.id,
        createdByName: me.name,
        changedByUserId: me.id,
        changedByName: me.name,
        actorRole: me.role,
        actorUserId: me.id,
        actorTeamId: me.teamId,
        actorRegionId: me.regionId,
        planTypeId: null,
        planSlug: formVals.planSlug,
        planName: selectedPlan?.label ?? "Custom Plan",
        installmentCount: preview.length,
        distributionMode: formVals.distributionMode,
        advancePercent: formVals.advancePercent,
        startDate: formVals.startDate,
        installments: preview.map((p) => ({
          label: p.label,
          dueDate: p.dueDate,
          amount: p.amount,
          percentage: p.percentage,
        })),
      });

      const { deal, installments: savedInstallments } = result;

      const billToName = cust ? customerBillToName(cust) : proposal.customerName || "Customer";

      for (let i = 0; i < preview.length; i++) {
        setGeneratingIndex(i);
        const inst = preview[i];
        const savedInst = savedInstallments[i];
        if (!savedInst?.id) throw new Error("Missing installment id from server");

        const { estimateNumber } = await api.get<{ estimateNumber: string }>("/estimates/next-number");

        const lineAmounts = allocateAmountAcrossProposalLines(inst.amount, proposal.lineItems);

        const estimateData: EstimateData = {
          estimateNumber,
          estimateDate: inst.dueDate,
          customerName: billToName,
          customerAddress: cust
            ? [cust.address?.line1, cust.address?.line2].filter(Boolean).join(", ")
            : "",
          customerCity: cust?.address?.city ?? "",
          customerState: cust?.address?.state ?? "",
          customerPincode: cust?.address?.pincode ?? "",
          customerCountry: cust?.address?.country ?? "India",
          customerGstin: cust?.gstin,
          customerStateCode: customerStateCode || "",
          gstType,
          lineItems: proposal.lineItems.map((li, idx) => {
            const qty = Number(li.qty) || 1;
            const shareAmount = lineAmounts[idx] ?? 0;
            const rate = Math.round((shareAmount / qty) * 100) / 100;
            return {
              id: li.id,
              description: `${li.name}\n${inst.label} — ${inst.displayDate}`,
              hsnSac: li.sku || "998313",
              qty,
              unit: li.qtyLabel?.trim() || "Licence",
              rate,
              amount: Math.round(shareAmount * 100) / 100,
              taxRate: li.taxRate ?? 18,
            };
          }),
          notes: `${selectedPlan?.label ?? "Plan"} — Installment ${i + 1} of ${preview.length}`,
          termsAndConditions: ESTIMATE_DEFAULTS.terms,
        };

        const totals = calculateEstimateTotals(estimateData.lineItems, gstType);

        await generateEstimatePdfFromData(estimateData);

        await api.post("/estimates", {
          estimateNumber,
          customerId,
          grandTotal: totals.grandTotal,
          estimateJson: JSON.stringify(estimateData),
        });

        await api.put(`/deal-installments/${savedInst.id}/estimate-generated`, {
          estimateNumber,
        });

        if (i < preview.length - 1) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      INVALIDATE.deal(qc, deal.id, customerId);
      INVALIDATE.proposal(qc, proposal.id, customerId);
      qc.invalidateQueries({ queryKey: QK.paymentPlans() });

      toast.success(`Deal created + ${preview.length} estimates generated`, {
        description: `${deal.id} — ${billToName}`,
      });

      onSuccess?.(deal);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error creating deal");
    } finally {
      setGenerating(false);
      setGeneratingIndex(-1);
    }
  };

  if (!proposal) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "flex h-[100dvh] max-h-none w-full max-w-none flex-col gap-0 p-0",
          "sm:max-h-[95vh] sm:max-w-2xl sm:rounded-xl sm:h-auto",
        )}
      >
        <DialogHeader className="flex-shrink-0 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            {step === "preview" && (
              <button
                type="button"
                onClick={() => setStep("form")}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">
                {step === "form" ? "Convert to Deal" : "Preview Installments"}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-gray-500">
                {proposal.proposalNumber} — {proposal.customerName}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {["Deal Details", "Preview & Generate"].map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                  <div
                    className={cn(
                      "flex items-center gap-1.5",
                      (i === 0 && step === "form") || (i === 1 && step === "preview")
                        ? "text-blue-600"
                        : "text-gray-400",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        (i === 0 && step === "form") || (i === 1 && step === "preview")
                          ? "bg-blue-600 text-white"
                          : i === 0 && step === "preview"
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-200 text-gray-500",
                      )}
                    >
                      {i === 0 && step === "preview" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className="hidden text-xs font-medium sm:block">{s}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        {step === "form" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-800 dark:bg-blue-950">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="mb-0.5 text-xs text-blue-600 dark:text-blue-400">Customer</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {selectedCustomer
                        ? customerBillToName(selectedCustomer)
                        : proposal.customerName}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs text-blue-600 dark:text-blue-400">Proposal Value</p>
                    <p className="text-sm font-semibold">
                      ₹{proposal.grandTotal?.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs text-blue-600 dark:text-blue-400">GST Type</p>
                    <p className="text-sm font-semibold">
                      {gstType === "intra" ? "CGST + SGST" : "IGST"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Deal Details
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Customer *
                    </Label>
                    <Select
                      value={watched.customerId}
                      onValueChange={(v) => setValue("customerId", v, { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customersSorted.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.companyName || c.customerName || c.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.customerId && (
                      <p className="text-xs text-red-500">{errors.customerId.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Region *
                    </Label>
                    <Select
                      value={watched.regionId}
                      onValueChange={(v) => setValue("regionId", v, { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm">
                        <SelectValue placeholder="Region" />
                      </SelectTrigger>
                      <SelectContent>
                        {regionsSorted.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.regionId && (
                      <p className="text-xs text-red-500">{errors.regionId.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Team *
                    </Label>
                    <Select
                      value={watched.teamId}
                      onValueChange={(v) => setValue("teamId", v, { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamsForRegion.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.teamId && <p className="text-xs text-red-500">{errors.teamId.message}</p>}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Deal owner *
                    </Label>
                    <Select
                      value={watched.ownerUserId}
                      onValueChange={(v) => setValue("ownerUserId", v, { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm">
                        <SelectValue placeholder="Assigned sales user" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.ownerUserId && (
                      <p className="text-xs text-red-500">{errors.ownerUserId.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Deal Title *
                    </label>
                    <Input {...register("title")} className="h-9 rounded-lg text-sm" />
                    {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Deal Value (₹) *
                    </label>
                    <Input
                      type="number"
                      min={0}
                      {...register("dealValue", { valueAsNumber: true })}
                      className="h-9 rounded-lg text-sm"
                    />
                    {errors.dealValue && (
                      <p className="text-xs text-red-500">{errors.dealValue.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Expected Close Date *
                    </label>
                    <Input type="date" {...register("expectedCloseDate")} className="h-9 rounded-lg text-sm" />
                    {errors.expectedCloseDate && (
                      <p className="text-xs text-red-500">{errors.expectedCloseDate.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-t border-gray-100 py-2 dark:border-gray-800">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment Plan</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Auto-generate estimates for each installment
                  </p>
                </div>
                <Switch
                  checked={watched.enablePaymentPlan}
                  onCheckedChange={(v) => setValue("enablePaymentPlan", v)}
                />
              </div>

              {watched.enablePaymentPlan && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Payment Schedule
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PLAN_OPTIONS.map((plan) => (
                        <button
                          key={plan.slug}
                          type="button"
                          onClick={() => {
                            setValue("planSlug", plan.slug);
                            if (plan.slug !== "custom") {
                              setValue("customInstallments", plan.count);
                              setValue("intervalMonths", plan.intervalMonths);
                            }
                          }}
                          className={cn(
                            "rounded-lg border px-3.5 py-2 text-sm font-medium transition-all duration-150",
                            watched.planSlug === plan.slug
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900",
                            "hover:border-blue-400",
                          )}
                        >
                          {plan.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {watched.planSlug === "custom" && (
                    <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3.5 dark:border-gray-700 dark:bg-gray-800/50">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Number of Installments
                        </label>
                        <Input
                          type="number"
                          min={2}
                          max={24}
                          {...register("customInstallments", { valueAsNumber: true })}
                          className="h-8 rounded-lg text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Interval (months)
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          {...register("intervalMonths", { valueAsNumber: true })}
                          className="h-8 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      First Payment Date *
                    </label>
                    <Input type="date" {...register("startDate")} className="h-9 max-w-xs rounded-lg text-sm" />
                    <p className="text-xs text-gray-400">
                      All subsequent dates are calculated from this date
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Amount Distribution
                    </label>
                    <div className="space-y-2">
                      {DISTRIBUTION_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                            watched.distributionMode === opt.value
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                              : "border-gray-200 dark:border-gray-700",
                            "hover:border-blue-300",
                          )}
                        >
                          <input
                            type="radio"
                            value={opt.value}
                            checked={watched.distributionMode === opt.value}
                            onChange={() => setValue("distributionMode", opt.value)}
                            className="mt-0.5 text-blue-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {watched.distributionMode === "advance_then_equal" && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Advance Percentage
                      </label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          {...register("advancePercent", { valueAsNumber: true })}
                          className="h-9 w-24 rounded-lg text-sm"
                        />
                        <span className="text-sm text-gray-500">%</span>
                        <span className="text-sm text-gray-500">
                          = ₹
                          {Math.round(
                            ((watched.dealValue ?? 0) * (watched.advancePercent ?? 0)) / 100,
                          ).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  )}

                  {watched.distributionMode === "custom_percent" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Custom Percentages
                        <span className="ml-2 text-xs text-gray-400">(must total 100%)</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {liveInstallments.map((_, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="w-16 text-xs text-gray-500">Inst. {i + 1}:</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={watched.customPercentages?.[i] ?? 0}
                              onChange={(e) => {
                                const pcts = [...(watched.customPercentages ?? [])];
                                pcts[i] = Number(e.target.value);
                                setValue("customPercentages", pcts);
                              }}
                              className="h-8 w-16 rounded-lg text-center text-sm"
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        ))}
                      </div>
                      <p
                        className={cn(
                          "text-xs font-medium",
                          Math.abs(
                            (watched.customPercentages?.reduce((s, p) => s + p, 0) ?? 0) - 100,
                          ) < 0.02
                            ? "text-emerald-600"
                            : "text-red-500",
                        )}
                      >
                        Total: {watched.customPercentages?.reduce((s, p) => s + p, 0) ?? 0}%{" "}
                        {Math.abs(
                          (watched.customPercentages?.reduce((s, p) => s + p, 0) ?? 0) - 100,
                        ) < 0.02
                          ? "✓"
                          : "(must be 100%)"}
                      </p>
                    </div>
                  )}

                  {liveInstallments.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/60">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Installment Schedule Preview
                        </p>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {liveInstallments.map((inst, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                                <span className="text-[10px] font-bold text-blue-600">{inst.number}</span>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{inst.label}</p>
                                <p className="mt-0.5 text-xs text-gray-400">{inst.displayDate}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                ₹
                                {inst.amount.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </p>
                              <p className="text-xs text-gray-400">{inst.percentage}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          ₹
                          {watched.dealValue?.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t bg-white px-5 py-4 dark:bg-gray-950">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg px-4 text-sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              {watched.enablePaymentPlan ? (
                <Button
                  type="button"
                  className="h-9 rounded-lg bg-blue-600 px-5 text-sm text-white hover:bg-blue-700"
                  onClick={handlePreview}
                >
                  Preview Estimates
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-9 rounded-lg bg-blue-600 px-5 text-sm text-white hover:bg-blue-700"
                  onClick={() => void handleCreateDealWithoutPlan()}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create Deal"
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                      {preview.length} estimates will be generated
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                      Total: ₹{watched.dealValue?.toLocaleString("en-IN")} ·{" "}
                      {watched.planSlug === "custom"
                        ? `${watched.customInstallments} installments`
                        : PLAN_OPTIONS.find((p) => p.slug === watched.planSlug)?.label}{" "}
                      · {gstType === "intra" ? "CGST + SGST" : "IGST"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {preview.map((inst, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-xl border p-4 transition-all",
                      generating && generatingIndex === i
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : generating && generatingIndex > i
                          ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950"
                          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                            generating && generatingIndex === i
                              ? "bg-blue-600"
                              : generating && generatingIndex > i
                                ? "bg-emerald-500"
                                : "bg-gray-100 dark:bg-gray-800",
                          )}
                        >
                          {generating && generatingIndex === i ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          ) : generating && generatingIndex > i ? (
                            <Check className="h-4 w-4 text-white" />
                          ) : (
                            <span className="text-sm font-bold text-gray-600">{inst.number}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{inst.label}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-xs text-gray-500">Due: {inst.displayDate}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                          ₹
                          {inst.amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">{inst.percentage}% of total</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                      <div>
                        <p className="text-xs text-gray-400">Subtotal</p>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          ₹
                          {inst.amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      {gstType === "intra" ? (
                        <>
                          <div>
                            <p className="text-xs text-gray-400">CGST (9%)</p>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              ₹{(inst.amount * 0.09).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Total</p>
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                              ₹{(inst.amount * 1.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs text-gray-400">IGST (18%)</p>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              ₹{(inst.amount * 0.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Total</p>
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                              ₹{(inst.amount * 1.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border-2 border-gray-900 bg-gray-900 p-4 dark:border-gray-100 dark:bg-gray-100">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-300 dark:text-gray-600">Total (excl. GST)</span>
                  <span className="text-sm font-medium text-white dark:text-gray-900">
                    ₹
                    {watched.dealValue?.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-300 dark:text-gray-600">GST (18%)</span>
                  <span className="text-sm font-medium text-white dark:text-gray-900">
                    ₹{((watched.dealValue ?? 0) * 0.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-700 pt-2 dark:border-gray-300">
                  <span className="text-base font-bold text-white dark:text-gray-900">Grand Total</span>
                  <span className="text-base font-bold text-white dark:text-gray-900">
                    ₹{((watched.dealValue ?? 0) * 1.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t bg-white px-5 py-4 dark:bg-gray-950">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg px-4 text-sm"
                onClick={() => setStep("form")}
                disabled={generating}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                className="h-9 rounded-lg bg-emerald-600 px-5 text-sm text-white hover:bg-emerald-700"
                onClick={() => void handleConfirm()}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating {Math.max(0, generatingIndex + 1)}/{preview.length}…
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Create Deal + Generate {preview.length} Estimates
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
