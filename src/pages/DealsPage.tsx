import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { can, getScope, visibleWithScope } from "@/lib/rbac";
import { canDeleteDeal, canEditDeal, dealStatusOptionsForRole, isDealSuperAdmin } from "@/lib/dealPermissions";
import { apiUrl } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import { useUpdateDealStage } from "@/hooks/useWorkflow";
import {
  DEAL_STATUSES,
  DEAL_STATUS_META,
  DEAL_SOURCES,
  DEAL_PRIORITIES,
  normalizeDealStatus,
  type DealPipelineStatus,
} from "@/lib/dealStatus";
import {
  checkDealFollowUpReminders,
  sendDealInvoiceN8n,
  triggerAutomation,
  type AutomationContext,
} from "@/lib/automationService";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Lock,
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  Calendar,
  Upload,
  FileDown,
  Mail,
  MessageCircle,
  Download,
  FileText,
  ReceiptText,
  CheckCircle2,
  Send,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import type { Deal, Proposal } from "@/types";
import { BulkImportDealsDialog } from "@/components/BulkImportDealsDialog";
import { Topbar } from "@/components/Topbar";
import { DataTablePagination } from "@/components/DataTablePagination";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCreateDealPaymentPlan, useDealPaymentSummary, useRecordPayment } from "@/hooks/usePayments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "@/components/ui/use-toast";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { cn } from "@/lib/utils";
import { generateEstimatePdf, generateEstimatePdfFromData } from "@/lib/generateEstimatePdf";
import { generateInvoicePdfFromData, type InvoiceData } from "@/lib/generateInvoicePdf";
import type { EstimateData } from "@/types/estimate";
import { SendEstimateDialog } from "@/components/SendEstimateDialog";

type DealAuditRow = {
  id: string;
  dealId: string;
  action: string;
  detailJson?: string | null;
  userId: string;
  userName: string;
  at: string;
};

type DealInstallmentRow = {
  id: string;
  plan_id: string;
  deal_id: string;
  customer_id: string;
  installment_number: number;
  label: string;
  due_date: string;
  amount: number;
  percentage: number;
  estimate_number: string | null;
  estimate_generated: number;
  estimate_generated_at: string | null;
  payment_status: "pending" | "paid" | "overdue";
  paid_date: string | null;
  paid_amount: number;
  created_at: string;
  invoice_number: string | null;
  invoice_generated: number;
  invoice_generated_at: string | null;
};

type DealInvoiceDetail = {
  invoiceNumber: string;
  invoiceGeneratedAt: string | null;
  paidDate: string | null;
  paidAmount: number;
  invoiceData: InvoiceData;
};

type DealCreationPlanRow = {
  id: string;
  deal_id: string;
  customer_id: string;
  plan_type_id: string | null;
  plan_slug: string;
  plan_name: string;
  total_amount: number;
  installment_count: number;
  distribution_mode: "even" | "custom_percent" | "advance_then_equal";
  advance_percent: number;
  start_date: string;
  currency: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  installments: DealInstallmentRow[];
};

type DealEstimateDetail = {
  estimateNumber: string;
  customerId: string;
  grandTotal: number;
  createdAt: string;
  updatedAt: string;
  estimateData: EstimateData | null;
};

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const DEFAULT_SALES_STAGES = ["Prospecting", "Qualified", "Proposal", "Negotiation", "Closing"];

const DASHBOARD_STAGES = DEFAULT_SALES_STAGES.slice(0, 3);

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

type StageVisual = { key: string; label: string; pillColor: string; dotColor: string };

const DEAL_STAGE_VISUAL: StageVisual[] = [
  {
    key: "Prospecting",
    label: "Prospecting",
    pillColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    dotColor: "bg-slate-400",
  },
  {
    key: "Qualified",
    label: "Qualified",
    pillColor: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
    dotColor: "bg-blue-500",
  },
  {
    key: "Proposal",
    label: "Proposal",
    pillColor: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
    dotColor: "bg-violet-500",
  },
  {
    key: "Negotiation",
    label: "Negotiation",
    pillColor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    dotColor: "bg-amber-500",
  },
  {
    key: "Closing",
    label: "Closing",
    pillColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dotColor: "bg-emerald-500",
  },
];

function dealStatusLabel(s: string) {
  if (s === "Closed/Lost") return "Lost";
  if (s === "Closed/Won") return "Won";
  return s;
}

function stagePillClass(stage: string) {
  return (
    DEAL_STAGE_VISUAL.find((s) => s.key === stage)?.pillColor ??
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
  );
}

function stageDotClass(stage: string) {
  return DEAL_STAGE_VISUAL.find((s) => s.key === stage)?.dotColor ?? "bg-gray-400";
}

function formatDealListDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatDDMMYYYY(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return "—";
  }
}

function formatINRAmount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return `₹${v.toLocaleString("en-IN")}`;
}

type DealStatusKey = "Active" | "Closed/Won" | "Closed/Lost" | "In Progress" | "Pending";
function normalizeDealStatusKey(s: unknown): DealStatusKey {
  const raw = String(s ?? "").trim();
  if (raw === "Closed/Won") return "Closed/Won";
  if (raw === "Closed/Lost") return "Closed/Lost";
  if (raw.toLowerCase() === "in progress") return "In Progress";
  if (raw.toLowerCase() === "pending") return "Pending";
  return "Active";
}

function dealStatusPillClass(s: DealStatusKey) {
  switch (s) {
    case "Active":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "Closed/Won":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "Closed/Lost":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "In Progress":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "Pending":
    default:
      return "bg-gray-500/15 text-gray-700 dark:text-gray-300";
  }
}

function dealDisplayId(deal: Deal): string {
  const id = String(deal.id ?? "");
  if (/^DEAL-\\d{4}-\\d{4}$/.test(id)) return id;
  const m = /^d(\\d+)$/.exec(id);
  if (m) {
    const seq = String(Number(m[1]) || 0).padStart(4, "0");
    const year = (() => {
      const base = deal.createdAt ?? deal.updatedAt ?? new Date().toISOString();
      try {
        return new Date(base).getFullYear();
      } catch {
        return new Date().getFullYear();
      }
    })();
    return `DEAL-${year}-${seq}`;
  }
  return id || "—";
}

function safeParseJson<T>(raw: unknown): T | null {
  try {
    const s = String(raw ?? "");
    if (!s.trim()) return null;
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

type EstimateJson = {
  billTo?: { placeOfSupply?: string };
  tax?: { subTotal?: number; cgstAmount?: number; sgstAmount?: number; igstAmount?: number; total?: number };
  items?: Array<{ name?: string }>;
};

function deriveDealFinanceFromEstimateOrProposal(deal: Deal, proposal: Proposal | undefined) {
  const est = safeParseJson<EstimateJson>((deal as any).estimateJson);
  const subTotal =
    est?.tax?.subTotal ??
    (deal.amountWithoutTax != null && Number.isFinite(Number(deal.amountWithoutTax)) ? Number(deal.amountWithoutTax) : undefined) ??
    (proposal?.subtotal ?? undefined);
  const taxAmount =
    (est?.tax
      ? Number(est.tax.cgstAmount ?? 0) + Number(est.tax.sgstAmount ?? 0) + Number(est.tax.igstAmount ?? 0)
      : undefined) ??
    (deal.taxAmount != null && Number.isFinite(Number(deal.taxAmount)) ? Number(deal.taxAmount) : undefined) ??
    (proposal?.totalTax ?? undefined);
  const totalAmount =
    est?.tax?.total ??
    (deal.totalAmount != null && Number.isFinite(Number(deal.totalAmount)) ? Number(deal.totalAmount) : undefined) ??
    (proposal ? (proposal.finalQuoteValue ?? proposal.grandTotal) : undefined) ??
    (deal.value ?? undefined);
  const placeOfSupply = est?.billTo?.placeOfSupply ?? (deal.placeOfSupply ?? undefined) ?? undefined;
  const serviceName =
    (deal.serviceName ?? undefined) ??
    est?.items?.find((x) => x?.name)?.name ??
    (proposal?.title ?? undefined) ??
    undefined;
  const amountPaid = deal.amountPaid != null ? Number(deal.amountPaid) : undefined;
  const balanceAmount =
    deal.balanceAmount != null
      ? Number(deal.balanceAmount)
      : totalAmount != null && amountPaid != null
        ? Math.max(0, totalAmount - amountPaid)
        : undefined;
  return { subTotal, taxAmount, totalAmount, placeOfSupply, balanceAmount, amountPaid, serviceName };
}

function formatDueDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isFollowUpOverdue(iso: string | null | undefined) {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  d.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return d < t;
}

function DealStageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[140px] truncate text-xs font-medium px-2 py-0.5 rounded-full",
        stagePillClass(stage),
      )}
      title={stage}
    >
      {stage}
    </span>
  );
}

function DealStageSelector({
  deal,
  options,
  disabled,
  pending,
  onStageChange,
}: {
  deal: Deal;
  options: string[];
  disabled: boolean;
  pending: boolean;
  onStageChange: (deal: Deal, stage: string) => void;
}) {
  return (
    <Select
      value={deal.stage}
      disabled={disabled || pending}
      onValueChange={(v) => onStageChange(deal, v)}
    >
      <SelectTrigger className="h-7 w-[min(148px,100%)] max-w-[148px] px-2 text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function DealsPage() {
  const queryClient = useQueryClient();
  const updateDealStage = useUpdateDealStage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useAppStore((s) => s.me);
  const deals = useAppStore((s) => s.deals);
  const setDeals = useAppStore((s) => s.setDeals);
  const customers = useAppStore((s) => s.customers);
  const proposals = useAppStore((s) => s.proposals);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
  const scope = getScope(me.role, "deals");
  const visibleDeals = visibleWithScope(scope, me, deals);
  const scopedActiveDeals = useMemo(
    () => visibleDeals.filter((d) => !d.deletedAt),
    [visibleDeals],
  );
  const deletedDealsInScope = useMemo(() => {
    if (!isDealSuperAdmin(me.role)) return [];
    return visibleWithScope(scope, me, deals).filter((d) => !!d.deletedAt);
  }, [deals, me, scope]);
  const canCreate = can(me.role, "deals", "create");
  const canUpdateDeal = canEditDeal(me.role);
  const canRemoveDeal = canDeleteDeal(me.role);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DealPipelineStatus>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  // Draft filters (edit, then Apply)
  const [draftSearch, setDraftSearch] = useState("");
  const [draftStageFilter, setDraftStageFilter] = useState("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<"all" | DealPipelineStatus>("all");
  const [draftOwnerFilter, setDraftOwnerFilter] = useState("all");
  const [draftTeamFilter, setDraftTeamFilter] = useState("all");
  const [draftRegionFilter, setDraftRegionFilter] = useState("all");
  const [draftServiceFilter, setDraftServiceFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | "view">("create");
  const [sheetDeal, setSheetDeal] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);
  const [lossTarget, setLossTarget] = useState<Deal | null>(null);
  const [lossReasonDraft, setLossReasonDraft] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [sendEstimateOpen, setSendEstimateOpen] = useState<null | { deal: Deal; channel: "email" | "whatsapp" }>(null);
  /** `${dealId}:deal` or `${dealId}:${installmentId}` while sending invoice webhook */
  const [invoiceSendBusyKey, setInvoiceSendBusyKey] = useState<string | null>(null);

  const [paymentPlanOpen, setPaymentPlanOpen] = useState(false);
  const [paymentPlanType, setPaymentPlanType] = useState<"one_time" | "monthly" | "quarterly" | "custom">("monthly");
  const [paymentPlanStartDate, setPaymentPlanStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [paymentPlanEndDate, setPaymentPlanEndDate] = useState<string>("");
  const [paymentPlanInstallmentsCount, setPaymentPlanInstallmentsCount] = useState<number>(3);
  const [paymentPlanTotal, setPaymentPlanTotal] = useState<string>("");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [customRows, setCustomRows] = useState<Array<{ label: string; due_date: string; amount: string }>>([
    { label: "Installment 1", due_date: new Date().toISOString().slice(0, 10), amount: "" },
  ]);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [stage, setStage] = useState("Qualified");
  const [value, setValue] = useState("");
  const [locked, setLocked] = useState(false);
  const [proposalId, setProposalId] = useState("");
  const [dealStatus, setDealStatus] = useState<DealPipelineStatus>("Active");
  const [dealSource, setDealSource] = useState<string>("Direct");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [remarks, setRemarks] = useState("");

  const dealPaymentsQ = useDealPaymentSummary(sheetOpen && sheetDeal?.id && sheetMode !== "create" ? sheetDeal.id : null);
  const createDealPlanM = useCreateDealPaymentPlan();
  const recordPaymentM = useRecordPayment();

  const dealCreationPlanQ = useQuery({
    queryKey: ["deal-creation-plan", sheetDeal?.id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/deals/${sheetDeal!.id}/payment-plan`));
      if (!res.ok) throw new Error("Failed to load deal payment plan");
      return (await res.json()) as DealCreationPlanRow | null;
    },
    enabled: sheetOpen && !!sheetDeal?.id && sheetMode !== "create",
    staleTime: 10_000,
  });

  const primaryInstallmentWithInvoice = useMemo(() => {
    const rows = dealCreationPlanQ.data?.installments ?? [];
    return rows.find((i) => !!i.invoice_number) ?? null;
  }, [dealCreationPlanQ.data]);

  const canSendInvoiceFromSheetView =
    sheetMode === "view" &&
    !!sheetDeal &&
    (!!sheetDeal.invoiceNumber || !!primaryInstallmentWithInvoice);

  const markInstallmentPaidM = useMutation({
    mutationFn: async (installmentId: string) => {
      const res = await fetch(apiUrl(`/api/deal-installments/${installmentId}/payment`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "paid" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to mark paid");
      }
      return (await res.json()) as DealInstallmentRow;
    },
    onSuccess: async (row) => {
      void dealCreationPlanQ.refetch();
      if (row?.invoice_number) {
        toast({
          title: "Payment recorded",
          description: `Invoice ${row.invoice_number} generated and downloaded.`,
        });
        // Auto-download the freshly generated invoice PDF.
        try {
          const detailRes = await fetch(
            apiUrl(`/api/deal-installments/${row.id}/invoice`),
          );
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as DealInvoiceDetail;
            if (detail.invoiceData) {
              await generateInvoicePdfFromData(detail.invoiceData);
            }
          }
        } catch {
          // Silent: user can re-download from the row's "Invoice" button.
        }
      } else {
        toast({ title: "Installment marked as paid" });
      }
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't update installment",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    },
  });

  const fetchInstallmentEstimate = useCallback(async (estimateNumber: string) => {
    const res = await fetch(apiUrl(`/api/estimates/${encodeURIComponent(estimateNumber)}`));
    if (!res.ok) {
      throw new Error(res.status === 404 ? "Estimate not found" : "Failed to load estimate");
    }
    const detail = (await res.json()) as DealEstimateDetail;
    if (!detail.estimateData) {
      throw new Error("Saved estimate is missing its rendered data");
    }
    return detail;
  }, []);

  const downloadInstallmentEstimate = useCallback(async (estimateNumber: string | null) => {
    if (!estimateNumber) {
      toast({
        title: "Estimate not generated yet",
        description: "Generate the estimate first from the deal-creation flow.",
        variant: "destructive",
      });
      return;
    }
    try {
      const detail = await fetchInstallmentEstimate(estimateNumber);
      await generateEstimatePdfFromData(detail.estimateData!);
    } catch (err) {
      toast({
        title: "Couldn't download estimate",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    }
  }, [fetchInstallmentEstimate]);

  const downloadInstallmentInvoice = useCallback(async (installmentId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/deal-installments/${installmentId}/invoice`));
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load invoice");
      }
      const detail = (await res.json()) as DealInvoiceDetail;
      if (!detail.invoiceData) {
        throw new Error("Invoice data unavailable");
      }
      await generateInvoicePdfFromData(detail.invoiceData);
    } catch (err) {
      toast({
        title: "Couldn't download invoice",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    }
  }, []);

  const buildInvoiceAutomationContext = useCallback(
    (deal: Deal, installment?: DealInstallmentRow | null): AutomationContext => ({
      dealId: deal.id,
      dealTitle: deal.name,
      dealValue: Number(deal.value ?? deal.totalAmount ?? 0),
      customerId: deal.customerId,
      salesRepId: deal.ownerUserId,
      estimateNumber: installment?.estimate_number ?? deal.estimateNumber ?? undefined,
      invoiceNumber: installment?.invoice_number ?? deal.invoiceNumber ?? undefined,
      installmentId: installment?.id,
      installmentLabel: installment?.label,
      dueDate: installment?.due_date ?? undefined,
      amountDue: installment != null ? Number(installment.amount ?? 0) : undefined,
    }),
    [],
  );

  const sendInvoiceFromDealUi = useCallback(
    async (deal: Deal, installment?: DealInstallmentRow | null) => {
      const busyKey = `${deal.id}:${installment?.id ?? "deal"}`;
      const ctx = buildInvoiceAutomationContext(deal, installment ?? null);
      if (!ctx.invoiceNumber?.trim()) {
        toast({
          title: "No invoice yet",
          description: "Generate an invoice (e.g. mark installment paid) before sending.",
          variant: "destructive",
        });
        return;
      }
      setInvoiceSendBusyKey(busyKey);
      try {
        const { ok, error } = await sendDealInvoiceN8n(ctx);
        if (ok) {
          toast({ title: "Invoice sent", description: "buildesk-invoice webhook delivered." });
        } else {
          toast({
            title: "Send invoice failed",
            description: error ?? "Webhook error",
            variant: "destructive",
          });
        }
      } finally {
        setInvoiceSendBusyKey(null);
      }
    },
    [buildInvoiceAutomationContext],
  );

  const sendInstallmentEstimate = useCallback(
    async (estimateNumber: string | null, channel: "email" | "whatsapp") => {
      if (!sheetDeal) return;
      if (!estimateNumber) {
        toast({
          title: "Estimate not generated yet",
          description: "Generate the estimate first from the deal-creation flow.",
          variant: "destructive",
        });
        return;
      }
      try {
        const detail = await fetchInstallmentEstimate(estimateNumber);
        const dealProxy: Deal = {
          ...sheetDeal,
          estimateNumber,
          estimateJson: JSON.stringify(detail.estimateData),
          totalAmount: detail.grandTotal ?? sheetDeal.totalAmount ?? sheetDeal.value,
          value: detail.grandTotal ?? sheetDeal.value,
        };
        setSendEstimateOpen({ deal: dealProxy, channel });
      } catch (err) {
        toast({
          title: "Couldn't load estimate",
          description: err instanceof Error ? err.message : "Try again",
          variant: "destructive",
        });
      }
    },
    [fetchInstallmentEstimate, sheetDeal],
  );

  const statusOptions = useMemo(() => [...dealStatusOptionsForRole(me.role)], [me.role]);

  const eligibleForPaymentPlan = useMemo(() => {
    if (!sheetDeal || sheetMode === "create") return false;
    const s = normalizeDealStatus(sheetDeal.dealStatus);
    return s === "Active" || s === "Closed/Won";
  }, [sheetDeal, sheetMode]);

  const hasLinkedPaymentPlan = (dealPaymentsQ.data?.plans?.length ?? 0) > 0;

  const suggestedPlanTotal = useMemo(() => {
    const base = Number(sheetDeal?.totalAmount ?? sheetDeal?.value ?? 0);
    if (!Number.isFinite(base) || base <= 0) return 0;
    if (!gstApplicable) return base;
    if (sheetDeal?.totalAmount != null) return base;
    return Math.round(base * 1.18 * 100) / 100;
  }, [gstApplicable, sheetDeal?.totalAmount, sheetDeal?.value]);

  useEffect(() => {
    if (!sheetOpen) return;
    if (!sheetDeal) return;
    if (sheetMode === "create") return;
    setPaymentPlanTotal(String(suggestedPlanTotal || ""));
  }, [sheetOpen, sheetDeal?.id, sheetMode, suggestedPlanTotal]);

  const dealsQuery = useQuery({
    queryKey: [...QK.deals({ role: me.role })],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("actorRole", me.role);
      qs.set("actorUserId", me.id);
      qs.set("actorTeamId", me.teamId);
      qs.set("actorRegionId", me.regionId);
      if (me.role === "super_admin") qs.set("includeDeleted", "1");
      const q = `?${qs.toString()}`;
      const res = await fetch(apiUrl(`/api/deals${q}`));
      if (!res.ok) throw new Error("Failed to load deals");
      return (await res.json()) as Deal[];
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const auditQuery = useQuery({
    queryKey: ["deal-audit", sheetDeal?.id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/deals/${sheetDeal!.id}/audit`));
      if (!res.ok) throw new Error("Failed to load audit");
      return res.json() as Promise<DealAuditRow[]>;
    },
    enabled: sheetOpen && !!sheetDeal?.id && sheetMode !== "create",
  });

  useEffect(() => {
    if (!dealsQuery.data) return;
    setDeals(dealsQuery.data);
  }, [dealsQuery.data, setDeals]);

  useEffect(() => {
    checkDealFollowUpReminders(deals);
  }, [deals]);

  useEffect(() => {
    const q = searchParams.get("q");
    const stage = searchParams.get("stage");
    const status = searchParams.get("status") as DealPipelineStatus | null;
    const owner = searchParams.get("owner");
    const team = searchParams.get("team");
    const region = searchParams.get("region");
    if (q) setSearch(q);
    if (stage) setStageFilter(stage);
    if (status && (DEAL_STATUSES as readonly string[]).includes(status)) setStatusFilter(status);
    if (owner) setOwnerFilter(owner);
    if (team) setTeamFilter(team);
    if (region) setRegionFilter(region);
  }, [searchParams]);

  useEffect(() => {
    if (!sheetOpen) return;
    if (sheetMode !== "create" && sheetDeal) {
      setName(sheetDeal.name);
      setCustomerId(sheetDeal.customerId);
      setOwnerUserId(sheetDeal.ownerUserId);
      setStage(sheetDeal.stage);
      setValue(String(sheetDeal.value));
      setLocked(sheetDeal.locked);
      setProposalId(sheetDeal.proposalId ?? "");
      setDealStatus(normalizeDealStatus(sheetDeal.dealStatus));
      setDealSource(sheetDeal.dealSource ?? "Direct");
      setExpectedCloseDate(sheetDeal.expectedCloseDate ?? "");
      setPriority(sheetDeal.priority ?? "Medium");
      setNextFollowUpDate(sheetDeal.nextFollowUpDate ?? "");
      setContactPhone(sheetDeal.contactPhone ?? "");
      setRemarks(sheetDeal.remarks ?? "");
      return;
    }
    if (sheetMode === "create") {
      setName("");
      setCustomerId(customers[0]?.id ?? "");
      setOwnerUserId(users[0]?.id ?? me.id);
      setStage("Qualified");
      setValue("");
      setLocked(false);
      setProposalId("");
      setDealStatus("Active");
      setDealSource("Direct");
      setExpectedCloseDate("");
      setPriority("Medium");
      setNextFollowUpDate("");
      setContactPhone("");
      setRemarks("");
    }
  }, [sheetOpen, sheetMode, sheetDeal?.id, customers, users, me.id]);

  const createMutation = useMutation({
    mutationFn: async (deal: Deal) => {
      const { id: _omitId, ...rest } = deal;
      const res = await fetch(apiUrl("/api/deals"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          locked: deal.locked,
          changedByUserId: me.id,
          changedByName: me.name,
          createdByUserId: me.id,
          createdByName: me.name,
          actorRole: me.role,
          actorUserId: me.id,
          actorTeamId: me.teamId,
          actorRegionId: me.regionId,
        }),
      });
      if (!res.ok) throw new Error("Failed to create deal");
      return (await res.json()) as Deal;
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: async (deal: Deal) => {
      const res = await fetch(apiUrl(`/api/deals/${deal.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...deal,
          locked: deal.locked,
          changedByUserId: me.id,
          changedByName: me.name,
          actorRole: me.role,
          actorUserId: me.id,
          actorTeamId: me.teamId,
          actorRegionId: me.regionId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update deal");
      }
      return (await res.json()) as Deal;
    },
    onSuccess: () => {
      dealsQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["deal-audit"] });
    },
  });

  const patchDealApi = useCallback(
    async (current: Deal, patch: Partial<Deal>) => {
      const next: Deal = {
        ...current,
        ...patch,
        lossReason:
          patch.dealStatus === "Closed/Lost"
            ? patch.lossReason ?? current.lossReason
            : patch.dealStatus !== undefined && patch.dealStatus !== "Closed/Lost"
              ? null
              : current.lossReason,
      };
      const res = await fetch(apiUrl(`/api/deals/${current.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...next,
          locked: next.locked,
          changedByUserId: me.id,
          changedByName: me.name,
          actorRole: me.role,
          actorUserId: me.id,
          actorTeamId: me.teamId,
          actorRegionId: me.regionId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      return (await res.json()) as Deal;
    },
    [me.id, me.name],
  );

  const patchDealMutation = useMutation({
    mutationFn: async ({
      deal,
      patch,
      prevStatus,
    }: {
      deal: Deal;
      patch: Partial<Deal>;
      prevStatus: DealPipelineStatus;
    }) => {
      return patchDealApi(deal, patch);
    },
    onSuccess: async (data, vars) => {
      await dealsQuery.refetch();
      const nextS = normalizeDealStatus(data.dealStatus);
      const prevS = vars.prevStatus;
      const rep = users.find((u) => u.id === data.ownerUserId);
      if (nextS === "Closed/Won" && prevS !== "Closed/Won") {
        const customer = customers.find((c) => c.id === data.customerId);
        const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
        await triggerAutomation("deal_won", {
          dealId: data.id,
          dealTitle: data.name,
          dealValue: data.value,
          customerId: data.customerId,
          customerName: customer?.customerName,
          customerPhone: primary?.phone,
          customerEmail: primary?.email,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
        });
        toast({ title: "Deal won", description: "Team notification sent (if templates are active)." });
      }
      if (nextS === "Closed/Lost" && prevS !== "Closed/Lost") {
        const customer = customers.find((c) => c.id === data.customerId);
        await triggerAutomation("deal_lost", {
          dealId: data.id,
          dealTitle: data.name,
          dealValue: data.value,
          customerId: data.customerId,
          customerName: customer?.customerName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          lossReason: data.lossReason ?? "",
          companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
        });
      }
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/deals/${id}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorRole: me.role,
          actorUserId: me.id,
          actorTeamId: me.teamId,
          actorRegionId: me.regionId,
          deletedByUserId: me.id,
          deletedByName: me.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete deal");
      }
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const statusCounts = useMemo(() => {
    const c = {} as Record<DealPipelineStatus, number>;
    DEAL_STATUSES.forEach((s) => {
      c[s] = 0;
    });
    scopedActiveDeals.forEach((d) => {
      c[normalizeDealStatus(d.dealStatus)]++;
    });
    return c;
  }, [scopedActiveDeals]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedActiveDeals.filter((d) => {
      if (q) {
        const customerName = customers.find((c) => c.id === d.customerId)?.customerName ?? "";
        const inv = String(d.invoiceNumber ?? "").toLowerCase();
        const svc = String(d.serviceName ?? "").toLowerCase();
        if (
          !d.id.toLowerCase().includes(q) &&
          !d.name.toLowerCase().includes(q) &&
          !customerName.toLowerCase().includes(q) &&
          !inv.includes(q) &&
          !svc.includes(q)
        ) {
          return false;
        }
      }
      if (stageFilter !== "all" && d.stage !== stageFilter) return false;
      if (statusFilter !== "all" && normalizeDealStatus(d.dealStatus) !== statusFilter) return false;
      if (ownerFilter !== "all" && d.ownerUserId !== ownerFilter) return false;
      if (teamFilter !== "all" && d.teamId !== teamFilter) return false;
      if (regionFilter !== "all" && d.regionId !== regionFilter) return false;
      if (serviceFilter !== "all" && String(d.serviceName ?? "").trim() !== serviceFilter) return false;
      return true;
    });
  }, [scopedActiveDeals, search, stageFilter, statusFilter, ownerFilter, teamFilter, regionFilter, serviceFilter, customers]);

  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("ui:deals:pageSize");
      const n = raw ? Number(raw) : 20;
      return PAGE_SIZE_OPTIONS.includes(n as any) ? n : 20;
    } catch {
      return 20;
    }
  });
  useEffect(() => {
    setListPage(1);
  }, [search, stageFilter, statusFilter, ownerFilter, teamFilter, regionFilter, serviceFilter]);

  const listTotalPages = Math.max(1, Math.ceil(visible.length / listPageSize));
  const listCurrentPage = Math.min(listPage, listTotalPages);
  const listItems = useMemo(() => {
    const start = (listCurrentPage - 1) * listPageSize;
    return visible.slice(start, start + listPageSize);
  }, [visible, listCurrentPage, listPageSize]);

  useEffect(() => {
    try {
      localStorage.setItem("ui:deals:pageSize", String(listPageSize));
    } catch {
      // ignore
    }
  }, [listPageSize]);

  const topHScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomHScrollRef = useRef<HTMLDivElement | null>(null);
  const [listScrollWidth, setListScrollWidth] = useState(1320);
  const syncingHScrollRef = useRef<"top" | "bottom" | null>(null);

  useEffect(() => {
    const bottom = bottomHScrollRef.current;
    if (!bottom) return;
    const update = () => setListScrollWidth(bottom.scrollWidth || 1320);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(bottom);
    return () => ro.disconnect();
  }, []);

  const syncListHScroll = (from: "top" | "bottom") => {
    const top = topHScrollRef.current;
    const bottom = bottomHScrollRef.current;
    if (!top || !bottom) return;
    if (syncingHScrollRef.current && syncingHScrollRef.current !== from) return;
    syncingHScrollRef.current = from;
    const left = from === "top" ? top.scrollLeft : bottom.scrollLeft;
    if (from === "top") bottom.scrollLeft = left;
    else top.scrollLeft = left;
    window.setTimeout(() => {
      if (syncingHScrollRef.current === from) syncingHScrollRef.current = null;
    }, 0);
  };

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    scopedActiveDeals.forEach((d) => {
      const s = String(d.serviceName ?? "").trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scopedActiveDeals]);

  const totalValue = visible.reduce((s, d) => s + d.value, 0);

  const allStages = useMemo(() => {
    const set = new Set(scopedActiveDeals.map((d) => d.stage));
    return Array.from(set);
  }, [scopedActiveDeals]);

  const stageSelectOptions = useMemo(() => {
    return Array.from(new Set([...DEFAULT_SALES_STAGES, ...allStages]));
  }, [allStages]);

  const activeDealsCount = useMemo(
    () =>
      visible.filter((d) => {
        const s = normalizeDealStatus(d.dealStatus);
        return s !== "Closed/Won" && s !== "Closed/Lost";
      }).length,
    [visible],
  );

  const wonValueThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    return visible.reduce((sum, d) => {
      if (normalizeDealStatus(d.dealStatus) !== "Closed/Won") return sum;
      const t = d.updatedAt || d.createdAt;
      if (!t) return sum;
      const dt = new Date(t);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo) return sum;
      return sum + d.value;
    }, 0);
  }, [visible]);

  const wonPct = totalValue > 0 ? Math.min((wonValueThisMonth / totalValue) * 100, 100) : 0;

  const stageCounts = useMemo(() => {
    const o: Record<string, number> = {};
    visible.forEach((d) => {
      o[d.stage] = (o[d.stage] ?? 0) + 1;
    });
    return o;
  }, [visible]);

  const stageValues = useMemo(() => {
    const o: Record<string, number> = {};
    visible.forEach((d) => {
      o[d.stage] = (o[d.stage] ?? 0) + d.value;
    });
    return o;
  }, [visible]);

  const setStatusFilterAndUrl = (s: "all" | DealPipelineStatus) => {
    setStatusFilter(s);
    const next = new URLSearchParams(searchParams);
    if (s === "all") next.delete("status");
    else next.set("status", s);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setDraftSearch(search);
    setDraftStageFilter(stageFilter);
    setDraftStatusFilter(statusFilter);
    setDraftOwnerFilter(ownerFilter);
    setDraftTeamFilter(teamFilter);
    setDraftRegionFilter(regionFilter);
    setDraftServiceFilter(serviceFilter);
  }, [search, stageFilter, statusFilter, ownerFilter, teamFilter, regionFilter, serviceFilter]);

  const hasPendingFilterChanges =
    draftSearch !== search ||
    draftStageFilter !== stageFilter ||
    draftStatusFilter !== statusFilter ||
    draftOwnerFilter !== ownerFilter ||
    draftTeamFilter !== teamFilter ||
    draftRegionFilter !== regionFilter ||
    draftServiceFilter !== serviceFilter;

  const applyFilters = () => {
    setSearch(draftSearch);
    setStageFilter(draftStageFilter);
    setStatusFilterAndUrl(draftStatusFilter);
    setOwnerFilter(draftOwnerFilter);
    setTeamFilter(draftTeamFilter);
    setRegionFilter(draftRegionFilter);
    setServiceFilter(draftServiceFilter);
  };

  const clearFilters = () => {
    setDraftSearch("");
    setDraftStageFilter("all");
    setDraftStatusFilter("all");
    setDraftOwnerFilter("all");
    setDraftTeamFilter("all");
    setDraftRegionFilter("all");
    setDraftServiceFilter("all");
    setSearch("");
    setStageFilter("all");
    setStatusFilterAndUrl("all");
    setOwnerFilter("all");
    setTeamFilter("all");
    setRegionFilter("all");
    setServiceFilter("all");
  };

  const openPaymentPlanDialog = useCallback(() => {
    if (!sheetDeal?.id) return;
    setPaymentPlanStartDate(new Date().toISOString().slice(0, 10));
    setPaymentPlanEndDate("");
    setPaymentPlanInstallmentsCount(3);
    setPaymentPlanType("monthly");
    setCustomRows([{ label: "Installment 1", due_date: new Date().toISOString().slice(0, 10), amount: "" }]);
    setPaymentPlanOpen(true);
  }, [sheetDeal?.id]);

  const createPaymentPlan = useCallback(async () => {
    if (!sheetDeal?.id) return;
    const total = Number(paymentPlanTotal || suggestedPlanTotal || 0);
    if (!Number.isFinite(total) || total <= 0) {
      toast({ title: "Invalid total", description: "Total amount must be > 0", variant: "destructive" });
      return;
    }
    if (!paymentPlanStartDate) {
      toast({ title: "Start date required", variant: "destructive" });
      return;
    }
    const schedule =
      paymentPlanType === "custom"
        ? customRows
            .map((r, idx) => ({
              label: (r.label || `Installment ${idx + 1}`).trim(),
              due_date: r.due_date,
              amount: Number(r.amount || 0),
            }))
            .filter((r) => Number.isFinite(r.amount) && r.amount > 0)
        : undefined;

    try {
      await createDealPlanM.mutateAsync({
        dealId: sheetDeal.id,
        planType: paymentPlanType,
        totalAmount: total,
        startDate: paymentPlanStartDate,
        endDate: paymentPlanEndDate || null,
        installmentsCount: paymentPlanInstallmentsCount,
        schedule,
        gstApplicable,
        userId: me.id,
        userName: me.name,
      });
      toast({ title: "Payment plan created", description: "Installments generated for this deal." });
      setPaymentPlanOpen(false);
    } catch (e) {
      toast({ title: "Failed to create plan", description: (e as Error).message, variant: "destructive" });
    }
  }, [
    createDealPlanM,
    customRows,
    gstApplicable,
    me.id,
    me.name,
    paymentPlanEndDate,
    paymentPlanInstallmentsCount,
    paymentPlanStartDate,
    paymentPlanTotal,
    paymentPlanType,
    sheetDeal?.id,
    suggestedPlanTotal,
  ]);

  const markInstallmentPaid = useCallback(
    async (installmentId: string, amount: number) => {
      try {
        await recordPaymentM.mutateAsync({
          installmentId,
          paidAmount: amount,
          paidDate: new Date().toISOString().slice(0, 10),
          paymentMode: "other",
          transactionReference: null,
          notes: "Marked paid from Deals",
          userId: me.id,
          userName: me.name,
        });
        toast({ title: "Marked as paid" });
        queryClient.invalidateQueries({ queryKey: ["payments"] });
        if (sheetDeal?.id) queryClient.invalidateQueries({ queryKey: ["payments", "deal", sheetDeal.id] });
      } catch (e) {
        toast({ title: "Payment update failed", description: (e as Error).message, variant: "destructive" });
      }
    },
    [me.id, me.name, queryClient, recordPaymentM, sheetDeal?.id],
  );

  const handleSaveDeal = async () => {
    if (sheetMode === "view") return;
    const owner = users.find((u) => u.id === ownerUserId);
    const parsedValue = Number(value);
    if (!name.trim() || !customerId || !ownerUserId || !Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast({ title: "Missing fields", description: "Fill required fields correctly.", variant: "destructive" });
      return;
    }
    if (!priority.trim()) {
      toast({ title: "Priority required", variant: "destructive" });
      return;
    }
    if (dealStatus === "Closed/Lost" && !lossReasonDraft.trim() && !sheetDeal?.lossReason) {
      toast({ title: "Loss reason required", description: "Enter a loss reason for Closed/Lost.", variant: "destructive" });
      return;
    }
    const base = {
      name: name.trim(),
      customerId,
      ownerUserId,
      teamId: owner?.teamId ?? me.teamId,
      regionId: owner?.regionId ?? me.regionId,
      stage,
      value: parsedValue,
      locked,
      proposalId: proposalId.trim() ? proposalId.trim() : null,
      dealStatus,
      dealSource: dealSource || null,
      expectedCloseDate: expectedCloseDate.trim() || null,
      priority,
      nextFollowUpDate: nextFollowUpDate.trim() || null,
      contactPhone: contactPhone.trim() || null,
      remarks: remarks.trim() || null,
      lossReason:
        dealStatus === "Closed/Lost"
          ? (lossReasonDraft.trim() || sheetDeal?.lossReason || "").trim() || null
          : null,
    };

    if (sheetMode === "edit" && sheetDeal) {
      try {
        const prev = normalizeDealStatus(sheetDeal.dealStatus);
        const payload: Deal = { ...sheetDeal, ...base };
        const saved = await updateMutation.mutateAsync(payload);
        const rep = users.find((u) => u.id === saved.ownerUserId);
        if (normalizeDealStatus(saved.dealStatus) === "Closed/Won" && prev !== "Closed/Won") {
          const customer = customers.find((c) => c.id === saved.customerId);
          const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
          await triggerAutomation("deal_won", {
            dealId: saved.id,
            dealTitle: saved.name,
            dealValue: saved.value,
            customerId: saved.customerId,
            customerName: customer?.customerName,
            customerPhone: primary?.phone,
            customerEmail: primary?.email,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
            companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
          });
          toast({ title: "Deal updated", description: "Won notification sent (if templates are active)." });
        } else if (normalizeDealStatus(saved.dealStatus) === "Closed/Lost" && prev !== "Closed/Lost") {
          await triggerAutomation("deal_lost", {
            dealId: saved.id,
            dealTitle: saved.name,
            dealValue: saved.value,
            customerId: saved.customerId,
            customerName: customer?.customerName,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
            lossReason: saved.lossReason ?? "",
            companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
          });
          toast({ title: "Deal updated", description: "Loss recorded and automation sent (if configured)." });
        } else {
          toast({ title: "Deal updated", description: `${base.name} updated successfully.` });
        }

        const savedStatus = normalizeDealStatus(saved.dealStatus);
        if (savedStatus === "Active" || savedStatus === "Closed/Won") {
          try {
            const res = await fetch(apiUrl(`/api/payments/deal/${saved.id}/summary-v2`));
            const js = res.ok ? await res.json() : null;
            if (js && Array.isArray(js.plans) && js.plans.length === 0) {
              setSheetDeal(saved);
              setSheetMode("view");
              setSheetOpen(true);
              setPaymentPlanOpen(true);
              return;
            }
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
      }
    } else if (sheetMode === "create") {
      try {
        const temp: Deal = {
          id: "pending",
          ...base,
        };
        const saved = await createMutation.mutateAsync(temp);
        const customer = customers.find((c) => c.id === saved.customerId);
        const rep = users.find((u) => u.id === saved.ownerUserId);
        await triggerAutomation("deal_created", {
          dealId: saved.id,
          dealTitle: saved.name,
          dealValue: saved.value,
          customerId: saved.customerId,
          customerName: customer?.customerName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
        });
        toast({ title: "Deal created", description: `${saved.name} (${saved.id})` });

        const savedStatus = normalizeDealStatus(saved.dealStatus);
        if (savedStatus === "Active" || savedStatus === "Closed/Won") {
          setSheetDeal(saved);
          setSheetMode("view");
          setSheetOpen(true);
          setPaymentPlanOpen(true);
          return;
        }
      } catch (e) {
        toast({ title: "Create failed", description: (e as Error).message, variant: "destructive" });
      }
    }
    setSheetOpen(false);
    setSheetDeal(null);
    setLossReasonDraft("");
  };

  const handleDeleteDeal = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Deal archived", description: `${deleteTarget.name} was soft-deleted (Super Admin can view in Deleted records).` });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const onInlineStatusChange = (d: Deal, value: string) => {
    if (!canUpdateDeal || d.locked || d.deletedAt) return;
    const next = value as DealPipelineStatus;
    const prev = normalizeDealStatus(d.dealStatus);
    if (next === "Closed/Lost") {
      setLossTarget(d);
      setLossReasonDraft("");
      return;
    }
    patchDealMutation.mutate({ deal: d, patch: { dealStatus: next }, prevStatus: prev });
  };

  const submitLossReason = () => {
    if (!lossTarget) return;
    if (!lossReasonDraft.trim()) {
      toast({ title: "Required", description: "Enter a loss reason.", variant: "destructive" });
      return;
    }
    const prev = normalizeDealStatus(lossTarget.dealStatus);
    patchDealMutation.mutate(
      {
        deal: lossTarget,
        patch: { dealStatus: "Closed/Lost", lossReason: lossReasonDraft.trim() },
        prevStatus: prev,
      },
      {
        onSettled: () => {
          setLossTarget(null);
          setLossReasonDraft("");
        },
      },
    );
  };

  const openDeal = (d: Deal) => {
    setSheetDeal(d);
    setSheetMode("view");
    setSheetOpen(true);
  };

  return (
    <>
      <Topbar
        title="Deals"
        subtitle={`${visible.length} deals shown`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
              <Button
                type="button"
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                className="h-8 px-3 text-xs"
                onClick={() => setViewMode("kanban")}
              >
                Board
              </Button>
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                className="h-8 px-3 text-xs"
                onClick={() => setViewMode("list")}
              >
                List
              </Button>
            </div>
            {canCreate && (
              <>
                <Button type="button" variant="outline" className="h-9" onClick={() => setBulkImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Bulk import
                </Button>
                <Button
                  type="button"
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    setSheetDeal(null);
                    setSheetMode("create");
                    setSheetOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Deal
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="space-y-4">

        {dealsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading deals...</p>}

        <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12 lg:items-center">
              <div className="relative min-w-0 lg:col-span-4">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                  placeholder="Search deal, customer..."
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-span-8 lg:grid-cols-6">
                <Select value={draftStageFilter} onValueChange={setDraftStageFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {allStages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draftStatusFilter} onValueChange={(v) => setDraftStatusFilter(v as "all" | DealPipelineStatus)}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="Deal status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {DEAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {dealStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draftOwnerFilter} onValueChange={setDraftOwnerFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draftTeamFilter} onValueChange={setDraftTeamFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="All teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draftRegionFilter} onValueChange={setDraftRegionFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
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

                <Select value={draftServiceFilter} onValueChange={setDraftServiceFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="All services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All services</SelectItem>
                    {serviceOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1 pt-1 sm:flex-1">
                <button
                  type="button"
                  onClick={() => setStatusFilterAndUrl("all")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    statusFilter === "all"
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                      : "border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-600 dark:text-gray-400",
                  )}
                >
                  All
                </button>
                {DEAL_STATUSES.map((st) => {
                  const meta = DEAL_STATUS_META[st];
                  const active = statusFilter === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilterAndUrl(active ? "all" : st)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? cn("ring-2 ring-blue-500", meta.cardClass)
                          : "border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-600 dark:text-gray-400",
                      )}
                    >
                      {dealStatusLabel(st)} ({statusCounts[st]})
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2 sm:shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-[140px]"
                  onClick={clearFilters}
                  disabled={!hasPendingFilterChanges}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  className="h-9 w-[140px] bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={applyFilters}
                  disabled={!hasPendingFilterChanges}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Deal dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="col-span-2 lg:col-span-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow-sm">
            <p className="text-xs font-medium text-blue-100 mb-3 uppercase tracking-wide">Total deal value</p>
            <p className="text-3xl font-bold tracking-tight mb-1 tabular-nums">
              ₹{totalValue.toLocaleString("en-IN")}
            </p>
            <p className="text-sm text-blue-100">{activeDealsCount} active deals</p>
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-blue-100">
                <span>Won this month</span>
                <span className="tabular-nums">₹{wonValueThisMonth.toLocaleString("en-IN")}</span>
              </div>
              <div className="h-1.5 bg-blue-500/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${wonPct}%` }}
                />
              </div>
            </div>
          </div>

          {DASHBOARD_STAGES.map((stageKey) => {
            const sv = DEAL_STAGE_VISUAL.find((s) => s.key === stageKey);
            return (
              <div
                key={stageKey}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3 gap-2">
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full truncate max-w-[7rem]", sv?.pillColor ?? stagePillClass(stageKey))}>
                    {sv?.label ?? stageKey}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                    {stageCounts[stageKey] ?? 0}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  ₹{(stageValues[stageKey] ?? 0).toLocaleString("en-IN")}
                </p>
              </div>
            );
          })}
        </div>

        {/* Kanban */}
        {viewMode === "kanban" && (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 min-w-max">
              {stageSelectOptions.map((stage) => (
                <div key={stage} className="w-72 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", stageDotClass(stage))} />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{stage}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full shrink-0 tabular-nums">
                        {visible.filter((d) => d.stage === stage).length}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                      ₹{(stageValues[stage] ?? 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {visible
                      .filter((d) => d.stage === stage)
                      .map((deal) => {
                        const custObj = customers.find((c) => c.id === deal.customerId);
                        const comp = custObj?.companyName || custObj?.customerName || "—";
                        const cust = custObj?.customerName || custObj?.companyName || "—";
                        const ownerName = users.find((u) => u.id === deal.ownerUserId)?.name ?? "";
                        return (
                          <div
                            key={deal.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openDeal(deal)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openDeal(deal);
                              }
                            }}
                            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-150 text-left w-full"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2.5">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 flex-1">
                                {deal.name}
                              </p>
                              <span className="text-xs font-bold text-blue-600 whitespace-nowrap flex-shrink-0 tabular-nums">
                                ₹{(deal.value ?? 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-0.5 line-clamp-1">{comp}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 line-clamp-1">{cust}</p>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                                    {ownerName?.[0] ?? "?"}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400 truncate">{ownerName?.split(" ")[0] ?? "—"}</span>
                              </div>
                              {deal.nextFollowUpDate && (
                                <span
                                  className={cn(
                                    "text-xs flex items-center gap-1 shrink-0",
                                    isFollowUpOverdue(deal.nextFollowUpDate) ? "text-red-500 font-medium" : "text-gray-400",
                                  )}
                                >
                                  <Calendar className="h-3 w-3" />
                                  {formatDealListDate(deal.nextFollowUpDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            {/* Top horizontal scrollbar (synced with table) */}
            <div
              ref={topHScrollRef}
              className="overflow-x-scroll"
              style={{ scrollbarGutter: "stable" }}
              onScroll={() => syncListHScroll("top")}
            >
              <div style={{ width: listScrollWidth, height: 1 }} />
            </div>

            <div
              ref={bottomHScrollRef}
              className="overflow-x-scroll pb-2"
              style={{ scrollbarGutter: "stable" }}
              onScroll={() => syncListHScroll("bottom")}
            >
              <table className="w-full min-w-[1320px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                    {[
                      "Status",
                      "Invoice Date",
                      "Invoice#",
                      "Customer Name",
                      "Total",
                      "Tax Amount",
                      "Amount Without Tax",
                      "Place of Supply",
                      "Balance",
                      "Amount Paid",
                      "Service",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className={cn(
                          "px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide",
                          (h === "Customer Name" || h === "Invoice#" || h === "Place of Supply" || h === "Service") && "text-left",
                          (h === "Total" ||
                            h === "Tax Amount" ||
                            h === "Amount Without Tax" ||
                            h === "Balance" ||
                            h === "Amount Paid") &&
                            "text-right",
                          // Keep columns visible; use horizontal scroll instead of hiding.
                          (h === "Invoice Date" ||
                            h === "Invoice#" ||
                            h === "Total" ||
                            h === "Tax Amount" ||
                            h === "Amount Without Tax" ||
                            h === "Balance" ||
                            h === "Amount Paid") &&
                            "whitespace-nowrap",
                          h === "Service" && "min-w-[180px]",
                          h === "Actions" && "text-center pr-5 min-w-[170px] whitespace-nowrap",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {listItems.map((deal) => {
                    const custObj = customers.find((c) => c.id === deal.customerId);
                    const comp = custObj?.companyName || custObj?.customerName || "—";
                    const cust = custObj?.customerName || custObj?.companyName || "—";
                    return (
                      <tr
                        key={deal.id}
                        className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors duration-100"
                      >
                        <td className="px-4 py-3.5 pl-5 text-sm font-medium">
                          {(() => {
                            const st = normalizeDealStatusKey(deal.dealStatus);
                            return (
                              <Badge variant="secondary" className={cn("whitespace-nowrap", dealStatusPillClass(st))}>
                                {st}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-sm tabular-nums">
                          {(() => {
                            const d = deal.invoiceDate ?? (deal as any).estimateDate ?? deal.createdAt ?? deal.updatedAt ?? null;
                            return formatDDMMYYYY(d);
                          })()}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openDeal(deal)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 text-left"
                            title={deal.id}
                          >
                            {deal.invoiceNumber ?? dealDisplayId(deal)}
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          {customers.find((c) => c.id === deal.customerId) ? (
                            <button
                              type="button"
                              className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 text-left"
                              onClick={() => navigate(`/customers/${deal.customerId}`)}
                            >
                              <div className="leading-tight">
                                <div className="text-sm font-medium">{comp}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{cust}</div>
                              </div>
                            </button>
                          ) : (
                            <div className="leading-tight">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{comp}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{cust}</div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return formatINRAmount(d.totalAmount ?? deal.value);
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return formatINRAmount(d.taxAmount);
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return formatINRAmount(d.subTotal);
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-sm">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return d.placeOfSupply ?? "—";
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return formatINRAmount(d.balanceAmount);
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return formatINRAmount(d.amountPaid);
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-sm min-w-[180px]">
                          {(() => {
                            const p = deal.proposalId ? proposals.find((x) => x.id === deal.proposalId) : undefined;
                            const d = deriveDealFinanceFromEstimateOrProposal(deal, p);
                            return d.serviceName ?? "—";
                          })()}
                        </td>
                        <td className="px-4 py-3.5 pr-5 min-w-[170px]">
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            {deal.locked && (
                              <span title="Locked" className="text-emerald-600">
                                <Lock className="h-3.5 w-3.5" />
                              </span>
                            )}

                            <DealStageSelector
                              deal={deal}
                              options={stageSelectOptions}
                              disabled={!canUpdateDeal || !!deal.locked}
                              pending={updateDealStage.isPending}
                              onStageChange={(d, st) =>
                                updateDealStage.mutate({
                                  dealId: d.id,
                                  stage: st,
                                  prevDealStatus: normalizeDealStatus(d.dealStatus),
                                })
                              }
                            />

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
                                <DropdownMenuItem className="cursor-pointer" onClick={() => openDeal(deal)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View
                                </DropdownMenuItem>

                                {deal.estimateNumber && deal.estimateJson && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => void generateEstimatePdf(deal)}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    Download Estimate PDF
                                  </DropdownMenuItem>
                                )}

                                {deal.estimateNumber && deal.estimateJson && (
                                  <>
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onClick={() => setSendEstimateOpen({ deal, channel: "email" })}
                                    >
                                      <Mail className="mr-2 h-4 w-4" />
                                      Send via Email
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onClick={() => setSendEstimateOpen({ deal, channel: "whatsapp" })}
                                    >
                                      <MessageCircle className="mr-2 h-4 w-4" />
                                      Send via WhatsApp
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {deal.invoiceNumber && (
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    disabled={invoiceSendBusyKey === `${deal.id}:deal`}
                                    onClick={() => void sendInvoiceFromDealUi(deal, null)}
                                  >
                                    <Receipt className="mr-2 h-4 w-4" />
                                    Send invoice
                                  </DropdownMenuItem>
                                )}

                                {(canUpdateDeal || canRemoveDeal) && <DropdownMenuSeparator />}

                                {canUpdateDeal && !deal.locked && (
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={() => {
                                      setSheetDeal(deal);
                                      setSheetMode("edit");
                                      setSheetOpen(true);
                                    }}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                )}

                                {canRemoveDeal && !deal.locked && (
                                  <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={() => setDeleteTarget(deal)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Archive
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        No deals match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-end gap-2 px-5 py-3">
                <span className="text-xs text-muted-foreground">Rows</span>
                <Select
                  value={String(listPageSize)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    setListPageSize(n);
                    setListPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[96px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DataTablePagination
                className="border-t-0 px-5 py-0 dark:border-gray-800"
                page={listCurrentPage}
                totalPages={listTotalPages}
                total={visible.length}
                perPage={listPageSize}
                onPageChange={setListPage}
              />
            </div>
          </div>
        )}

        <Card className="bg-card border border-border">
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Deal status</strong> controls reminders and win/loss messages.
              Changing to <strong>Closed/Won</strong> notifies the team (deal_won templates).{" "}
              <strong>Closed/Lost</strong> requires a loss reason and fires deal_lost templates.
            </p>
            <p>
              <strong className="text-foreground">Follow-up:</strong> Set “Next follow-up” to trigger{" "}
              <strong>deal_follow_up</strong> automation 1 day before and on that date. New deals fire{" "}
              <strong>deal_created</strong> for the assignee.               <strong>Send invoice</strong> posts once to n8n{" "}
              <code className="text-[10px]">buildesk-invoice</code> (deal + PDF + recipient/subject/body from your active{" "}
              <strong>deal_invoice_sent</strong> email template). In-app / WhatsApp / rules still run; no second webhook.
            </p>
            <p>
              <strong className="text-foreground">Roles:</strong> Super Admin can edit, archive (soft delete), and set{" "}
              <strong>Closed/Lost</strong>. Other roles can create and view.
            </p>
          </CardContent>
        </Card>

        {deletedDealsInScope.length > 0 && (
          <Card className="bg-card border border-destructive/30">
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Deleted records (soft-deleted)</h3>
                <p className="text-xs text-muted-foreground mt-1">Visible to Super Admin only. Rows stay in the database for audit.</p>
              </div>
              <div className="p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Deal ID</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Deleted at</TableHead>
                      <TableHead className="text-xs">By</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedDealsInScope.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.id}</TableCell>
                        <TableCell className="text-sm">{d.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatShortDate(d.deletedAt)}</TableCell>
                        <TableCell className="text-xs">{d.deletedByName ?? "—"}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setSheetDeal(d);
                              setSheetMode("view");
                              setSheetOpen(true);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) setSheetDeal(null);
          setSheetOpen(o);
        }}
      >
        <SheetContent
          side="right"
          className={cn(
            sheetContentDetail,
            "max-h-[100dvh] sm:w-[640px] sm:max-w-[640px] md:w-[860px] md:max-w-[860px] lg:w-[1080px] lg:max-w-[1080px] xl:w-[1200px] xl:max-w-[1200px]",
          )}
        >
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "view" ? "Deal details" : sheetMode === "edit" ? "Edit deal" : "New deal"}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 max-h-[calc(100vh-8rem)] pr-3">
            <div className="space-y-4 pb-4">
              {sheetDeal && (sheetMode === "view" || sheetMode === "edit") && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <p>
                    <span className="text-muted-foreground">Deal ID:</span>{" "}
                    <span className="font-mono font-medium">{sheetDeal.id}</span>
                  </p>
                  {sheetDeal.createdAt && (
                    <p>
                      <span className="text-muted-foreground">Created:</span> {formatShortDate(sheetDeal.createdAt)} by{" "}
                      {sheetDeal.createdByName ?? sheetDeal.createdByUserId ?? "—"}
                    </p>
                  )}
                  {sheetDeal.updatedAt && (
                    <p>
                      <span className="text-muted-foreground">Last updated:</span> {formatShortDate(sheetDeal.updatedAt)}
                    </p>
                  )}
                  {sheetDeal.deletedAt && (
                    <p className="text-destructive">
                      Archived {formatShortDate(sheetDeal.deletedAt)}
                      {sheetDeal.deletedByName ? ` by ${sheetDeal.deletedByName}` : ""}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Deal title *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Deal title"
                  disabled={sheetMode === "view"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select value={customerId} onValueChange={setCustomerId} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned to *</Label>
                  <Select value={ownerUserId} onValueChange={setOwnerUserId} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Sales stage *</Label>
                  <Input
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    placeholder="Qualified"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deal status *</Label>
                  <Select
                    value={dealStatus}
                    onValueChange={(v) => setDealStatus(v as DealPipelineStatus)}
                    disabled={sheetMode === "view"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Deal source</Label>
                  <Select value={dealSource} onValueChange={setDealSource} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority *</Label>
                  <Select value={priority} onValueChange={setPriority} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expected close date</Label>
                  <Datepicker
                    select="single"
                    touchUi={false}
                    inputComponent="input"
                    inputProps={{
                      placeholder: "Select…",
                      className: "h-9 rounded-lg text-sm",
                      disabled: sheetMode === "view",
                    }}
                    value={ymdToDate(expectedCloseDate)}
                    onChange={(ev) => setExpectedCloseDate(ev.value ? dateToYmd(ev.value) : "")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next follow-up date</Label>
                  <Datepicker
                    select="single"
                    touchUi={false}
                    inputComponent="input"
                    inputProps={{
                      placeholder: "Select…",
                      className: "h-9 rounded-lg text-sm",
                      disabled: sheetMode === "view",
                    }}
                    value={ymdToDate(nextFollowUpDate)}
                    onChange={(ev) => setNextFollowUpDate(ev.value ? dateToYmd(ev.value) : "")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deal value (₹) *</Label>
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact number</Label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91…"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Remarks / notes</Label>
                  {sheetMode === "view" && !isDealSuperAdmin(me.role) ? (
                    <p className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
                      Internal remarks are visible to Super Admin only.
                    </p>
                  ) : (
                    <Textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Internal notes…"
                      className="min-h-[72px]"
                      disabled={sheetMode === "view"}
                    />
                  )}
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Proposal ID (optional)</Label>
                  <Input
                    value={proposalId}
                    onChange={(e) => setProposalId(e.target.value)}
                    placeholder="p1234"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Lock deal</Label>
                  <Select
                    value={locked ? "locked" : "open"}
                    onValueChange={(v) => setLocked(v === "locked")}
                    disabled={sheetMode === "view"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dealStatus === "Closed/Lost" && sheetMode !== "view" && (
                  <div className="space-y-2 col-span-2">
                    <Label>Loss reason *</Label>
                    <Textarea
                      value={lossReasonDraft || sheetDeal?.lossReason || ""}
                      onChange={(e) => setLossReasonDraft(e.target.value)}
                      placeholder="Why was this deal lost?"
                      className="min-h-[72px]"
                    />
                  </div>
                )}
                {dealStatus === "Closed/Lost" && sheetMode === "view" && sheetDeal?.lossReason && (
                  <div className="space-y-2 col-span-2">
                    <Label>Loss reason</Label>
                    <p className="text-sm border rounded-md p-3 bg-muted/20">{sheetDeal.lossReason}</p>
                  </div>
                )}
              </div>

              {eligibleForPaymentPlan && sheetDeal?.id && sheetMode !== "create" && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Payment plan</p>
                      <p className="text-xs text-muted-foreground">Auto-generate installments and track payments.</p>
                    </div>
                    <Button size="sm" className="h-8" onClick={openPaymentPlanDialog} disabled={sheetMode === "edit"}>
                      + Create Payment Plan
                    </Button>
                  </div>

                  {dealPaymentsQ.isLoading && <p className="text-xs text-muted-foreground">Loading payment plan…</p>}
                  {!dealPaymentsQ.isLoading && !hasLinkedPaymentPlan && (
                    <p className="text-xs text-muted-foreground">No payment plan linked to this deal yet.</p>
                  )}

                  {(dealPaymentsQ.data?.plans ?? []).slice(0, 1).map((p) => (
                    <div key={p.id} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">{p.status}</Badge>
                        <span className="text-muted-foreground">Total:</span>{" "}
                        <span className="font-medium">{formatINRAmount(p.total_amount)}</span>
                        <span className="text-muted-foreground">Paid:</span>{" "}
                        <span className="font-medium">{formatINRAmount(p.paid_amount)}</span>
                        <span className="text-muted-foreground">Remaining:</span>{" "}
                        <span className="font-medium">{formatINRAmount(p.remaining_amount)}</span>
                      </div>

                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-[56px]">#</TableHead>
                              <TableHead className="text-xs">Due date</TableHead>
                              <TableHead className="text-xs text-right">Amount</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(p.installments ?? []).map((i, idx) => (
                              <TableRow key={i.id}>
                                <TableCell className="text-xs tabular-nums">{idx + 1}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">{formatDueDate(i.due_date)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{formatINRAmount(i.amount)}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant="outline">{i.status}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {i.status === "pending" || i.status === "partial" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => markInstallmentPaid(i.id, Number(i.amount ?? 0))}
                                      disabled={recordPaymentM.isPending}
                                    >
                                      Mark as paid
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {sheetDeal?.id && sheetMode !== "create" && (
                <div className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <ReceiptText className="h-4 w-4 text-muted-foreground" /> Deal payment plan &amp; estimates
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Installments and per-installment estimate PDFs created at deal-creation time.
                      </p>
                    </div>
                  </div>

                  {dealCreationPlanQ.isLoading && (
                    <p className="text-xs text-muted-foreground">Loading deal payment plan…</p>
                  )}

                  {!dealCreationPlanQ.isLoading && !dealCreationPlanQ.data && (
                    <p className="text-xs text-muted-foreground">
                      No deal-creation payment plan yet. Use the Convert-to-Deal flow on a proposal to set one up.
                    </p>
                  )}

                  {dealCreationPlanQ.data && (() => {
                    const plan = dealCreationPlanQ.data;
                    const totalPaid = (plan.installments ?? []).reduce(
                      (acc, i) => acc + (i.payment_status === "paid" ? Number(i.paid_amount || 0) : 0),
                      0,
                    );
                    const totalGenerated = (plan.installments ?? []).filter(
                      (i) => i.estimate_generated === 1 && i.estimate_number,
                    ).length;
                    const remaining = Math.max(0, Number(plan.total_amount || 0) - totalPaid);

                    // "Payments due soon" = pending/overdue installments whose due date is
                    // within the next 15 days (or already overdue).
                    const todayMs = new Date().setHours(0, 0, 0, 0);
                    const dueSoon = (plan.installments ?? [])
                      .filter((i) => i.payment_status !== "paid")
                      .map((i) => {
                        const due = new Date(
                          i.due_date.includes("T") ? i.due_date : `${i.due_date}T00:00:00`,
                        ).setHours(0, 0, 0, 0);
                        const days = Math.round((due - todayMs) / 86_400_000);
                        return { i, days };
                      })
                      .filter(({ days }) => days <= 15)
                      .sort((a, b) => a.days - b.days);

                    return (
                      <div className="space-y-3">
                        {dueSoon.length > 0 && (
                          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                            <div className="mb-2 flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Payments due soon ({dueSoon.length})
                            </div>
                            <ul className="space-y-1.5">
                              {dueSoon.map(({ i, days }) => {
                                const overdueDays = days < 0 ? -days : 0;
                                return (
                                  <li
                                    key={i.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/20"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className="text-[10px]">
                                        #{i.installment_number}
                                      </Badge>
                                      <span className="font-medium">{i.label}</span>
                                      <span className="text-muted-foreground">
                                        {formatDDMMYYYY(i.due_date)}
                                      </span>
                                      <span className="font-medium tabular-nums">
                                        {formatINRAmount(i.amount)}
                                      </span>
                                      {days < 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="border-red-300 bg-red-50 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                                        >
                                          Overdue {overdueDays}d
                                        </Badge>
                                      ) : days === 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="border-orange-300 bg-orange-50 text-[10px] text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                                        >
                                          Due today
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">
                                          {days}d left
                                        </Badge>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      disabled={markInstallmentPaidM.isPending}
                                      onClick={() => markInstallmentPaidM.mutate(i.id)}
                                    >
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      Mark paid
                                    </Button>
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              On marking paid, the invoice is auto-generated and downloaded.
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div className="rounded border border-border p-2">
                            <div className="text-muted-foreground">Plan</div>
                            <div className="font-medium">{plan.plan_name}</div>
                          </div>
                          <div className="rounded border border-border p-2">
                            <div className="text-muted-foreground">Total</div>
                            <div className="font-medium tabular-nums">{formatINRAmount(plan.total_amount)}</div>
                          </div>
                          <div className="rounded border border-border p-2">
                            <div className="text-muted-foreground">Paid</div>
                            <div className="font-medium tabular-nums">{formatINRAmount(totalPaid)}</div>
                          </div>
                          <div className="rounded border border-border p-2">
                            <div className="text-muted-foreground">Remaining</div>
                            <div className="font-medium tabular-nums">{formatINRAmount(remaining)}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">
                            {plan.installment_count} installments
                          </Badge>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {plan.distribution_mode.replace(/_/g, " ")}
                          </Badge>
                          {plan.distribution_mode === "advance_then_equal" && (
                            <Badge variant="outline" className="text-[10px]">
                              Advance {Number(plan.advance_percent || 0)}%
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            Start {formatDDMMYYYY(plan.start_date)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <FileText className="mr-1 h-3 w-3" />
                            {totalGenerated}/{plan.installments?.length ?? 0} estimates
                          </Badge>
                          {plan.notes && (
                            <span className="ml-1 italic">{plan.notes}</span>
                          )}
                        </div>

                        <div className="rounded-md border border-border overflow-x-auto">
                          <Table className="min-w-[860px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-[40px]">#</TableHead>
                                <TableHead className="text-xs">Installment</TableHead>
                                <TableHead className="text-xs whitespace-nowrap">Due</TableHead>
                                <TableHead className="text-xs text-right">Amount</TableHead>
                                <TableHead className="text-xs text-right">%</TableHead>
                                <TableHead className="text-xs">Estimate</TableHead>
                                <TableHead className="text-xs">Payment</TableHead>
                                <TableHead className="text-xs text-right whitespace-nowrap">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(plan.installments ?? []).map((i) => {
                                const isPaid = i.payment_status === "paid";
                                const isOverdue = i.payment_status === "overdue";
                                const hasEstimate = !!i.estimate_number && i.estimate_generated === 1;
                                return (
                                  <TableRow key={i.id}>
                                    <TableCell className="text-xs tabular-nums">
                                      {i.installment_number}
                                    </TableCell>
                                    <TableCell className="text-xs">{i.label}</TableCell>
                                    <TableCell className="text-xs whitespace-nowrap">
                                      {formatDDMMYYYY(i.due_date)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">
                                      {formatINRAmount(i.amount)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">
                                      {Number(i.percentage || 0).toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {hasEstimate ? (
                                        <span className="font-mono text-[11px]">{i.estimate_number}</span>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">
                                          Not generated
                                        </Badge>
                                      )}
                                      {!!i.invoice_number && (
                                        <div className="mt-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                                          {i.invoice_number}
                                        </div>
                                      )}
                                      {hasEstimate && i.estimate_generated_at && (
                                        <div className="text-[10px] text-muted-foreground">
                                          {formatShortDate(i.estimate_generated_at)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-[10px] capitalize",
                                          isPaid &&
                                            "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                                          isOverdue &&
                                            "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
                                        )}
                                      >
                                        {i.payment_status}
                                      </Badge>
                                      {isPaid && i.paid_date && (
                                        <div className="text-[10px] text-muted-foreground">
                                          {formatDDMMYYYY(i.paid_date)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-[11px]"
                                          disabled={!hasEstimate}
                                          onClick={() => downloadInstallmentEstimate(i.estimate_number)}
                                          title={
                                            hasEstimate
                                              ? "Download estimate PDF"
                                              : "Estimate not generated yet"
                                          }
                                        >
                                          <Download className="mr-1 h-3 w-3" />
                                          PDF
                                        </Button>
                                        {!!i.invoice_number && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 px-2 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                              onClick={() => downloadInstallmentInvoice(i.id)}
                                              title={`Download invoice ${i.invoice_number}`}
                                            >
                                              <Receipt className="mr-1 h-3 w-3" />
                                              Invoice
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 px-2 text-[11px]"
                                              disabled={
                                                !sheetDeal ||
                                                invoiceSendBusyKey === `${sheetDeal.id}:${i.id}`
                                              }
                                              title="Send invoice to n8n (buildesk-invoice)"
                                              onClick={() => sheetDeal && void sendInvoiceFromDealUi(sheetDeal, i)}
                                            >
                                              <Send className="mr-1 h-3 w-3" />
                                              Send inv.
                                            </Button>
                                          </>
                                        )}
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 px-2 text-[11px]"
                                              disabled={!hasEstimate}
                                              title={
                                                hasEstimate
                                                  ? "Send estimate to customer"
                                                  : "Estimate not generated yet"
                                              }
                                            >
                                              <Send className="mr-1 h-3 w-3" />
                                              Send
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="min-w-[180px]">
                                            <DropdownMenuItem
                                              className="cursor-pointer"
                                              onClick={() =>
                                                sendInstallmentEstimate(i.estimate_number, "email")
                                              }
                                            >
                                              <Mail className="mr-2 h-3.5 w-3.5" />
                                              Send via Email
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              className="cursor-pointer"
                                              onClick={() =>
                                                sendInstallmentEstimate(
                                                  i.estimate_number,
                                                  "whatsapp",
                                                )
                                              }
                                            >
                                              <MessageCircle className="mr-2 h-3.5 w-3.5" />
                                              Send via WhatsApp
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                        {!isPaid ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-[11px]"
                                            disabled={markInstallmentPaidM.isPending}
                                            onClick={() => markInstallmentPaidM.mutate(i.id)}
                                          >
                                            <CheckCircle2 className="mr-1 h-3 w-3" />
                                            Paid
                                          </Button>
                                        ) : (
                                          <span className="text-[10px] text-muted-foreground">—</span>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {(plan.installments?.length ?? 0) === 0 && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-xs text-muted-foreground">
                                    No installments configured.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {sheetDeal?.id && sheetMode !== "create" && (
                <div className="border rounded-md p-3 space-y-2">
                  <p className="text-xs font-semibold">Activity log</p>
                  {auditQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                  <ul className="space-y-2 max-h-52 overflow-y-auto text-xs">
                    {(auditQuery.data ?? []).map((a) => (
                      <li key={a.id} className="border-b border-border/60 pb-2">
                        <span className="text-muted-foreground">{formatShortDate(a.at)}</span> —{" "}
                        <span className="font-medium">{a.userName}</span>{" "}
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {a.action.replace(/^deal_/, "").replace(/_/g, " ")}
                        </Badge>
                        <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all opacity-80">
                          {a.detailJson}
                        </pre>
                      </li>
                    ))}
                    {(auditQuery.data?.length ?? 0) === 0 && !auditQuery.isLoading && (
                      <li className="text-muted-foreground">No activity yet.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
          <SheetFooter className="mt-4 gap-2 sm:gap-0">
            {sheetMode === "view" ? (
              <>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  Close
                </Button>
                {canSendInvoiceFromSheetView && sheetDeal && !sheetDeal.deletedAt && (
                  <Button
                    variant="secondary"
                    disabled={
                      !!invoiceSendBusyKey &&
                      invoiceSendBusyKey.startsWith(`${sheetDeal.id}:`)
                    }
                    onClick={() => {
                      const inst =
                        !sheetDeal.invoiceNumber && primaryInstallmentWithInvoice
                          ? primaryInstallmentWithInvoice
                          : null;
                      void sendInvoiceFromDealUi(sheetDeal, inst);
                    }}
                  >
                    <Receipt className="mr-2 h-4 w-4" />
                    Send invoice
                  </Button>
                )}
                {canUpdateDeal && sheetDeal && !sheetDeal.locked && !sheetDeal.deletedAt && (
                  <Button
                    onClick={() => {
                      setSheetMode("edit");
                    }}
                  >
                    Edit
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDeal} disabled={!!sheetDeal?.deletedAt}>
                  {sheetMode === "edit" ? "Save changes" : "Create deal"}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={paymentPlanOpen} onOpenChange={setPaymentPlanOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create payment plan</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Deal</Label>
              <Input value={sheetDeal?.name ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Input value={customers.find((c) => c.id === sheetDeal?.customerId)?.companyName ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Total deal value</Label>
              <Input
                value={paymentPlanTotal}
                onChange={(e) => setPaymentPlanTotal(e.target.value)}
                placeholder={String(suggestedPlanTotal || "")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Plan type</Label>
              <Select value={paymentPlanType} onValueChange={(v) => setPaymentPlanType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One time payment</SelectItem>
                  <SelectItem value="monthly">Monthly installments</SelectItem>
                  <SelectItem value="quarterly">Quarterly installments</SelectItem>
                  <SelectItem value="custom">Custom schedule</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Datepicker
                select="single"
                touchUi={false}
                inputComponent="input"
                inputProps={{ placeholder: "Select…", className: "h-9" }}
                value={ymdToDate(paymentPlanStartDate)}
                onChange={(ev) => setPaymentPlanStartDate(ev.value ? dateToYmd(ev.value) : "")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End date (optional)</Label>
              <Datepicker
                select="single"
                touchUi={false}
                inputComponent="input"
                inputProps={{ placeholder: "Optional…", className: "h-9" }}
                value={ymdToDate(paymentPlanEndDate)}
                onChange={(ev) => setPaymentPlanEndDate(ev.value ? dateToYmd(ev.value) : "")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Number of installments</Label>
              <Input
                type="number"
                value={paymentPlanInstallmentsCount}
                onChange={(e) => setPaymentPlanInstallmentsCount(Math.max(1, Number(e.target.value || 1)))}
                disabled={paymentPlanType === "one_time" || paymentPlanType === "custom"}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={gstApplicable} onCheckedChange={(v) => setGstApplicable(Boolean(v))} />
              <span className="text-sm">GST applicable</span>
            </div>
          </div>

          {paymentPlanType === "custom" && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Installment schedule</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() =>
                    setCustomRows((r) => [
                      ...r,
                      { label: `Installment ${r.length + 1}`, due_date: paymentPlanStartDate, amount: "" },
                    ])
                  }
                >
                  Add row
                </Button>
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-[56px]">#</TableHead>
                      <TableHead className="text-xs">Due date</TableHead>
                      <TableHead className="text-xs">Label</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customRows.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs tabular-nums">{idx + 1}</TableCell>
                        <TableCell>
                          <Datepicker
                            select="single"
                            touchUi={false}
                            inputComponent="input"
                            inputProps={{ placeholder: "Due", className: "h-8 min-w-[140px] text-xs" }}
                            value={ymdToDate(r.due_date)}
                            onChange={(ev) =>
                              setCustomRows((rows) =>
                                rows.map((x, i) => (i === idx ? { ...x, due_date: ev.value ? dateToYmd(ev.value) : "" } : x)),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={r.label}
                            onChange={(e) =>
                              setCustomRows((rows) => rows.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            className="text-right"
                            value={r.amount}
                            onChange={(e) =>
                              setCustomRows((rows) => rows.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">Custom schedule total must exactly match the plan total.</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentPlanOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPaymentPlan} disabled={createDealPlanM.isPending || !sheetDeal?.id}>
              Create plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!lossTarget} onOpenChange={(open) => !open && setLossTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Loss reason required</AlertDialogTitle>
            <AlertDialogDescription>
              Marking <strong>{lossTarget?.name}</strong> as Closed/Lost requires a reason for the audit trail and
              automation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={lossReasonDraft}
            onChange={(e) => setLossReasonDraft(e.target.value)}
            placeholder="e.g. Budget frozen, chose competitor, timing…"
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLossTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitLossReason}>Save as Closed/Lost</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete <strong>{deleteTarget?.name}</strong> (record kept for audit). Only Super Admin can
              see it under Deleted records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDeleteDeal}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkImportDealsDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        existingDeals={scopedActiveDeals}
        onImported={async () => {
          await queryClient.invalidateQueries({ queryKey: [...QK.deals({ role: me.role })] });
          await dealsQuery.refetch();
        }}
      />

      {sendEstimateOpen && (
        <SendEstimateDialog
          open={!!sendEstimateOpen}
          onClose={() => setSendEstimateOpen(null)}
          deal={sendEstimateOpen.deal}
          channel={sendEstimateOpen.channel}
          defaultCustomerName={customers.find((c) => c.id === sendEstimateOpen.deal.customerId)?.companyName}
          defaultEmail={
            customers
              .find((c) => c.id === sendEstimateOpen.deal.customerId)
              ?.contacts?.find((ct) => ct.isPrimary)?.email ??
            customers.find((c) => c.id === sendEstimateOpen.deal.customerId)?.contacts?.[0]?.email
          }
          defaultPhone={
            customers
              .find((c) => c.id === sendEstimateOpen.deal.customerId)
              ?.contacts?.find((ct) => ct.isPrimary)?.phone ??
            customers.find((c) => c.id === sendEstimateOpen.deal.customerId)?.contacts?.[0]?.phone
          }
        />
      )}
    </>
  );
}
