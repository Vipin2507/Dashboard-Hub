import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Settings,
} from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import { formatINR } from "@/lib/rbac";
import { sendSubscriptionReminderChannels, triggerAutomation } from "@/lib/automationService";
import type { AutomationContext } from "@/lib/automationService";
import type { Proposal, ProposalLineItem, ProposalVersion } from "@/types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { CountUp } from "@/components/CountUp";
import { hoverLift, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dialogSmMaxMd, sheetContentDetail } from "@/lib/dialogLayout";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { makeProposalNumber } from "@/lib/proposalNumber";
import { Progress } from "@/components/ui/progress";
import { useSmUp } from "@/hooks/useSmUp";

export type TrackerRow = {
  id: string;
  customerId: string;
  customerName: string;
  planName: string;
  expiryDate: string;
  renewalAmount: number;
  daysLeft: number;
  bucket: string;
  statusLabel: string;
  totalRemindersSent: number;
  pendingAutomations: boolean;
};

type TrackerResponse = {
  rows: TrackerRow[];
  summary: {
    overdue: number;
    expiring30: number;
    upcoming31to90: number;
    renewedThisMonth: number;
  };
  settings: Record<string, unknown>;
};

type CardFilter = "all" | "overdue" | "exp30" | "upcoming" | "renewed";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function statusTone(statusLabel: string): StatusTone {
  const s = statusLabel.toLowerCase();
  if (s.includes("overdue")) return "danger";
  if (s.includes("expiring")) return "warning";
  if (s.includes("upcoming")) return "info";
  if (s.includes("renewed")) return "success";
  return "muted";
}

function daysProgress(daysLeft: number) {
  if (daysLeft < 0) return 100;
  const p = 100 - Math.min(100, (daysLeft / 90) * 100);
  return Math.max(0, Math.min(100, p));
}

export function RenewalSubscriptionTracker() {
  const smUp = useSmUp();
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const users = useAppStore((s) => s.users);
  const proposals = useAppStore((s) => s.proposals);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const addProposal = useAppStore((s) => s.addProposal);
  const appendActivityLog = useAppStore((s) => s.appendActivityLog);

  const queryClient = useQueryClient();
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [search, setSearch] = useState("");
  const [barFilter, setBarFilter] = useState<CardFilter>("all");

  const [remindRow, setRemindRow] = useState<TrackerRow | null>(null);
  const [remindChannels, setRemindChannels] = useState({ whatsapp: true, email: true, sms: false });
  const [remindCustom, setRemindCustom] = useState("");

  const [proposeRow, setProposeRow] = useState<TrackerRow | null>(null);
  const [proposeCatalogId, setProposeCatalogId] = useState<string>("");
  const [proposeChannels, setProposeChannels] = useState({ whatsapp: true, email: true, sms: false });

  const [renewRow, setRenewRow] = useState<TrackerRow | null>(null);
  const [renewStart, setRenewStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [renewEnd, setRenewEnd] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [recordPayment, setRecordPayment] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const canManageSettings = me.role === "super_admin" || me.role === "sales_manager";

  const trackerQuery = useQuery({
    queryKey: QK.subscriptionTracker(),
    queryFn: () => api.get<TrackerResponse>("/subscriptions/tracker"),
  });

  const settingsQuery = useQuery({
    queryKey: QK.subscriptionSettings(),
    queryFn: () =>
      api.get<Record<string, unknown>>(
        `/subscriptions/settings?actorRole=${encodeURIComponent(me.role)}`,
      ),
    enabled: canManageSettings && settingsOpen,
  });

  const mergedSettings = useMemo(() => {
    const base = (trackerQuery.data?.settings ?? {}) as Record<string, unknown>;
    const fromPanel = settingsQuery.data ?? {};
    return { ...base, ...fromPanel };
  }, [trackerQuery.data?.settings, settingsQuery.data]);

  const catalogQuery = useQuery({
    queryKey: ["payment-plans", "catalog"],
    queryFn: () => api.get<Array<{ id: string; name: string; defaultBillingCycle: string }>>("/payment-plans/catalog"),
  });

  const activeFilter = cardFilter !== "all" ? cardFilter : barFilter;

  const filteredRows = useMemo(() => {
    let list = trackerQuery.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) || r.planName.toLowerCase().includes(q),
      );
    }
    if (activeFilter === "overdue") list = list.filter((r) => r.bucket === "overdue");
    else if (activeFilter === "exp30") list = list.filter((r) => r.bucket === "expiring_30");
    else if (activeFilter === "upcoming") list = list.filter((r) => r.bucket === "upcoming_31_90");
    else if (activeFilter === "renewed") list = list.filter((r) => r.bucket === "renewed_month");
    return list;
  }, [trackerQuery.data?.rows, search, activeFilter]);

  const buildCtx = (row: TrackerRow): AutomationContext => {
    const customer = customers.find((c) => c.id === row.customerId);
    const rep = users.find((u) => u.id === customer?.assignedTo);
    const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
    const renewalLink = `${window.location.origin}/customers/${row.customerId}`;
    return {
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: primary?.phone,
      customerEmail: primary?.email,
      planName: row.planName,
      productName: row.planName,
      expiryDate: row.expiryDate,
      daysUntilExpiry: row.daysLeft,
      renewalAmount: row.renewalAmount,
      renewalLink,
      subscriptionId: row.id,
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      daysOverdue: row.daysLeft < 0 ? Math.abs(row.daysLeft) : undefined,
    };
  };

  const defaultRemindBody = (row: TrackerRow) => {
    const s = mergedSettings as {
      template30d?: string;
      templateExpiryDay?: string;
      templateOverdue?: string;
    };
    const t =
      row.daysLeft < 0
        ? s.templateOverdue
        : row.daysLeft === 0
          ? s.templateExpiryDay
          : s.template30d;
    const raw =
      t ||
      "Hello {{customer_name}}, your plan {{plan_name}} (expiry {{expiry_date}}) — amount {{renewal_amount}}. Renew: {{renewal_link}}";
    const map: Record<string, string> = {
      "{{customer_name}}": row.customerName,
      "{{plan_name}}": row.planName,
      "{{expiry_date}}": row.expiryDate,
      "{{renewal_amount}}": formatINR(row.renewalAmount),
      "{{renewal_link}}": `${window.location.origin}/customers/${row.customerId}`,
    };
    return Object.entries(map).reduce((acc, [k, v]) => acc.replaceAll(k, v), raw);
  };

  const remindMutation = useMutation({
    mutationFn: async () => {
      if (!remindRow) return;
      const ctx = buildCtx(remindRow);
      const body = remindCustom.trim() || defaultRemindBody(remindRow);
      const ch: Array<"whatsapp" | "email" | "sms"> = [];
      if (remindChannels.whatsapp) ch.push("whatsapp");
      if (remindChannels.email) ch.push("email");
      if (remindChannels.sms) ch.push("sms");
      if (ch.length === 0) throw new Error("Select at least one channel");
      await sendSubscriptionReminderChannels(ch, body, "Subscription renewal reminder", ctx);
      const kind =
        remindRow.daysLeft < 0 ? "overdue" : remindRow.daysLeft === 0 ? "expiry_day" : "30d";
      await fetch(apiUrl(`/api/subscriptions/${encodeURIComponent(remindRow.id)}/record-reminder`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
    },
    onSuccess: () => {
      toast({ title: "Reminder sent" });
      setRemindRow(null);
      setRemindCustom("");
      void queryClient.invalidateQueries({ queryKey: QK.subscriptionTracker() });
    },
    onError: (e: Error) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const nextProposalNumber = useMemo(
    () => makeProposalNumber(proposals.map((p) => p.proposalNumber)),
    [proposals],
  );

  const proposeMutation = useMutation({
    mutationFn: async () => {
      if (!proposeRow || !proposeCatalogId) throw new Error("Select a plan");
      const cat = catalogQuery.data?.find((c) => c.id === proposeCatalogId);
      if (!cat) throw new Error("Invalid plan");
      const customer = customers.find((c) => c.id === proposeRow.customerId);
      if (!customer) throw new Error("Customer not found");
      const inv = inventoryItems.find((i) => i.itemType === "subscription") ?? inventoryItems[0];
      if (!inv) throw new Error("No inventory item for line");
      const line: ProposalLineItem = {
        id: "li-" + makeId(),
        inventoryItemId: inv.id,
        name: `${cat.name} renewal`,
        sku: inv.sku,
        description: `Renewal proposal for ${proposeRow.planName}`,
        qty: 1,
        unitPrice: inv.sellingPrice,
        taxRate: inv.taxRate,
        discount: 0,
        lineTotal: inv.sellingPrice,
        taxAmount: (inv.sellingPrice * inv.taxRate) / 100,
      };
      const subtotal = line.lineTotal;
      const totalTax = line.taxAmount;
      const grandTotal = subtotal + totalTax;
      const pid = "p" + makeId();
      const nowIso = new Date().toISOString();
      const v1: ProposalVersion = {
        version: 1,
        createdAt: nowIso,
        createdBy: me.id,
        createdByName: me.name,
        lineItems: [line],
        subtotal,
        totalDiscount: 0,
        totalTax,
        grandTotal,
        notes: "Renewal",
      };
      const proposal: Proposal = {
        id: pid,
        proposalNumber: nextProposalNumber(customer.companyName || customer.customerName),
        title: `Renewal — ${proposeRow.planName}`,
        customerId: proposeRow.customerId,
        customerName: customer.companyName,
        assignedTo: me.id,
        assignedToName: me.name,
        regionId: customer.regionId,
        teamId: customer.teamId,
        status: "draft",
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        lineItems: [line],
        subtotal,
        totalDiscount: 0,
        totalTax,
        grandTotal,
        versionHistory: [v1],
        currentVersion: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: me.id,
        notes: `Auto-generated renewal proposal for subscription ${proposeRow.id}`,
      };
      await addProposal(proposal);
      const proposalUrl = `${window.location.origin}/proposals`;
      const ctx: AutomationContext = {
        ...buildCtx(proposeRow),
        proposalId: pid,
        proposalNumber: proposal.proposalNumber,
        proposalTitle: proposal.title,
        grandTotal,
        renewalLink: proposalUrl,
      };
      const ch: Array<"whatsapp" | "email" | "sms"> = [];
      if (proposeChannels.whatsapp) ch.push("whatsapp");
      if (proposeChannels.email) ch.push("email");
      if (proposeChannels.sms) ch.push("sms");
      const body = `Your renewal proposal ${proposal.proposalNumber} is ready. Total: ${formatINR(grandTotal)}. View: ${proposalUrl}`;
      await sendSubscriptionReminderChannels(ch, body, `Proposal ${proposal.proposalNumber}`, ctx);
      await triggerAutomation("proposal_sent", {
        ...ctx,
        validUntil: proposal.validUntil,
      });
    },
    onSuccess: () => {
      toast({ title: "Proposal created and sent" });
      setProposeRow(null);
      void queryClient.invalidateQueries({ queryKey: QK.subscriptionTracker() });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const markRenewedMutation = useMutation({
    mutationFn: async () => {
      if (!renewRow) return;
      await api.post(`/subscriptions/${encodeURIComponent(renewRow.id)}/mark-renewed`, {
        newPlanStartDate: renewStart,
        newExpiryDate: renewEnd,
        recordPayment,
        userId: me.id,
        userName: me.name,
      });
      appendActivityLog(renewRow.customerId, {
        id: "cal-" + makeId(),
        action: "Subscription renewed",
        description: `Plan ${renewRow.planName} renewed. New expiry ${renewEnd}.`,
        performedBy: me.id,
        performedByName: me.name,
        timestamp: new Date().toISOString(),
        entityType: "subscription",
        entityId: renewRow.id,
      });
      const confirmTpl = String(
        (mergedSettings as { templateRenewedConfirm?: string }).templateRenewedConfirm ||
          "Thank you {{customer_name}}. Your {{plan_name}} renewal is confirmed. Start {{plan_start_date}}, next expiry {{expiry_date}}.",
      );
      const ctxConfirm: AutomationContext = {
        ...buildCtx(renewRow),
        planStartDate: renewStart,
        expiryDate: renewEnd,
      };
      const tplMap: Record<string, string> = {
        "{{customer_name}}": renewRow.customerName,
        "{{plan_name}}": renewRow.planName,
        "{{plan_start_date}}": renewStart,
        "{{expiry_date}}": renewEnd,
      };
      const confirmBody = Object.entries(tplMap).reduce((acc, [k, v]) => acc.replaceAll(k, v), confirmTpl);
      await sendSubscriptionReminderChannels(["email", "whatsapp"], confirmBody, "Subscription renewed", ctxConfirm);
      await triggerAutomation("subscription_renewed_confirm", ctxConfirm);
    },
    onSuccess: () => {
      toast({ title: "Marked renewed" });
      setRenewRow(null);
      void queryClient.invalidateQueries({ queryKey: QK.subscriptionTracker() });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put("/subscriptions/settings", { ...body, actorRole: me.role, userId: me.id, userName: me.name }),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      void queryClient.invalidateQueries({ queryKey: QK.subscriptionTracker() });
      void queryClient.invalidateQueries({ queryKey: QK.subscriptionSettings() });
    },
  });

  const bulkRemindMutation = useMutation({
    mutationFn: async () => {
      const rows = (trackerQuery.data?.rows ?? []).filter(
        (r) => r.bucket === "overdue" || r.bucket === "expiring_30",
      );
      const settings = mergedSettings as {
        channels30d?: string[];
        channelsOverdue?: string[];
      };
      for (const row of rows) {
        const ctx = buildCtx(row);
        const body = defaultRemindBody(row);
        const ch = (row.daysLeft < 0 ? settings.channelsOverdue : settings.channels30d) as
          | Array<"whatsapp" | "email" | "sms">
          | undefined;
        await sendSubscriptionReminderChannels(ch ?? ["email", "whatsapp"], body, "Subscription renewal", ctx);
        const kind = row.daysLeft < 0 ? "overdue" : "30d";
        await fetch(apiUrl(`/api/subscriptions/${encodeURIComponent(row.id)}/record-reminder`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        });
      }
      return rows.length;
    },
    onSuccess: (n) => {
      toast({ title: "Bulk reminders sent", description: `${n} customer(s) processed.` });
      setBulkConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: QK.subscriptionTracker() });
    },
    onError: (e: Error) => toast({ title: "Bulk send failed", description: e.message, variant: "destructive" }),
  });

  const summary = trackerQuery.data?.summary;

  const trackerKpis: Array<{
    key: CardFilter;
    label: string;
    value: number;
    sub: string;
    icon: typeof AlertTriangle;
    iconColor: string;
    iconBg: string;
  }> = [
    {
      key: "overdue",
      label: "Overdue",
      value: summary?.overdue ?? 0,
      sub: "Past expiry",
      icon: AlertTriangle,
      iconColor: "text-destructive",
      iconBg: "bg-destructive/15",
    },
    {
      key: "exp30",
      label: "Expiring 30d",
      value: summary?.expiring30 ?? 0,
      sub: "Needs outreach",
      icon: Bell,
      iconColor: "text-warning-foreground",
      iconBg: "bg-warning/15",
    },
    {
      key: "upcoming",
      label: "Upcoming",
      value: summary?.upcoming31to90 ?? 0,
      sub: "31–90 days",
      icon: CalendarClock,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      key: "renewed",
      label: "Renewed",
      value: summary?.renewedThisMonth ?? 0,
      sub: "This month",
      icon: CheckCircle2,
      iconColor: "text-success",
      iconBg: "bg-success/15",
    },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => void trackerQuery.refetch()}
          disabled={trackerQuery.isFetching}
          title="Refresh"
        >
          {trackerQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
        {canManageSettings && (
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setSettingsOpen(true)}>
            <Settings className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        )}
        <Button type="button" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setBulkConfirmOpen(true)}>
          <Send className="mr-1 h-3.5 w-3.5" />
          Send all
        </Button>
      </div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
        {trackerKpis.map((kpi) => {
          const Icon = kpi.icon;
          const active = cardFilter === kpi.key;
          return (
            <motion.button
              key={kpi.key}
              type="button"
              variants={staggerItem}
              whileHover={hoverLift}
              whileTap={tapPress}
              onClick={() => {
                setCardFilter(active ? "all" : kpi.key);
                setBarFilter("all");
              }}
              className={cn(
                "card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0",
                active && "border-primary/40 bg-primary/5",
              )}
            >
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", kpi.iconBg)}>
                <Icon className={cn("h-3.5 w-3.5", kpi.iconColor)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
                  {trackerQuery.isLoading ? "—" : <CountUp value={kpi.value} />}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">{kpi.sub}</p>
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      <div className="card-soft flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customer or plan…"
            className="h-8 pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={barFilter}
          onValueChange={(v) => {
            setBarFilter(v as CardFilter);
            setCardFilter("all");
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs sm:w-[180px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="exp30">Expiring in 30 days</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="renewed">Renewed</SelectItem>
          </SelectContent>
        </Select>
        {cardFilter !== "all" && (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setCardFilter("all")}>
            Clear
          </Button>
        )}
      </div>

      <div className="card-soft max-h-[min(70vh,640px)] overflow-auto">
        {trackerQuery.isLoading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading subscriptions
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">No subscriptions match.</p>
        ) : !smUp ? (
          <div className="divide-y divide-border">
            {filteredRows.map((row) => (
              <div key={row.id} className="space-y-2 px-2.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/customers/${row.customerId}`} className="truncate text-sm font-medium text-primary hover:underline">
                      {row.customerName}
                    </Link>
                    <p className="truncate text-[11px] text-muted-foreground">{row.planName}</p>
                  </div>
                  <StatusPill tone={statusTone(row.statusLabel)}>{row.statusLabel}</StatusPill>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
                  <span>{row.expiryDate}</span>
                  <span>{row.daysLeft < 0 ? `${row.daysLeft}d` : `${row.daysLeft}d left`}</span>
                </div>
                <Progress
                  value={daysProgress(row.daysLeft)}
                  className={cn(
                    "h-1",
                    row.daysLeft < 0 && "[&>div]:bg-destructive",
                    row.daysLeft >= 0 && row.daysLeft <= 30 && "[&>div]:bg-warning",
                    row.daysLeft > 30 && row.daysLeft <= 90 && "[&>div]:bg-primary",
                    row.daysLeft > 90 && "[&>div]:bg-success",
                  )}
                />
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 flex-1 px-2 text-[11px]" onClick={() => setRemindRow(row)}>
                    Remind
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="h-7 flex-1 px-2 text-[11px]" onClick={() => setProposeRow(row)}>
                    Propose
                  </Button>
                  {(row.bucket === "overdue" || row.bucket === "expiring_30") && (
                    <Button type="button" size="sm" className="h-7 flex-1 px-2 text-[11px]" onClick={() => setRenewRow(row)}>
                      Renew
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="scrollbar-soft overflow-x-auto">
            <Table responsiveShell={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Reminders</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[12rem]">
                      <Link to={`/customers/${row.customerId}`} className="truncate font-medium text-primary hover:underline">
                        {row.customerName}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate">{row.planName}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">{row.expiryDate}</TableCell>
                    <TableCell className="min-w-[100px]">
                      <div className="mb-1 text-[11px] tabular-nums text-muted-foreground">
                        {row.daysLeft < 0 ? `${row.daysLeft}d` : `${row.daysLeft}d left`}
                      </div>
                      <Progress
                        value={daysProgress(row.daysLeft)}
                        className={cn(
                          "h-1",
                          row.daysLeft < 0 && "[&>div]:bg-destructive",
                          row.daysLeft >= 0 && row.daysLeft <= 30 && "[&>div]:bg-warning",
                          row.daysLeft > 30 && row.daysLeft <= 90 && "[&>div]:bg-primary",
                          row.daysLeft > 90 && "[&>div]:bg-success",
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={statusTone(row.statusLabel)}>{row.statusLabel}</StatusPill>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {row.totalRemindersSent > 0 ? `${row.totalRemindersSent}×` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setRemindRow(row)}>
                          Remind
                        </Button>
                        <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setProposeRow(row)}>
                          Propose
                        </Button>
                        {(row.bucket === "overdue" || row.bucket === "expiring_30") && (
                          <Button type="button" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setRenewRow(row)}>
                            Renew
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!remindRow} onOpenChange={(o) => !o && setRemindRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send reminder</DialogTitle>
            <DialogDescription>
              {remindRow?.customerName} — {remindRow?.planName}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={remindChannels.whatsapp}
                  onCheckedChange={(c) => setRemindChannels((x) => ({ ...x, whatsapp: !!c }))}
                />
                WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={remindChannels.email}
                  onCheckedChange={(c) => setRemindChannels((x) => ({ ...x, email: !!c }))}
                />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={remindChannels.sms}
                  onCheckedChange={(c) => setRemindChannels((x) => ({ ...x, sms: !!c }))}
                />
                SMS
              </label>
            </div>
            <div>
              <Label className="text-xs">Custom message (optional)</Label>
              <Textarea
                value={remindCustom}
                onChange={(e) => setRemindCustom(e.target.value)}
                placeholder="Leave blank to use default template from settings"
                rows={4}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemindRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => remindMutation.mutate()} disabled={remindMutation.isPending}>
              {remindMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!proposeRow} onOpenChange={(o) => !o && setProposeRow(null)}>
        <DialogContent className={dialogSmMaxMd}>
          <DialogHeader>
            <DialogTitle>Renewal proposal</DialogTitle>
            <DialogDescription>
              {proposeRow?.customerName} — current plan {proposeRow?.planName}, expires {proposeRow?.expiryDate}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <Label>Renewal plan (catalog)</Label>
              <SearchableSelect
                value={proposeCatalogId}
                onValueChange={setProposeCatalogId}
                options={(catalogQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Select plan"
                emptyText="No plans in catalog."
                triggerClassName="h-10"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={proposeChannels.whatsapp}
                  onCheckedChange={(c) => setProposeChannels((x) => ({ ...x, whatsapp: !!c }))}
                />
                WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={proposeChannels.email}
                  onCheckedChange={(c) => setProposeChannels((x) => ({ ...x, email: !!c }))}
                />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={proposeChannels.sms}
                  onCheckedChange={(c) => setProposeChannels((x) => ({ ...x, sms: !!c }))}
                />
                SMS
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => proposeMutation.mutate()} disabled={proposeMutation.isPending || !proposeCatalogId}>
              Generate &amp; send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renewRow} onOpenChange={(o) => !o && setRenewRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark renewed</DialogTitle>
            <DialogDescription>{renewRow?.planName}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>New plan start</Label>
                <Datepicker
                  select="single"
                  touchUi={false}
                  inputComponent="input"
                  inputProps={{ placeholder: "Select…", className: "h-9" }}
                  value={ymdToDate(renewStart)}
                  onChange={(ev) => setRenewStart(ev.value ? dateToYmd(ev.value) : "")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>New expiry</Label>
                <Datepicker
                  select="single"
                  touchUi={false}
                  inputComponent="input"
                  inputProps={{ placeholder: "Select…", className: "h-9" }}
                  value={ymdToDate(renewEnd)}
                  onChange={(ev) => setRenewEnd(ev.value ? dateToYmd(ev.value) : "")}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={recordPayment} onCheckedChange={(c) => setRecordPayment(!!c)} />
              Payment recorded (log only)
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => markRenewedMutation.mutate()} disabled={markRenewedMutation.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className={cn(sheetContentDetail)}>
          <SheetHeader>
            <SheetTitle>Reminder settings</SheetTitle>
            <SheetDescription>
              Super Admin and Sales Manager. Templates support {"{{customer_name}}"}, {"{{plan_name}}"},{" "}
              {"{{expiry_date}}"}, {"{{renewal_amount}}"}, {"{{renewal_link}}"}.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <SettingsToggles
              data={mergedSettings}
              onSave={(patch) => saveSettingsMutation.mutate(patch)}
              disabled={saveSettingsMutation.isPending}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send all reminders?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends reminders to every customer in <strong>Overdue</strong> or <strong>Expiring in 30 days</strong>{" "}
              using channel settings. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkRemindMutation.mutate()}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function chArr(v: unknown): Array<"whatsapp" | "email" | "sms"> {
  if (!Array.isArray(v)) return ["whatsapp", "email"];
  return v.filter((x) => x === "whatsapp" || x === "email" || x === "sms") as Array<"whatsapp" | "email" | "sms">;
}

function SettingsToggles({
  data,
  onSave,
  disabled,
}: {
  data: Record<string, unknown>;
  onSave: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState({
    enabled30d: data.enabled30d !== false,
    enabledExpiryDay: data.enabledExpiryDay !== false,
    enabledOverdue: data.enabledOverdue !== false,
    autoStopOnRenewal: data.autoStopOnRenewal !== false,
    overdueRepeatDays: Number(data.overdueRepeatDays) || 7,
    channels30d: chArr(data.channels30d),
    channelsExpiryDay: chArr(data.channelsExpiryDay),
    channelsOverdue: chArr(data.channelsOverdue),
    template30d: String(data.template30d ?? ""),
    templateExpiryDay: String(data.templateExpiryDay ?? ""),
    templateOverdue: String(data.templateOverdue ?? ""),
    templateRenewedConfirm: String(data.templateRenewedConfirm ?? ""),
  });

  const toggleChannel = (
    key: "channels30d" | "channelsExpiryDay" | "channelsOverdue",
    ch: "whatsapp" | "email" | "sms",
    on: boolean,
  ) => {
    setLocal((s) => {
      const cur = new Set(s[key]);
      if (on) cur.add(ch);
      else cur.delete(ch);
      return { ...s, [key]: [...cur] };
    });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={local.enabled30d}
          onCheckedChange={(c) => setLocal((s) => ({ ...s, enabled30d: !!c }))}
        />
        30 days before expiry
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={local.enabledExpiryDay}
          onCheckedChange={(c) => setLocal((s) => ({ ...s, enabledExpiryDay: !!c }))}
        />
        On expiry day
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={local.enabledOverdue}
          onCheckedChange={(c) => setLocal((s) => ({ ...s, enabledOverdue: !!c }))}
        />
        After expiry (overdue repeats)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={local.autoStopOnRenewal}
          onCheckedChange={(c) => setLocal((s) => ({ ...s, autoStopOnRenewal: !!c }))}
        />
        Auto-stop reminders on renewal
      </label>
      <div>
        <Label className="text-xs">Overdue repeat interval (days)</Label>
        <Select
          value={String(local.overdueRepeatDays)}
          onValueChange={(v) => setLocal((s) => ({ ...s, overdueRepeatDays: Number(v) }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Every 3 days</SelectItem>
            <SelectItem value="5">Every 5 days</SelectItem>
            <SelectItem value="7">Every 7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 border rounded-md p-3">
        <p className="text-xs font-medium">Channels per automated trigger</p>
        {(
          [
            ["30 days before", "channels30d" as const],
            ["Expiry day", "channelsExpiryDay" as const],
            ["Overdue", "channelsOverdue" as const],
          ] as const
        ).map(([label, k]) => (
          <div key={k} className="flex flex-wrap items-center gap-3 text-xs">
            <span className="w-28 text-muted-foreground">{label}</span>
            {(["whatsapp", "email", "sms"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-1">
                <Checkbox
                  checked={local[k].includes(ch)}
                  onCheckedChange={(c) => toggleChannel(k, ch, !!c)}
                />
                {ch}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div>
        <Label className="text-xs">Template — 30 days before</Label>
        <Textarea rows={3} value={local.template30d} onChange={(e) => setLocal((s) => ({ ...s, template30d: e.target.value }))} />
      </div>
      <div>
        <Label className="text-xs">Template — expiry day</Label>
        <Textarea rows={3} value={local.templateExpiryDay} onChange={(e) => setLocal((s) => ({ ...s, templateExpiryDay: e.target.value }))} />
      </div>
      <div>
        <Label className="text-xs">Template — overdue</Label>
        <Textarea rows={3} value={local.templateOverdue} onChange={(e) => setLocal((s) => ({ ...s, templateOverdue: e.target.value }))} />
      </div>
      <div>
        <Label className="text-xs">Template — renewal confirmation</Label>
        <Textarea
          rows={2}
          value={local.templateRenewedConfirm}
          onChange={(e) => setLocal((s) => ({ ...s, templateRenewedConfirm: e.target.value }))}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={disabled}
        onClick={() =>
          onSave({
            ...local,
          })
        }
      >
        Save settings
      </Button>
    </div>
  );
}
