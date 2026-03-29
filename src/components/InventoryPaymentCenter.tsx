import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { apiUrl } from "@/lib/api";
import { formatINR, can } from "@/lib/rbac";
import {
  checkInstallmentPaymentReminders,
  getInstallmentReminderSettings,
  saveInstallmentReminderSettings,
  triggerAutomation,
  type InstallmentReminderSettings,
} from "@/lib/automationService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import type { Proposal } from "@/types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CreditCard, History, LayoutDashboard, Receipt, Scale, Trash2, Wallet } from "lucide-react";

type ApiCustomer = {
  id: string;
  name: string;
  leadId?: string;
  email?: string | null;
  primaryPhone?: string | null;
};

type CatalogPlan = {
  id: string;
  name: string;
  defaultBillingCycle: string;
  defaultGraceDays: number;
  suggestedInstallments: number | null;
};

type ProposalDecision = {
  id: string;
  customerId: string;
  proposalId: string;
  status: "accepted" | "rejected";
  rejectionReason?: string | null;
  decisionDate: string;
  approvedByUserId?: string | null;
  approvedByName?: string | null;
  remarks?: string | null;
  updatedAt: string;
};

type CustomerPaymentPlan = {
  id: string;
  customerId: string;
  catalogPlanId: string;
  planName: string;
  billingCycle: string;
  totalPlanAmount: number;
  planStartDate: string;
  planEndDate: string;
  numInstallments: number;
  perInstallmentAmount: number;
  nextDueDate: string;
  gracePeriodDays: number;
  creditBalance: number;
  amountPaidTotal: number;
  partialAllowed: number;
  status: string;
};

type PaymentRecord = {
  id: string;
  customerId: string;
  planId: string;
  receiptNumber?: string | null;
  paymentMode: string;
  transactionRef?: string | null;
  bankName?: string | null;
  chequeNumber?: string | null;
  receiptFileRef?: string | null;
  paymentDate: string;
  amountPaid: number;
  paymentStatus: string;
  adminConfirmed: number;
  adminConfirmedByName?: string | null;
  internalNotes?: string | null;
  isPartial: number;
  balanceCarriedForward: number;
  receiptSent: number;
  billingCycleSnapshot?: string | null;
};

type RemainingRow = {
  customerId: string;
  customerName?: string;
  customerLeadId?: string;
  planName: string;
  planId: string;
  dueDate: string;
  dueAmount: number;
  totalRemaining: number;
  category: string;
  daysOverdue: number;
  daysRemaining: number;
  lastPaymentDate?: string | null;
  billingCycle: string;
  nextDueDate: string;
  planEndDate: string;
};

type AuditRow = {
  id: string;
  entityType: string;
  entityId: string;
  customerId?: string | null;
  action: string;
  detailJson?: string | null;
  userId: string;
  userName: string;
  at: string;
};

const PAYMENT_MODES = [
  { value: "online", label: "Online / card" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer (NEFT/RTGS)" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  /** Use when recording an installment that is still on schedule (before/ on due). */
  { value: "due", label: "Due installment" },
  /** Use when recording a catch-up payment after the due date / overdue balance. */
  { value: "overdue", label: "Overdue settlement" },
] as const;

function paymentModeLabel(mode: string): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label ?? mode;
}

function categoryBadge(category: string) {
  switch (category) {
    case "paid":
      return <Badge className="bg-emerald-500/15 text-emerald-800">Paid</Badge>;
    case "overdue":
      return <Badge variant="destructive">Overdue</Badge>;
    case "grace":
      return <Badge className="bg-amber-500/15 text-amber-900">Grace period</Badge>;
    default:
      return <Badge variant="secondary">Upcoming</Badge>;
  }
}

function paymentHealth(plan: CustomerPaymentPlan | null, category: string | undefined) {
  if (!plan) return "—";
  if (plan.status === "completed") return "Completed";
  if (category === "overdue") return "Overdue — collect";
  if (category === "grace") return "Grace period";
  return "Current";
}

export function InventoryPaymentCenter({ initialCustomerId }: { initialCustomerId?: string } = {}) {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.me);
  const customersStore = useAppStore((s) => s.customers);

  const canCreatePayment = can(me.role, "payments", "create");
  const canUpdatePayment = can(me.role, "payments", "update");
  const canDeletePayment = can(me.role, "payments", "delete");
  const canExportPayment = can(me.role, "payments", "export");

  const [customerId, setCustomerId] = useState<string>(initialCustomerId ?? "");
  const [reminderSettings, setReminderSettings] = useState<InstallmentReminderSettings>(() =>
    getInstallmentReminderSettings(),
  );
  const [historyFilters, setHistoryFilters] = useState({
    from: "",
    to: "",
    mode: "all",
    cycle: "all",
    status: "all" as "all" | "pending" | "confirmed" | "failed",
  });
  const [remainingCategoryFilter, setRemainingCategoryFilter] = useState<
    "all" | "upcoming" | "grace" | "overdue" | "paid"
  >("all");

  const customersQ = useQuery({
    queryKey: ["api-customers-payment"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/customers"));
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json() as Promise<ApiCustomer[]>;
    },
  });

  const proposalsQ = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/proposals"));
      if (!res.ok) throw new Error("Failed to load proposals");
      return res.json() as Promise<Proposal[]>;
    },
  });

  const catalogQ = useQuery({
    queryKey: ["payment-plan-catalog"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/payment-plans/catalog"));
      if (!res.ok) throw new Error("Failed to load plan catalog");
      return res.json() as Promise<CatalogPlan[]>;
    },
  });

  const summaryQ = useQuery({
    queryKey: ["payment-summary", customerId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/payments/customer/${customerId}/summary`));
      if (!res.ok) throw new Error("Failed to load payment summary");
      return res.json() as Promise<{
        decision: ProposalDecision | null;
        plan: CustomerPaymentPlan | null;
        payments: PaymentRecord[];
      }>;
    },
    enabled: !!customerId,
  });

  const remainingQ = useQuery({
    queryKey: ["payments-remaining"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/payments/remaining"));
      if (!res.ok) throw new Error("Failed to load remaining");
      return res.json() as Promise<RemainingRow[]>;
    },
  });

  const historyQ = useQuery({
    queryKey: ["payments-history", historyFilters, customerId],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (customerId) q.set("customerId", customerId);
      if (historyFilters.from) q.set("from", historyFilters.from);
      if (historyFilters.to) q.set("to", historyFilters.to);
      if (historyFilters.mode !== "all") q.set("mode", historyFilters.mode);
      if (historyFilters.cycle !== "all") q.set("cycle", historyFilters.cycle);
      if (historyFilters.status !== "all") q.set("status", historyFilters.status);
      const res = await fetch(apiUrl(`/api/payments/history?${q}`));
      if (!res.ok) throw new Error("Failed to load history");
      return res.json() as Promise<
        (PaymentRecord & { customerName?: string; customerLeadId?: string; planName?: string })[]
      >;
    },
  });

  const auditQ = useQuery({
    queryKey: ["payments-audit", customerId],
    queryFn: async () => {
      const q = customerId ? `?customerId=${encodeURIComponent(customerId)}&limit=200` : "?limit=200";
      const res = await fetch(apiUrl(`/api/payments/audit${q}`));
      if (!res.ok) throw new Error("Failed to load audit");
      return res.json() as Promise<AuditRow[]>;
    },
  });

  useEffect(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  useEffect(() => {
    if (!remainingQ.data?.length) return;
    checkInstallmentPaymentReminders(remainingQ.data, reminderSettings);
  }, [remainingQ.data, reminderSettings]);

  const customerProposals = useMemo(
    () => proposalsQ.data?.filter((p) => p.customerId === customerId) ?? [],
    [proposalsQ.data, customerId],
  );

  const myRemaining = useMemo(
    () => remainingQ.data?.filter((r) => r.customerId === customerId) ?? [],
    [remainingQ.data, customerId],
  );

  const decision = summaryQ.data?.decision ?? null;
  const plan = summaryQ.data?.plan ?? null;
  const payments = summaryQ.data?.payments ?? [];

  const proposalLocked = decision?.status === "rejected";
  const planUnlocked = decision?.status === "accepted";
  const paymentsUnlocked = planUnlocked && !!plan && !proposalLocked;

  const totalPaid = plan?.amountPaidTotal ?? 0;
  const totalRemaining = plan
    ? Math.max(0, Number(plan.totalPlanAmount) - Number(plan.amountPaidTotal))
    : 0;
  const currentRowCategory = myRemaining[0]?.category;

  const remainingStats = useMemo(() => {
    const rows = remainingQ.data ?? [];
    return {
      total: rows.length,
      upcoming: rows.filter((r) => r.category === "upcoming").length,
      grace: rows.filter((r) => r.category === "grace").length,
      overdue: rows.filter((r) => r.category === "overdue").length,
      paid: rows.filter((r) => r.category === "paid").length,
    };
  }, [remainingQ.data]);

  const filteredRemainingRows = useMemo(() => {
    const rows = (remainingQ.data ?? []).filter((r) => !customerId || r.customerId === customerId);
    if (remainingCategoryFilter === "all") return rows;
    return rows.filter((r) => r.category === remainingCategoryFilter);
  }, [remainingQ.data, customerId, remainingCategoryFilter]);

  const invalidatePayments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
    queryClient.invalidateQueries({ queryKey: ["payments-remaining"] });
    queryClient.invalidateQueries({ queryKey: ["payments-history"] });
    queryClient.invalidateQueries({ queryKey: ["payments-audit"] });
  }, [queryClient]);

  const decisionMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(apiUrl(`/api/payments/customer/${customerId}/proposal-decision`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Save failed");
      }
      return res.json();
    },
    onSuccess: async (_, vars) => {
      invalidatePayments();
      toast({ title: "Proposal decision saved" });
      if (vars.status === "accepted") {
        const prop = customerProposals.find((p) => p.id === vars.proposalId);
        const uiCustomer = customersStore.find((c) => c.id === customerId);
        const primary = uiCustomer?.contacts.find((c) => c.isPrimary) ?? uiCustomer?.contacts?.[0];
        await triggerAutomation("proposal_approved", {
          proposalId: String(vars.proposalId),
          proposalNumber: prop?.proposalNumber,
          proposalTitle: prop?.title,
          grandTotal: prop?.finalQuoteValue ?? prop?.grandTotal,
          approvedBy: String(vars.approvedByName ?? me.name),
          customerId,
          customerName: uiCustomer?.companyName ?? customersQ.data?.find((c) => c.id === customerId)?.name,
          customerPhone: primary?.phone,
          customerEmail: primary?.email,
          planName: "Assign payment plan in Payments → Plan tab",
          nextDueDate: "",
        });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendReceiptAutomation = useCallback(
    async (rec: PaymentRecord) => {
      const res = await fetch(apiUrl(`/api/payments/customer/${rec.customerId}/summary`));
      const data = (await res.json()) as {
        plan: CustomerPaymentPlan | null;
        payments: PaymentRecord[];
      };
      const p = data.plan;
      const payList = data.payments ?? [];
      const made = payList.filter((x) => x.paymentStatus === "confirmed").length;
      const remainingAmt = p ? Math.max(0, Number(p.totalPlanAmount) - Number(p.amountPaidTotal)) : 0;
      const rem = p
        ? Math.max(0, Math.ceil(remainingAmt / (Number(p.perInstallmentAmount) || 1)))
        : 0;
      const planDetails = p
        ? `${p.planName} · ${p.billingCycle} · ${p.numInstallments} installments · ends ${p.planEndDate}`
        : "";
      const uiCustomer = customersStore.find((c) => c.id === rec.customerId);
      const primary = uiCustomer?.contacts.find((c) => c.isPrimary) ?? uiCustomer?.contacts?.[0];
      const ctx = {
        customerId: rec.customerId,
        customerName: uiCustomer?.companyName ?? customersQ.data?.find((c) => c.id === rec.customerId)?.name,
        customerPhone: primary?.phone,
        customerEmail: primary?.email,
        amountPaid: rec.amountPaid,
        paymentDate: new Date(rec.paymentDate + "T12:00:00").toLocaleDateString("en-IN"),
        receiptNumber: rec.receiptNumber ?? "",
        planName: p?.planName ?? "",
        paymentsMadeCount: made,
        paymentsRemainingCount: rem,
        nextDueDate: p?.nextDueDate ?? "",
        planDetails,
        invoiceNumber: rec.receiptNumber ?? "Receipt",
      };
      await triggerAutomation("payment_received", ctx);
    },
    [customersQ.data, customersStore],
  );

  const planMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(apiUrl(`/api/payments/customer/${customerId}/payment-plan`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, userId: me.id, userName: me.name }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to assign plan");
      }
      return res.json() as CustomerPaymentPlan;
    },
    onSuccess: async (saved) => {
      invalidatePayments();
      toast({ title: "Payment plan assigned" });
      const uiCustomer = customersStore.find((c) => c.id === customerId);
      const primary = uiCustomer?.contacts.find((c) => c.isPrimary) ?? uiCustomer?.contacts?.[0];
      const today = new Date().toISOString().slice(0, 10);
      const daysUntil = Math.max(
        0,
        Math.round(
          (new Date(saved.planStartDate + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) /
            86400000,
        ),
      );
      await triggerAutomation("payment_due", {
        customerId,
        customerName: uiCustomer?.companyName ?? customersQ.data?.find((c) => c.id === customerId)?.name,
        customerPhone: primary?.phone,
        customerEmail: primary?.email,
        invoiceNumber: `${saved.planName} · first installment`,
        amountDue: saved.perInstallmentAmount,
        dueDate: new Date(saved.planStartDate + "T12:00:00").toLocaleDateString("en-IN"),
        daysUntilDue: daysUntil,
        planName: saved.planName,
        nextDueDate: saved.planStartDate,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(apiUrl(`/api/payments/customer/${customerId}/payment`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, userId: me.id, userName: me.name }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Payment failed");
      }
      return res.json() as PaymentRecord;
    },
    onSuccess: async (rec) => {
      invalidatePayments();
      toast({ title: "Payment recorded" });
      if (rec.paymentStatus === "confirmed" && rec.receiptNumber) {
        await sendReceiptAutomation(rec);
        await fetch(apiUrl(`/api/payments/record/${rec.id}/receipt-sent`), { method: "PUT" });
        invalidatePayments();
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const confirmMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/payments/record/${id}/confirm`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: me.id, userName: me.name }),
      });
      if (!res.ok) throw new Error("Confirm failed");
      return res.json() as PaymentRecord;
    },
    onSuccess: async (rec) => {
      invalidatePayments();
      toast({ title: "Payment confirmed", description: `Receipt ${rec.receiptNumber ?? ""}` });
      if (rec.receiptNumber) {
        await sendReceiptAutomation(rec);
        await fetch(apiUrl(`/api/payments/record/${rec.id}/receipt-sent`), { method: "PUT" });
        invalidatePayments();
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePlanMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/payments/customer/${customerId}/payment-plan`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: me.id, userName: me.name }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Could not remove plan");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidatePayments();
      toast({ title: "Payment plan removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePaymentMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/payments/record/${id}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: me.id, userName: me.name }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Could not delete payment");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidatePayments();
      toast({ title: "Payment entry deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const exportHistoryCsv = () => {
    const rows = historyQ.data ?? [];
    const headers = [
      "Payment ID",
      "Customer",
      "Lead ID",
      "Plan",
      "Amount",
      "Date",
      "Cycle",
      "Mode",
      "Txn ref",
      "Receipt",
      "Receipt sent",
      "Confirmed by",
      "Notes",
    ];
    const lines = rows.map((r) =>
      [
        r.id,
        r.customerName ?? "",
        r.customerLeadId ?? "",
        r.planName ?? "",
        r.amountPaid,
        r.paymentDate,
        r.billingCycleSnapshot ?? "",
        paymentModeLabel(r.paymentMode),
        r.transactionRef ?? "",
        r.receiptNumber ?? "",
        r.receiptSent ? "Yes" : "No",
        r.adminConfirmedByName ?? "",
        (r.internalNotes ?? "").replaceAll(",", ";"),
      ].join(","),
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Exported", description: "CSV downloaded (opens in Excel)." });
  };

  const exportHistoryPdf = () => {
    const rows = historyQ.data ?? [];
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Payment history", 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 26,
      head: [
        [
          "ID",
          "Customer",
          "Plan",
          "Amount",
          "Date",
          "Mode",
          "Receipt",
          "Sent",
        ],
      ],
      body: rows.map((r) => [
        r.id.slice(0, 8),
        r.customerName ?? "—",
        r.planName ?? "—",
        String(r.amountPaid),
        r.paymentDate,
        r.paymentMode,
        r.receiptNumber ?? "—",
        r.receiptSent ? "Y" : "N",
      ]),
      styles: { fontSize: 7 },
    });
    doc.save(`payment-history-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "PDF exported" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 min-w-[220px] flex-1">
            <Label className="text-xs">Select customer</Label>
            <Select value={customerId || undefined} onValueChange={setCustomerId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose customer…" />
              </SelectTrigger>
              <SelectContent>
                {(customersQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.leadId ?? c.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {customerId && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Payment dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Total plans</p>
                <p className="font-semibold tabular-nums">{plan ? 1 : 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="font-semibold tabular-nums">{formatINR(totalPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="font-semibold tabular-nums">{formatINR(totalRemaining)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="font-semibold tabular-nums text-destructive">
                  {myRemaining.filter((r) => r.category === "overdue").length}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Next due: <span className="font-medium text-foreground">{plan?.nextDueDate ?? "—"}</span>
              </span>
              <span>
                Plan ends: <span className="font-medium text-foreground">{plan?.planEndDate ?? "—"}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Installment status:</span>
              {myRemaining[0] ? categoryBadge(myRemaining[0].category) : <Badge variant="outline">—</Badge>}
              <span className="text-xs text-muted-foreground ml-2">Health:</span>
              <Badge variant="secondary">{paymentHealth(plan, currentRowCategory)}</Badge>
              {proposalLocked && <Badge variant="destructive">Payments locked — proposal rejected</Badge>}
              {!planUnlocked && !proposalLocked && (
                <Badge variant="outline">Awaiting proposal acceptance</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {customerId && (
        <Tabs defaultValue="proposal" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="proposal" className="text-xs gap-1">
              <Scale className="w-3.5 h-3.5" />
              Proposal
            </TabsTrigger>
            <TabsTrigger value="plan" className="text-xs gap-1" disabled={!planUnlocked}>
              <Wallet className="w-3.5 h-3.5" />
              Plan
            </TabsTrigger>
            <TabsTrigger value="pay" className="text-xs gap-1" disabled={!paymentsUnlocked}>
              <CreditCard className="w-3.5 h-3.5" />
              Pay
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1">
              <History className="w-3.5 h-3.5" />
              History
            </TabsTrigger>
            <TabsTrigger value="remaining" className="text-xs gap-1">
              <Receipt className="w-3.5 h-3.5" />
              Remaining
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1">
              Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="proposal" className="space-y-4">
            {proposalLocked && decision?.rejectionReason && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">Rejected</p>
                <p className="mt-1">{decision.rejectionReason}</p>
              </div>
            )}
            {customerProposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No proposals linked to this customer. Create a proposal in Proposals first.
              </p>
            ) : (
              <ProposalDecisionForm
                customerProposals={customerProposals}
                decision={decision}
                onSave={(v) =>
                  decisionMut.mutate({
                    proposalId: v.proposalId,
                    status: v.status,
                    rejectionReason: v.rejectionReason,
                    decisionDate: v.decisionDate,
                    approvedByUserId: me.id,
                    approvedByName: me.name,
                    remarks: v.remarks,
                  })
                }
                loading={decisionMut.isPending}
                disabled={!canCreatePayment}
              />
            )}
          </TabsContent>

          <TabsContent value="plan" className="space-y-4">
            {!planUnlocked ? (
              <p className="text-sm text-muted-foreground">Accept a proposal first.</p>
            ) : (
              <div className="space-y-4">
                <PaymentPlanForm
                  catalog={catalogQ.data ?? []}
                  existingPlan={plan}
                  onSubmit={(v) => planMut.mutate(v)}
                  loading={planMut.isPending}
                  disabled={!canCreatePayment}
                />
                {plan && canDeletePayment && (
                  <Card className="border-destructive/30">
                    <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Remove the assigned plan only if there are no payment records yet.
                      </p>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletePlanMut.isPending}
                        onClick={() => {
                          if (confirm("Remove this customer’s payment plan?")) deletePlanMut.mutate();
                        }}
                      >
                        Remove payment plan
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pay" className="space-y-4">
            {!paymentsUnlocked ? (
              <p className="text-sm text-muted-foreground">Assign an active payment plan to record payments.</p>
            ) : (
              <RecordPaymentForm
                plan={plan!}
                onSubmit={(v) => payMut.mutate(v)}
                loading={payMut.isPending}
                disabled={!canCreatePayment}
              />
            )}
            {payments.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Pending confirmation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payments
                    .filter((p) => p.paymentStatus === "pending")
                    .map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-2 text-sm"
                      >
                        <div>
                          <span className="font-mono text-xs">{p.id}</span> · {p.paymentMode} ·{" "}
                          {formatINR(p.amountPaid)} · {p.paymentDate}
                        </div>
                        <div className="flex gap-1">
                          {canUpdatePayment && (
                            <Button size="sm" variant="secondary" onClick={() => confirmMut.mutate(p.id)}>
                              Confirm & issue receipt
                            </Button>
                          )}
                          {canDeletePayment && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm("Delete this pending payment entry?")) deletePaymentMut.mutate(p.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  {payments.every((p) => p.paymentStatus !== "pending") && (
                    <p className="text-xs text-muted-foreground">No pending items.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Scoped to the customer selected above{customerId ? "" : " (all customers)"}.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={historyFilters.from}
                  onChange={(e) => setHistoryFilters((f) => ({ ...f, from: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={historyFilters.to}
                  onChange={(e) => setHistoryFilters((f) => ({ ...f, to: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Mode</Label>
                <Select
                  value={historyFilters.mode}
                  onValueChange={(mode) => setHistoryFilters((f) => ({ ...f, mode }))}
                >
                  <SelectTrigger className="h-9 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {PAYMENT_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cycle</Label>
                <Select
                  value={historyFilters.cycle}
                  onValueChange={(cycle) => setHistoryFilters((f) => ({ ...f, cycle }))}
                >
                  <SelectTrigger className="h-9 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={historyFilters.status}
                  onValueChange={(status) =>
                    setHistoryFilters((f) => ({
                      ...f,
                      status: status as "all" | "pending" | "confirmed" | "failed",
                    }))
                  }
                >
                  <SelectTrigger className="h-9 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {canExportPayment && (
                <>
                  <Button size="sm" variant="outline" onClick={exportHistoryCsv}>
                    Excel (CSV)
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportHistoryPdf}>
                    PDF
                  </Button>
                </>
              )}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden text-xs sm:table-cell">ID</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="hidden text-xs md:table-cell">Plan</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="hidden text-xs md:table-cell">Mode</TableHead>
                    <TableHead className="hidden text-xs lg:table-cell">Receipt</TableHead>
                    <TableHead className="hidden text-xs lg:table-cell">Sent</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    {canDeletePayment && <TableHead className="text-xs w-[70px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(historyQ.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">{r.id.slice(0, 10)}…</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{r.customerName}</span>
                        <p className="text-[10px] text-muted-foreground md:hidden">{r.planName ?? "—"}</p>
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">{r.planName}</TableCell>
                      <TableCell className="text-xs">{formatINR(r.amountPaid)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.paymentDate}</TableCell>
                      <TableCell className="hidden text-xs md:table-cell">{paymentModeLabel(r.paymentMode)}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">{r.receiptNumber ?? "—"}</TableCell>
                      <TableCell className="hidden text-xs lg:table-cell">{r.receiptSent ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-xs capitalize">{r.paymentStatus}</TableCell>
                      {canDeletePayment && (
                        <TableCell className="text-xs">
                          {r.paymentStatus === "pending" || r.paymentStatus === "failed" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (confirm("Delete this payment row?")) deletePaymentMut.mutate(r.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="remaining" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Upcoming</p>
                  <p className="text-xl font-semibold tabular-nums">{remainingStats.upcoming}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Grace</p>
                  <p className="text-xl font-semibold tabular-nums text-amber-700">{remainingStats.grace}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Overdue</p>
                  <p className="text-xl font-semibold tabular-nums text-destructive">{remainingStats.overdue}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Paid up</p>
                  <p className="text-xl font-semibold tabular-nums text-emerald-700">{remainingStats.paid}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active plans</p>
                  <p className="text-xl font-semibold tabular-nums">{remainingStats.total}</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-muted-foreground">Show:</span>
              {(
                [
                  ["all", "All"],
                  ["upcoming", "Due soon"],
                  ["grace", "Grace period"],
                  ["overdue", "Overdue"],
                  ["paid", "Paid up"],
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={remainingCategoryFilter === k ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setRemainingCategoryFilter(k)}
                >
                  {label}
                </Button>
              ))}
              {customerId && (
                <span className="text-xs text-muted-foreground">
                  (also filtering to selected customer below)
                </span>
              )}
            </div>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Reminder automation (installments)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Uses your active <strong>payment_due</strong> and <strong>invoice_overdue</strong> templates.
                  Offsets are relative to installment due date.
                </p>
                <div className="flex flex-wrap gap-3 items-center">
                  <Label className="text-xs">Days before due (comma-separated)</Label>
                  <Input
                    className="h-8 w-40 text-xs"
                    defaultValue={reminderSettings.remindDaysBefore.join(",")}
                    onBlur={(e) => {
                      const remindDaysBefore = e.target.value
                        .split(",")
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => !Number.isNaN(n) && n > 0);
                      const next = { ...reminderSettings, remindDaysBefore };
                      setReminderSettings(next);
                      saveInstallmentReminderSettings(next);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="onDue"
                    checked={reminderSettings.remindOnDue}
                    onCheckedChange={(c) => {
                      const next = { ...reminderSettings, remindOnDue: !!c };
                      setReminderSettings(next);
                      saveInstallmentReminderSettings(next);
                    }}
                  />
                  <Label htmlFor="onDue" className="text-xs font-normal cursor-pointer">
                    Send on due date
                  </Label>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <Label className="text-xs">Days after due (overdue nudges)</Label>
                  <Input
                    className="h-8 w-40 text-xs"
                    defaultValue={reminderSettings.remindDaysAfterDue.join(",")}
                    onBlur={(e) => {
                      const remindDaysAfterDue = e.target.value
                        .split(",")
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => !Number.isNaN(n) && n > 0);
                      const next = { ...reminderSettings, remindDaysAfterDue };
                      setReminderSettings(next);
                      saveInstallmentReminderSettings(next);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Plan</TableHead>
                    <TableHead className="text-xs">Due</TableHead>
                    <TableHead className="text-xs">Due amt</TableHead>
                    <TableHead className="text-xs">Remaining</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Overdue / left</TableHead>
                    <TableHead className="text-xs">Last pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRemainingRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                        No rows match this filter{customerId ? " for the selected customer" : ""}.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredRemainingRows.map((r) => (
                      <TableRow key={`${r.customerId}-${r.planId}`}>
                        <TableCell className="text-xs">{r.customerName}</TableCell>
                        <TableCell className="text-xs">{r.planName}</TableCell>
                        <TableCell className="text-xs">{r.dueDate}</TableCell>
                        <TableCell className="text-xs">{formatINR(r.dueAmount)}</TableCell>
                        <TableCell className="text-xs">{formatINR(r.totalRemaining)}</TableCell>
                        <TableCell>{categoryBadge(r.category)}</TableCell>
                        <TableCell className="text-xs">
                          {r.category === "paid"
                            ? "—"
                            : r.category === "overdue"
                              ? `${r.daysOverdue}d overdue`
                              : r.category === "grace"
                                ? `${r.daysRemaining}d left in grace`
                                : `${r.daysRemaining}d until due`}
                        </TableCell>
                        <TableCell className="text-xs">{r.lastPaymentDate ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <div className="rounded-md border max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">When</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Entity</TableHead>
                    <TableHead className="text-xs">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditQ.data ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(a.at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{a.userName}</TableCell>
                      <TableCell className="text-xs">{a.action}</TableCell>
                      <TableCell className="text-xs">
                        {a.entityType} / {a.entityId?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={a.detailJson ?? ""}>
                        {a.detailJson ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ProposalDecisionForm({
  customerProposals,
  decision,
  onSave,
  loading,
  disabled,
}: {
  customerProposals: Proposal[];
  decision: ProposalDecision | null;
  onSave: (v: {
    proposalId: string;
    status: "accepted" | "rejected";
    rejectionReason: string;
    decisionDate: string;
    remarks: string;
  }) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  const [proposalId, setProposalId] = useState(decision?.proposalId ?? customerProposals[0]?.id ?? "");
  const [status, setStatus] = useState<"accepted" | "rejected">(decision?.status ?? "accepted");
  const [rejectionReason, setRejectionReason] = useState(decision?.rejectionReason ?? "");
  const [decisionDate, setDecisionDate] = useState(decision?.decisionDate ?? new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState(decision?.remarks ?? "");

  useEffect(() => {
    if (decision) {
      setProposalId(decision.proposalId);
      setStatus(decision.status);
      setRejectionReason(decision.rejectionReason ?? "");
      setDecisionDate(decision.decisionDate);
      setRemarks(decision.remarks ?? "");
    }
  }, [decision]);

  useEffect(() => {
    if (customerProposals.length === 0) {
      setProposalId("");
      return;
    }
    setProposalId((cur) => (cur && customerProposals.some((p) => p.id === cur) ? cur : customerProposals[0].id));
  }, [customerProposals]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Proposal</Label>
          <Select value={proposalId} onValueChange={setProposalId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select proposal" />
            </SelectTrigger>
            <SelectContent>
              {customerProposals.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.proposalNumber} — {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Decision</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "accepted" | "rejected")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {status === "rejected" && (
          <div className="space-y-1">
            <Label className="text-xs">Rejection reason</Label>
            <Textarea className="min-h-[72px]" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Decision date</Label>
          <Input type="date" className="h-9 w-[180px]" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Remarks</Label>
          <Textarea className="min-h-[60px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <Button
          disabled={disabled || loading || !proposalId}
          onClick={() =>
            onSave({
              proposalId,
              status,
              rejectionReason,
              decisionDate,
              remarks,
            })
          }
        >
          Save decision
        </Button>
      </CardContent>
    </Card>
  );
}

function PaymentPlanForm({
  catalog,
  existingPlan,
  onSubmit,
  loading,
  disabled,
}: {
  catalog: CatalogPlan[];
  existingPlan: CustomerPaymentPlan | null;
  onSubmit: (body: Record<string, unknown>) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  const [catalogPlanId, setCatalogPlanId] = useState(existingPlan?.catalogPlanId ?? catalog[0]?.id ?? "");
  const cat = catalog.find((c) => c.id === catalogPlanId) ?? catalog[0];
  const [billingCycle, setBillingCycle] = useState(existingPlan?.billingCycle ?? cat?.defaultBillingCycle ?? "yearly");
  const [totalPlanAmount, setTotalPlanAmount] = useState(String(existingPlan?.totalPlanAmount ?? ""));
  const [planStartDate, setPlanStartDate] = useState(existingPlan?.planStartDate ?? new Date().toISOString().slice(0, 10));
  const [planEndDate, setPlanEndDate] = useState(existingPlan?.planEndDate ?? "");
  const [numInstallments, setNumInstallments] = useState(
    String(existingPlan?.numInstallments ?? cat?.suggestedInstallments ?? 12),
  );
  const [gracePeriodDays, setGracePeriodDays] = useState(String(existingPlan?.gracePeriodDays ?? cat?.defaultGraceDays ?? 5));
  const [partialAllowed, setPartialAllowed] = useState(existingPlan?.partialAllowed !== 0);

  const per =
    totalPlanAmount && numInstallments
      ? Math.round((Number(totalPlanAmount) / Math.max(1, Number(numInstallments))) * 100) / 100
      : 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Catalog plan</Label>
          <Select
            value={catalogPlanId}
            onValueChange={(id) => {
              setCatalogPlanId(id);
              const c = catalog.find((x) => x.id === id);
              if (c) {
                setBillingCycle(c.defaultBillingCycle);
                setGracePeriodDays(String(c.defaultGraceDays));
                if (c.suggestedInstallments) setNumInstallments(String(c.suggestedInstallments));
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose plan" />
            </SelectTrigger>
            <SelectContent>
              {catalog.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Billing cycle</Label>
            <Select value={billingCycle} onValueChange={setBillingCycle}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Total plan amount (₹)</Label>
            <Input className="h-9" type="number" value={totalPlanAmount} onChange={(e) => setTotalPlanAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start date</Label>
            <Input type="date" className="h-9" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End date</Label>
            <Input type="date" className="h-9" value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Number of installments</Label>
            <Input className="h-9" type="number" min={1} value={numInstallments} onChange={(e) => setNumInstallments(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Grace period (days after due)</Label>
            <Input className="h-9" type="number" min={0} value={gracePeriodDays} onChange={(e) => setGracePeriodDays(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="partial" checked={partialAllowed} onCheckedChange={(c) => setPartialAllowed(!!c)} />
          <Label htmlFor="partial" className="text-xs font-normal cursor-pointer">
            Allow partial payments (carry-forward balance)
          </Label>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Per installment:</span>{" "}
            <strong>{formatINR(per)}</strong>
          </p>
          <p>
            <span className="text-muted-foreground">Next due (initial):</span> <strong>{planStartDate}</strong> (aligned with plan
            start)
          </p>
        </div>
        <Button
          disabled={disabled || loading || !catalogPlanId || !totalPlanAmount || !planEndDate}
          onClick={() =>
            onSubmit({
              catalogPlanId,
              planName: cat?.name ?? "Plan",
              billingCycle,
              totalPlanAmount: Number(totalPlanAmount),
              planStartDate,
              planEndDate,
              numInstallments: Number(numInstallments),
              gracePeriodDays: Number(gracePeriodDays),
              partialAllowed,
            })
          }
        >
          {existingPlan ? "Replace payment plan" : "Assign payment plan"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RecordPaymentForm({
  plan,
  onSubmit,
  loading,
  disabled,
}: {
  plan: CustomerPaymentPlan;
  onSubmit: (body: Record<string, unknown>) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  const [paymentMode, setPaymentMode] = useState<string>("online");
  const [transactionRef, setTransactionRef] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountPaid, setAmountPaid] = useState(String(plan.perInstallmentAmount));
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "confirmed" | "failed">("confirmed");
  const [internalNotes, setInternalNotes] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [balanceCarriedForward, setBalanceCarriedForward] = useState("");
  const [receiptFileRef, setReceiptFileRef] = useState("");

  const needsBank = paymentMode === "bank_transfer" || paymentMode === "cheque";
  const needsCheque = paymentMode === "cheque";
  const isCashOrCheque = paymentMode === "cash" || paymentMode === "cheque";

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Payment method</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Use <strong>Due installment</strong> for on-schedule payments and <strong>Overdue settlement</strong> when
            collecting after the due date. UPI / bank / online follow your usual confirmation rules.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Amount (₹)</Label>
            <Input className="h-9" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment date</Label>
            <Input type="date" className="h-9" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Transaction reference</Label>
            <Input className="h-9" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} />
          </div>
          {needsBank && (
            <div className="space-y-1">
              <Label className="text-xs">Bank name</Label>
              <Input className="h-9" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
          )}
          {needsCheque && (
            <div className="space-y-1">
              <Label className="text-xs">Cheque number</Label>
              <Input className="h-9" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cash / cheque receipt (file name or URL)</Label>
          <Input
            className="h-9"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setReceiptFileRef(f ? `upload:${f.name}` : "");
            }}
          />
        </div>
        {!isCashOrCheque && (
          <div className="space-y-1">
            <Label className="text-xs">Payment status</Label>
            <Select
              value={paymentStatus}
              onValueChange={(v) => setPaymentStatus(v as "pending" | "confirmed" | "failed")}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed (issue receipt now)</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {isCashOrCheque && (
          <p className="text-xs text-muted-foreground">
            Cash and cheque payments stay <strong>pending</strong> until an admin confirms them below.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id="partialPay" checked={isPartial} onCheckedChange={(c) => setIsPartial(!!c)} />
          <Label htmlFor="partialPay" className="text-xs font-normal cursor-pointer">
            Partial payment
          </Label>
        </div>
        {isPartial && (
          <div className="space-y-1">
            <Label className="text-xs">Balance carried forward (₹)</Label>
            <Input
              className="h-9"
              type="number"
              placeholder="0"
              value={balanceCarriedForward}
              onChange={(e) => setBalanceCarriedForward(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Internal notes (admin only)</Label>
          <Textarea className="min-h-[56px]" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
        </div>
        <Button
          disabled={disabled || loading || !amountPaid}
          onClick={() =>
            onSubmit({
              paymentMode,
              transactionRef: transactionRef || null,
              bankName: needsBank ? bankName || null : null,
              chequeNumber: needsCheque ? chequeNumber || null : null,
              receiptFileRef: receiptFileRef || null,
              paymentDate,
              amountPaid: Number(amountPaid),
              paymentStatus: isCashOrCheque ? "pending" : paymentStatus,
              internalNotes: internalNotes || null,
              isPartial,
              balanceCarriedForward: balanceCarriedForward ? Number(balanceCarriedForward) : 0,
            })
          }
        >
          Record payment
        </Button>
      </CardContent>
    </Card>
  );
}
