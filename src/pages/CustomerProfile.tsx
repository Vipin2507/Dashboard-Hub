import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import {
  CustomerProposalsLiveTable,
  CustomerDealsLiveTable,
  CustomerPaymentsLiveSection,
  CustomerActivityLiveFeed,
} from "@/components/customer-profile/CustomerLiveSections";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { Topbar } from "@/components/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Building2,
  Pencil,
  Plus,
  Phone,
  Trash2,
  MapPin,
  ExternalLink,
  FileText,
  AlertTriangle,
  Upload,
  MessageSquare,
  Activity,
  Ticket,
  IndianRupee,
  CreditCard,
  Package,
  ArrowLeft,
  Check,
  CalendarClock,
  AlertCircle,
  Bot,
} from "lucide-react";
import type { Customer, CustomerStatus, Proposal } from "@/types";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ProposalDetailSheet } from "@/components/ProposalDetailSheet";
import { generateProposalPdf } from "@/lib/generateProposalPdf";
import { toast } from "@/components/ui/use-toast";
import { useCustomerPaymentSummary } from "@/hooks/usePayments";
import { triggerAutomation } from "@/lib/automationService";
import { getCustomerBrief } from "@/lib/aiMemoryService";

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  inactive: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  lead: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  churned: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  blacklisted: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const TICKET_PRIORITY_BADGE: Record<string, string> = {
  low: "bg-muted",
  medium: "bg-blue-500/15 text-blue-700",
  high: "bg-orange-500/15 text-orange-700",
  critical: "bg-red-500/15 text-red-700",
};

const TICKET_STATUS_BADGE: Record<string, string> = {
  open: "bg-yellow-500/15 text-yellow-700",
  in_progress: "bg-blue-500/15 text-blue-700",
  resolved: "bg-green-500/15 text-green-700",
  closed: "bg-muted",
};

const INVOICE_STATUS_BADGE: Record<string, string> = {
  paid: "bg-green-500/15 text-green-700",
  unpaid: "bg-yellow-500/15 text-yellow-700",
  overdue: "bg-red-500/15 text-red-700",
  cancelled: "bg-muted",
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const PROFILE_TABS: {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "transactions", label: "Transaction History", icon: CreditCard },
  { key: "productline", label: "Product Line", icon: Package },
  { key: "support_workflow", label: "Support Workflow", icon: CalendarClock },
  { key: "notes", label: "Notes & Attachments", icon: MessageSquare },
  { key: "tickets", label: "Support Tickets", icon: Ticket },
  { key: "activity", label: "Activity Log", icon: Activity },
];

const WORKFLOW_STAGES: Array<{ key: "deal_won" | "onboarding" | "active" | "renewal_due" | "renewed" | "churned"; label: string }> = [
  { key: "deal_won", label: "Deal Won" },
  { key: "onboarding", label: "Onboarding" },
  { key: "active", label: "Active" },
  { key: "renewal_due", label: "Renewal Due" },
  { key: "renewed", label: "Renewed" },
  { key: "churned", label: "Churned" },
];

function isCompletedStage(stageKey: string, current: string) {
  const order = WORKFLOW_STAGES.map((s) => s.key);
  const si = order.indexOf(stageKey as any);
  const ci = order.indexOf(current as any);
  if (si === -1 || ci === -1) return false;
  return si < ci;
}

function getWorkflowStage(args: {
  wonDeal: { createdAt?: string | null; dealStatus?: string | null } | null;
  hasPaymentPlan: boolean;
  daysToRenewal: number | null;
}) {
  const { wonDeal, hasPaymentPlan, daysToRenewal } = args;
  if (!wonDeal) return "deal_won" as const;
  if (String(wonDeal.dealStatus ?? "").toLowerCase().includes("lost")) return "churned" as const;
  if (!hasPaymentPlan) return "onboarding" as const;
  if (daysToRenewal != null && daysToRenewal <= 90) return "renewal_due" as const;
  return "active" as const;
}

function SupportWorkflowTab({
  customer,
  customerId,
  primaryPhone,
  primaryEmail,
  activeDeal,
  assignedToName,
  onGoPayments,
  onNewTicket,
  onGoTickets,
}: {
  customer: Customer;
  customerId: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  activeDeal: { id: string; name: string; ownerUserId: string; dealStatus?: string | null; createdAt?: string | null } | null;
  assignedToName: string;
  onGoPayments: () => void;
  onNewTicket: () => void;
  onGoTickets: () => void;
}) {
  const { data: paymentSummary } = useCustomerPaymentSummary(customerId);
  const addProposal = useAppStore((s) => s.addProposal);
  const me = useAppStore((s) => s.me);

  const wonDateIso = activeDeal?.createdAt ?? null;
  const renewalDate = useMemo(() => {
    if (!wonDateIso) return null;
    const d = new Date(wonDateIso);
    if (Number.isNaN(d.getTime())) return null;
    const r = new Date(d);
    r.setFullYear(r.getFullYear() + 1);
    return r;
  }, [wonDateIso]);

  const daysToRenewal = useMemo(() => {
    if (!renewalDate) return null;
    return Math.ceil((renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }, [renewalDate]);

  const stage = getWorkflowStage({
    wonDeal: activeDeal,
    hasPaymentPlan: (paymentSummary?.plans?.length ?? 0) > 0,
    daysToRenewal,
  });

  const total = (paymentSummary?.summary?.totalPaid ?? 0) + (paymentSummary?.summary?.totalPending ?? 0);
  const pct = total > 0 ? Math.min(100, (Number(paymentSummary?.summary?.totalPaid ?? 0) / total) * 100) : 0;

  const sendPaymentReminder = async () => {
    await triggerAutomation("invoice_overdue", {
      customerId,
      customerName: customer.customerName,
      customerPhone: primaryPhone ?? undefined,
      customerEmail: primaryEmail ?? undefined,
      amountDue: paymentSummary?.summary?.overdueAmount ?? 0,
      daysOverdue: 1,
      companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
    });
    toast({ title: "Reminder triggered", description: "Automation trigger fired for overdue reminder." });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Customer Journey</h3>
        <div className="flex items-center gap-0 overflow-x-auto">
          {WORKFLOW_STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0",
                    stage === s.key
                      ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950"
                      : isCompletedStage(s.key, stage)
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400",
                  )}
                >
                  {isCompletedStage(s.key, stage) ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <p
                  className={cn(
                    "text-xs mt-1.5 text-center whitespace-nowrap",
                    stage === s.key ? "text-blue-600 font-medium" : "text-gray-400",
                  )}
                >
                  {s.label}
                </p>
              </div>
              {i < WORKFLOW_STAGES.length - 1 && (
                <div
                  className={cn(
                    "w-10 h-0.5 mx-2 mb-5",
                    isCompletedStage(WORKFLOW_STAGES[i + 1].key, stage)
                      ? "bg-emerald-400"
                      : "bg-gray-200 dark:bg-gray-700",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {paymentSummary && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment Status</h3>
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs rounded-lg" onClick={onGoPayments}>
              View Details
            </Button>
          </div>

          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Collected</span>
              <span>
                ₹{Number(paymentSummary.summary.totalPaid ?? 0).toLocaleString("en-IN")} / ₹{Number(total).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {paymentSummary.summary.overdueCount > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">
                {paymentSummary.summary.overdueCount} overdue installments — ₹{Number(paymentSummary.summary.overdueAmount ?? 0).toLocaleString("en-IN")}
              </p>
              <Button
                size="sm"
                className="ml-auto h-6 px-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md flex-shrink-0"
                onClick={sendPaymentReminder}
              >
                Send Reminder
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Support Tickets</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs rounded-lg" onClick={onGoTickets}>
              View All
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs rounded-lg" onClick={onNewTicket}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Ticket
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Open: {customer.supportTickets.filter((t) => t.status === "open").length} · In Progress:{" "}
          {customer.supportTickets.filter((t) => t.status === "in_progress").length} · Resolved:{" "}
          {customer.supportTickets.filter((t) => t.status === "resolved").length}
        </p>
      </div>

      {renewalDate && (
        <div
          className={cn(
            "rounded-xl p-4 border",
            daysToRenewal != null && daysToRenewal <= 30
              ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
              : daysToRenewal != null && daysToRenewal <= 60
                ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
                : "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Renewal Due: {renewalDate.toLocaleDateString("en-IN")}
                </p>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {daysToRenewal != null && daysToRenewal > 0 ? `${daysToRenewal} days remaining` : "Renewal overdue"}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs rounded-lg"
              onClick={() => {
                if (!activeDeal) {
                  toast({ title: "No won deal", variant: "destructive" });
                  return;
                }
                const id = "p-renew-" + makeId();
                const year = new Date().getFullYear();
                const proposalNumber = `PROP-${year}-${String(Date.now()).slice(-4)}`;
                const lineItems = customer.productLines.map((pl) => {
                  const qty = Number(pl.qty ?? 1) || 1;
                  const unitPrice = Number(pl.unitPrice ?? 0) || 0;
                  const discount = 0;
                  const taxRate = Number(pl.taxRate ?? 0) || 0;
                  const lineTotal = qty * unitPrice - discount;
                  const taxAmount = (lineTotal * taxRate) / 100;
                  return {
                    id: "pli-" + makeId(),
                    inventoryItemId: pl.inventoryItemId,
                    name: pl.itemName,
                    sku: pl.sku ?? "",
                    description: undefined,
                    qty,
                    unitPrice,
                    taxRate,
                    discount,
                    lineTotal,
                    taxAmount,
                  };
                });
                const subtotal = lineItems.reduce((s, li) => s + li.lineTotal, 0);
                const totalTax = lineItems.reduce((s, li) => s + li.taxAmount, 0);
                const grandTotal = subtotal + totalTax;
                addProposal({
                  id,
                  proposalNumber,
                  title: `Renewal — ${customer.companyName || customer.customerName}`,
                  customerId: customer.id,
                  customerName: customer.customerName ?? "",
                  customerCompanyName: (customer.companyName ?? "").trim() || undefined,
                  assignedTo: activeDeal.ownerUserId ?? me.id,
                  assignedToName,
                  regionId: me.regionId,
                  teamId: me.teamId,
                  status: "draft",
                  validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                  lineItems,
                  setupDeploymentCharges: 0,
                  subtotal,
                  totalDiscount: 0,
                  totalTax,
                  grandTotal,
                  versionHistory: [],
                  currentVersion: 1,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: me.id,
                  dealId: activeDeal.id,
                });
                toast({ title: "Renewal proposal created", description: proposalNumber });
              }}
            >
              Create Renewal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const proposals = useAppStore((s) => s.proposals);
  const deals = useAppStore((s) => s.deals);
  const users = useAppStore((s) => s.users);
  const scope = getScope(me.role, "customers");
  const visibleCustomers = visibleWithScope(scope, me, customers);
  const customer = id ? (visibleCustomers.find((c) => c.id === id) ?? null) : null;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [proposalDetailId, setProposalDetailId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addTicketOpen, setAddTicketOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [addProductLineOpen, setAddProductLineOpen] = useState(false);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefLines, setBriefLines] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [productLineFilter, setProductLineFilter] = useState<string>("all");

  const canUpdate = can(me.role, "customers", "update");
  const canDelete = can(me.role, "customers", "delete");
  const canManageTickets = can(me.role, "customers", "manage_tickets");
  const canUpdateCustomer = customer && (scope === "ALL" || customer.assignedTo === me.id);

  const { data: liveProposals = [] } = useQuery({
    queryKey: QK.customerProposals(customer?.id ?? ""),
    queryFn: () => api.get<Proposal[]>(`/proposals?customerId=${encodeURIComponent(customer!.id)}`),
    enabled: !!customer?.id,
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const openTicketsCount = customer?.supportTickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length ?? 0;

  if (!customer) {
    return (
      <>
        <Topbar title="Customer" subtitle="Not found or you don't have access" />
        <div className="mx-auto w-full max-w-page space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Customer not found or you don&apos;t have access.</p>
          <Button variant="outline" onClick={() => navigate("/customers")}>
            Back to Customers
          </Button>
        </div>
      </>
    );
  }

  const primaryContact = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
  const assignedUser = users.find((u) => u.id === customer.assignedTo);
  const detailProposal = proposalDetailId
    ? liveProposals.find((p) => p.id === proposalDetailId) ?? proposals.find((p) => p.id === proposalDetailId)
    : null;

  const addressLines = [
    customer.address?.line1,
    customer.address?.line2,
    [customer.address?.city, customer.address?.state, customer.address?.pincode]
      .filter(Boolean)
      .join(", "),
    customer.address?.country,
  ].filter(Boolean);

  const productLineOptions = customer.productLines
    .map((pl) => ({ id: pl.inventoryItemId, name: pl.itemName }))
    .filter((x) => x.id && x.name);

  const uniqueProductLineOptions = Array.from(
    new Map(productLineOptions.map((o) => [o.id, o])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredProductLines =
    productLineFilter === "all"
      ? customer.productLines
      : customer.productLines.filter((pl) => pl.inventoryItemId === productLineFilter);

  const dealIdAllowlist =
    productLineFilter === "all"
      ? null
      : new Set(
          filteredProductLines
            .map((pl) => pl.dealId)
            .filter((x): x is string => !!x && String(x).trim() !== ""),
        );

  const dealScope = getScope(me.role, "deals");
  const visibleDeals = visibleWithScope(dealScope, me, deals);
  const customerDeals = visibleDeals.filter((d) => d.customerId === customer.id && !d.deletedAt);
  const wonDeal =
    customerDeals.find((d) => d.dealStatus === "Closed/Won") ??
    customerDeals.find((d) => String(d.stage || "").toLowerCase() === "won") ??
    null;

  useEffect(() => {
    const key = `AIBriefSeen:v1:${me.id}:${customer.id}`;
    let seen = false;
    try {
      seen = localStorage.getItem(key) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    void (async () => {
      const brief = await getCustomerBrief({
        customerId: customer.id,
        wonDeal: wonDeal ? { id: wonDeal.id, name: wonDeal.name } : null,
      }).catch(() => null);
      if (!brief) return;
      const lines: string[] = [];
      if (brief.lastInteraction) {
        lines.push(
          `Last: ${new Date(brief.lastInteraction.at).toLocaleString("en-IN")} — ${brief.lastInteraction.summary}`,
        );
      }
      if (brief.delivery?.status) lines.push(`Delivery: ${brief.delivery.dealTitle} — ${brief.delivery.status}`);
      if (brief.payments) {
        lines.push(
          `Payments: collected ₹${brief.payments.collected.toLocaleString("en-IN")}, pending ₹${brief.payments.pending.toLocaleString("en-IN")}`,
        );
        if (brief.payments.overdueCount > 0) {
          lines.push(
            `Overdue: ${brief.payments.overdueCount} installments (₹${brief.payments.overdueAmount.toLocaleString("en-IN")})`,
          );
        }
      }
      brief.nextSteps.forEach((s) => lines.push(`Next: ${s}`));
      brief.risks.forEach((s) => lines.push(`Risk: ${s}`));
      setBriefLines(lines);
      setBriefOpen(true);
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    })();
  }, [customer.id, me.id, wonDeal]);

  return (
    <>
      <Topbar
        title={customer.companyName || customer.customerName}
        subtitle={customer.customerNumber}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => navigate("/customers")}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4 shrink-0" />
              Customers
            </Button>
            <Button
              className="h-9 shrink-0 px-4 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => navigate("/proposals", { state: { customerId: customer.id } })}
            >
              <Plus className="mr-1.5 h-4 w-4 shrink-0" />
              Create Proposal
            </Button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-page space-y-4">
        <div className="flex flex-col gap-5 lg:flex-row">
          <aside className="w-full flex-shrink-0 space-y-4 lg:w-72 lg:sticky lg:top-4 lg:self-start">
            {/* Identity */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950">
                  <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                    STATUS_PILL[customer.status] ?? STATUS_PILL.inactive,
                  )}
                >
                  {customer.status}
                </span>
              </div>
              <h2 className="mb-0.5 text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">
                {customer.companyName || customer.customerName}
              </h2>
              <p className="font-mono text-xs text-gray-400">{customer.customerNumber}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {customer.customerName || customer.companyName}
              </p>
              {customer.industry && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{customer.industry}</p>}
            </div>

            {/* Quick stats */}
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Quick Stats</p>
              {(
                [
                  {
                    label: "Total Revenue",
                    value: `₹${customer.totalRevenue.toLocaleString("en-IN")}`,
                    cls: "text-emerald-600 font-semibold",
                  },
                  { label: "Active Proposals", value: String(customer.activeProposalsCount), cls: "" },
                  { label: "Active Deals", value: String(customer.activeDealsCount), cls: "" },
                  {
                    label: "Open Tickets",
                    value: String(openTicketsCount),
                    cls: openTicketsCount > 0 ? "text-orange-600" : "",
                  },
                ] as const
              ).map(({ label, value, cls }) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0 dark:border-gray-800"
                >
                  <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                  <span className={cn("text-sm font-medium text-gray-900 dark:text-gray-100", cls)}>{value}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {canUpdate && canUpdateCustomer && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 rounded-lg text-xs"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 flex-1 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-700"
                onClick={() => navigate("/proposals", { state: { customerId: customer.id } })}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Proposal
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 rounded-lg text-xs"
                onClick={() => setLogActivityOpen(true)}
              >
                <Activity className="mr-1.5 h-3.5 w-3.5" /> Log
              </Button>
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 rounded-lg text-xs text-destructive"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex w-full flex-col">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="scrollbar-none flex overflow-x-auto border-b border-gray-100 px-1 dark:border-gray-800">
                  {PROFILE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                          "-mb-px flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                          activeTab === tab.key
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                <div className="p-5">
                  {uniqueProductLineOptions.length > 0 && (
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Filter</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Product line filter applies to deals, invoices, activity, and product line table where applicable.
                        </p>
                      </div>
                      <div className="w-full sm:w-72">
                        <Label className="sr-only">Product line</Label>
                        <Select value={productLineFilter} onValueChange={setProductLineFilter}>
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="All product lines" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All product lines</SelectItem>
                            {uniqueProductLineOptions.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

            <TabsContent value="overview" className="mt-0 space-y-6 flex-1">
              <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-base font-semibold">Company Details</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Address</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        {[
                          customer.address?.line1,
                          customer.address?.line2,
                          customer.address?.city,
                          customer.address?.state,
                          customer.address?.pincode,
                          customer.address?.country,
                        ].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    {customer.gstin && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">GSTIN</p>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{customer.gstin}</p>
                      </div>
                    )}
                    {customer.pan && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">PAN</p>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{customer.pan}</p>
                      </div>
                    )}
                    {customer.website && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Website</p>
                        <a
                          href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {customer.website}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {customer.industry && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Industry</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{customer.industry}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-200 dark:border-gray-800 shadow-none overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                  <CardTitle className="text-base font-semibold">Contacts</CardTitle>
                  {canUpdate && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddContactOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Contact
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-4">
                    {customer.contacts.map((c) => (
                      <Card key={c.id} className="bg-muted/30 border border-gray-200 dark:border-gray-800 shadow-none overflow-hidden">
                        <CardContent className="p-4 flex flex-row items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{c.name}</span>
                              {c.isPrimary && (
                                <Badge variant="secondary" className="text-[10px]">Primary</Badge>
                              )}
                            </div>
                            {c.designation && <p className="text-xs text-muted-foreground">{c.designation}</p>}
                            <p className="text-xs text-primary">{c.email}</p>
                            {c.phone && <p className="text-xs">{c.phone}</p>}
                          </div>
                          {canUpdate && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                title="Delete"
                                disabled={customer.contacts.length <= 1}
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-200 dark:border-gray-800 border-dashed shadow-none overflow-hidden">
                <CardContent className="p-6 flex items-center gap-4 bg-muted/20">
                  <MapPin className="w-8 h-8 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Address Map</p>
                    <p className="text-xs text-muted-foreground">
                      {addressLines.length ? addressLines.join(", ") : "No address"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions" className="mt-6 space-y-4">
              <Accordion type="multiple" defaultValue={["proposals", "deals", "payments", "invoices"]} className="border border-border rounded-lg overflow-hidden">
                <AccordionItem value="proposals" className="border-b border-border px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Proposals</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    <CustomerProposalsLiveTable customerId={customer.id} onViewProposal={(id) => setProposalDetailId(id)} />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="deals" className="border-b border-border px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Deals</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    <CustomerDealsLiveTable customerId={customer.id} dealIdAllowlist={dealIdAllowlist} />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="payments" className="border-b border-border px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Payments</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    <CustomerPaymentsLiveSection customerId={customer.id} onRecordPayment={() => setRecordPaymentOpen(true)} />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="invoices" className="px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Invoices</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    {(me.role === "finance" || me.role === "super_admin") && (
                      <Button size="sm" variant="outline" className="mb-4" onClick={() => setCreateInvoiceOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Create Invoice
                      </Button>
                    )}
                    <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Invoice #</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs text-right">Tax</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs">Issued</TableHead>
                          <TableHead className="text-xs">Due</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dealIdAllowlist
                          ? customer.invoices.filter((inv) => dealIdAllowlist.has(inv.dealId))
                          : customer.invoices
                        ).map((inv) => {
                          const isOverdue =
                            inv.status === "unpaid" &&
                            new Date(inv.dueDate) < new Date();
                          return (
                            <TableRow
                              key={inv.id}
                              className={isOverdue ? "bg-red-500/10" : undefined}
                            >
                              <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                              <TableCell className="text-sm">{inv.dealTitle}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatINR(inv.amount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatINR(inv.taxAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatINR(inv.totalAmount)}</TableCell>
                              <TableCell className="text-xs">{inv.issuedOn}</TableCell>
                              <TableCell className="text-xs">{inv.dueDate}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={INVOICE_STATUS_BADGE[inv.status] ?? "bg-muted"}>
                                  {inv.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {(dealIdAllowlist
                          ? customer.invoices.filter((inv) => dealIdAllowlist.has(inv.dealId)).length === 0
                          : customer.invoices.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                              No invoices
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="productline" className="mt-6 space-y-6">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Active Products & Services</CardTitle>
                  {(me.role === "super_admin" || me.role === "sales_manager") && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddProductLineOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Product Line
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">Item code</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Unit Price</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Purchased</TableHead>
                    <TableHead className="text-xs">Renewal</TableHead>
                    <TableHead className="text-xs">Expiry</TableHead>
                    <TableHead className="text-xs">Usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProductLines.map((pl) => {
                    const renewalDate = pl.renewalDate ? new Date(pl.renewalDate) : null;
                    const expiryDate = pl.expiryDate ? new Date(pl.expiryDate) : null;
                    const now = new Date();
                    const daysToExpiry = expiryDate
                      ? Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
                      : null;
                    const expiringSoon = daysToExpiry !== null && daysToExpiry <= 30;
                    const expiringVerySoon = daysToExpiry !== null && daysToExpiry <= 7;
                    return (
                      <TableRow
                        key={pl.id}
                        className={
                          expiringVerySoon
                            ? "bg-red-500/10"
                            : expiringSoon
                            ? "bg-amber-500/10"
                            : undefined
                        }
                      >
                        <TableCell className="text-sm font-medium">
                          <span className="flex items-center gap-1">
                            {expiringSoon && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                            {pl.itemName}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{pl.sku}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{pl.itemType}</Badge></TableCell>
                        <TableCell className="text-right">{pl.qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatINR(pl.unitPrice)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              pl.status === "active"
                                ? "bg-green-500/15"
                                : pl.status === "expired"
                                ? "bg-orange-500/15"
                                : "bg-muted"
                            }
                          >
                            {pl.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{pl.purchasedAt.slice(0, 10)}</TableCell>
                        <TableCell className="text-xs">{pl.renewalDate ?? "—"}</TableCell>
                        <TableCell className="text-xs">{pl.expiryDate ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{pl.usageDetails ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredProductLines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                        No product lines
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
                </div>
                </CardContent>
              </Card>

              {customer.productLines.some(
                (pl) => pl.itemType === "subscription" && pl.status === "active"
              ) && (
                <Card className="border border-border overflow-hidden">
                  <CardHeader className="px-6 py-4 border-b border-border">
                    <CardTitle className="text-base font-semibold">Subscription Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 text-sm space-y-2">
                    <p>
                      Total active subscriptions:{" "}
                      {customer.productLines.filter(
                        (pl) => pl.itemType === "subscription" && pl.status === "active"
                      ).length}
                    </p>
                    <p className="text-muted-foreground">
                      Next renewal:{" "}
                      {(() => {
                        const subs = customer.productLines.filter(
                          (pl) => pl.itemType === "subscription" && pl.status === "active" && pl.renewalDate
                        );
                        const next = subs.sort(
                          (a, b) => (a.renewalDate ?? "").localeCompare(b.renewalDate ?? "")
                        )[0];
                        return next ? `${next.renewalDate} — ${next.itemName}` : "—";
                      })()}
                    </p>
                    <p>
                      Annual subscription value:{" "}
                      {formatINR(
                        customer.productLines
                          .filter((pl) => pl.itemType === "subscription" && pl.status === "active")
                          .reduce((s, pl) => s + pl.qty * pl.unitPrice * 12, 0)
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="support_workflow" className="mt-6 space-y-6">
              <SupportWorkflowTab
                customer={customer}
                customerId={customer.id}
                primaryPhone={primaryContact?.phone ?? null}
                primaryEmail={primaryContact?.email ?? null}
                activeDeal={wonDeal}
                assignedToName={users.find((u) => u.id === wonDeal?.ownerUserId)?.name ?? me.name}
                onGoPayments={() => navigate(`/payments?customerId=${encodeURIComponent(customer.id)}`)}
                onNewTicket={() => setAddTicketOpen(true)}
                onGoTickets={() => setActiveTab("tickets")}
              />
            </TabsContent>

            <TabsContent value="notes" className="mt-6 space-y-6">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 shrink-0" /> Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {!noteExpanded ? (
                    <Button variant="outline" size="sm" onClick={() => setNoteExpanded(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Note
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a note..."
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!noteInput.trim()) return;
                            useAppStore.getState().addNote(customer.id, {
                              id: "cn-" + makeId(),
                              content: noteInput.trim(),
                              createdBy: me.id,
                              createdByName: me.name,
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                            });
                            toast({ title: "Note added" });
                            setNoteInput("");
                            setNoteExpanded(false);
                          }}
                        >
                          Save
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setNoteExpanded(false); setNoteInput(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {customer.notes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No notes yet. Add the first note.</p>
                    )}
                    {customer.notes
                      .slice()
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((note) => (
                        <Card key={note.id} className="bg-muted/30 border border-border">
                          <CardContent className="p-4">
                            {editingNoteId === note.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingNoteContent}
                                  onChange={(e) => setEditingNoteContent(e.target.value)}
                                  rows={3}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      useAppStore.getState().updateNote(customer.id, note.id, editingNoteContent);
                                      setEditingNoteId(null);
                                      setEditingNoteContent("");
                                      toast({ title: "Note updated" });
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => { setEditingNoteId(null); setEditingNoteContent(""); }}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {note.createdByName} · {formatDate(note.createdAt)}
                                </p>
                                {canUpdate && (me.role === "super_admin" || note.createdBy === me.id) && (
                                  <div className="flex gap-1 mt-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setEditingNoteId(note.id);
                                        setEditingNoteContent(note.content);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-destructive"
                                      onClick={() => {
                                        useAppStore.getState().deleteNote(customer.id, note.id);
                                        toast({ title: "Note deleted" });
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border overflow-hidden">
                <CardHeader className="px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Attachments</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <Button variant="outline" size="sm" className="mb-3" asChild>
                    <label>
                      <input type="file" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          useAppStore.getState().updateCustomer(customer.id, {
                            attachments: [
                              ...customer.attachments,
                              {
                                id: "ca-" + makeId(),
                                fileName: file.name,
                                fileType: file.type,
                                fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
                                uploadedBy: me.id,
                                uploadedAt: new Date().toISOString(),
                              },
                            ],
                          });
                          toast({ title: "Attachment added (demo)" });
                        }
                      }} />
                      <Upload className="w-4 h-4 mr-1" /> Upload Attachment
                    </label>
                  </Button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {customer.attachments.map((att) => (
                      <Card key={att.id} className="bg-muted/30 border border-border">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{att.fileName}</p>
                              <p className="text-xs text-muted-foreground">{att.fileSize} · {formatDate(att.uploadedAt)}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive flex-shrink-0"
                            onClick={() => {
                              useAppStore.getState().updateCustomer(customer.id, {
                                attachments: customer.attachments.filter((a) => a.id !== att.id),
                              });
                              toast({ title: "Attachment removed" });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    {customer.attachments.length === 0 && (
                      <p className="text-sm text-muted-foreground col-span-2">No attachments</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tickets" className="mt-6 space-y-4">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Support Tickets</CardTitle>
                  {canManageTickets && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddTicketOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> New Ticket
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-6">
              <div className="text-xs text-muted-foreground mb-4 px-1">
                Open: {customer.supportTickets.filter((t) => t.status === "open").length} · In Progress:{" "}
                {customer.supportTickets.filter((t) => t.status === "in_progress").length} · Resolved:{" "}
                {customer.supportTickets.filter((t) => t.status === "resolved").length} · Avg Resolution: — days
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Ticket #</TableHead>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Priority</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Assigned To</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                    <TableHead className="text-xs">Updated</TableHead>
                    <TableHead className="text-xs w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.supportTickets.map((t) => (
                    <>
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedTicketId(expandedTicketId === t.id ? null : t.id)}
                      >
                        <TableCell className="font-mono text-xs">{t.ticketNumber}</TableCell>
                        <TableCell className="text-sm">{t.subject}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TICKET_PRIORITY_BADGE[t.priority] ?? "bg-muted"}>
                            {t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TICKET_STATUS_BADGE[t.status] ?? "bg-muted"}>
                            {t.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{t.assignedToName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{t.createdAt.slice(0, 10)}</TableCell>
                        <TableCell className="text-xs">{t.updatedAt.slice(0, 10)}</TableCell>
                        <TableCell>
                          {canManageTickets && (
                            <Button variant="ghost" size="sm" className="h-7" onClick={(e) => e.stopPropagation()}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedTicketId === t.id && (
                        <TableRow key={`${t.id}-detail`}>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <div className="p-3 space-y-2 text-sm">
                              <p><strong>Description:</strong></p>
                              <p className="text-muted-foreground whitespace-pre-wrap">{t.description}</p>
                              {t.resolvedAt && (
                                <p className="text-xs text-muted-foreground">Resolved: {formatDate(t.resolvedAt)}</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {customer.supportTickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No support tickets
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-6 space-y-4">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Activity (live)</CardTitle>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setLogActivityOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Log Activity
                  </Button>
                </CardHeader>
                <CardContent className="p-6">
                  <CustomerActivityLiveFeed customerId={customer.id} dealIdAllowlist={dealIdAllowlist} />
                  {customer.activityLog.length > 0 && (
                    <div className="mt-8 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Local notes</p>
                      <div className="space-y-3">
                        {customer.activityLog.slice(0, 10).map((entry) => (
                          <div key={entry.id} className="flex gap-3 items-start text-sm">
                            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-muted" />
                            <div>
                              <p className="font-medium">{entry.action}</p>
                              <p className="text-xs text-muted-foreground">{entry.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
                </div>
              </div>
            </Tabs>
          </div>
        </div>
      </div>

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingCustomer={customer}
        onSaved={() => setEditOpen(false)}
      />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {customer.companyName || customer.customerName} and all related data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                useAppStore.getState().deleteCustomer(customer.id);
                toast({ title: "Customer deleted" });
                setDeleteConfirm(false);
                navigate("/customers");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProposalDetailSheet
        proposal={detailProposal ?? null}
        open={!!proposalDetailId}
        onOpenChange={(open) => !open && setProposalDetailId(null)}
        onEdit={() => proposalDetailId && navigate("/proposals", { state: { editId: proposalDetailId } })}
        onApprove={() => {}}
        onReject={() => {}}
        onSend={() => {}}
        onCreateDeal={() => {}}
        onDownloadPdf={async () => {
          if (!detailProposal) return;
          setPdfLoading(true);
          toast({ title: "Generating PDF...", description: "Please wait" });
          try {
            await new Promise((r) => setTimeout(r, 100));
            await generateProposalPdf(detailProposal);
            toast({ title: "PDF Downloaded", description: `Proposal-${detailProposal.proposalNumber}.pdf` });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to generate PDF";
            toast({ title: "PDF generation failed", description: message, variant: "destructive" });
          } finally {
            setPdfLoading(false);
          }
        }}
        isPdfLoading={pdfLoading}
      />

      {/* Placeholder dialogs - can be expanded with full forms */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-muted-foreground">Add contact form (Name, Email, Phone, Set as Primary).</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContactOpen(false)}>Cancel</Button>
            <Button onClick={() => setAddContactOpen(false)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addTicketOpen} onOpenChange={setAddTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Ticket</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-muted-foreground">Subject, Description, Priority, Assigned To.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTicketOpen(false)}>Cancel</Button>
            <Button onClick={() => setAddTicketOpen(false)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-muted-foreground">Deal, Amount, Paid On, Mode, Reference, Notes.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentOpen(false)}>Cancel</Button>
            <Button onClick={() => setRecordPaymentOpen(false)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-muted-foreground">Deal, Amount, Tax, Due Date.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={() => setCreateInvoiceOpen(false)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addProductLineOpen} onOpenChange={setAddProductLineOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Product Line</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-muted-foreground">Select from Inventory, Qty, Unit Price, Dates, Usage, Status.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProductLineOpen(false)}>Cancel</Button>
            <Button onClick={() => setAddProductLineOpen(false)}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={logActivityOpen} onOpenChange={setLogActivityOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-muted-foreground">Action, Description, Entity Type.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogActivityOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                useAppStore.getState().appendActivityLog(customer.id, {
                  id: "cal-" + makeId(),
                  action: "Activity logged",
                  description: "Manual activity entry",
                  performedBy: me.id,
                  performedByName: me.name,
                  timestamp: new Date().toISOString(),
                });
                toast({ title: "Activity logged" });
                setLogActivityOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#4B2E83]/10 text-[#4B2E83]">
                <Bot className="h-4 w-4" />
              </span>
              AI Briefing
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {briefLines.length ? (
              <ul className="space-y-1 text-sm">
                {briefLines.map((l, idx) => (
                  <li key={idx} className="text-gray-800 dark:text-gray-200">
                    - {l}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No briefing available.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
