import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAppStore } from "@/store/useAppStore";
import { fetchN8nWebhook, fetchWahaSendText, fetchWahaSessions } from "@/lib/automationEndpoints";
import type { AutomationContext } from "@/lib/automationService";
import { resolveMergedEmailCc, resolveWahaSession } from "@/lib/automationService";
import { runAutomationRules } from "@/lib/automationService";
import { loadRulesFromStore, saveRulesToStore, toggleRule, type AutomationRule } from "@/lib/automationRules";
import { apiUrl } from "@/lib/api";
import type { AutomationChannel, AutomationLog, AutomationRecipient, AutomationTemplate, AutomationTrigger } from "@/types";
import { TEMPLATE_VARIABLES } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { DataTablePagination } from "@/components/DataTablePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Topbar } from "@/components/Topbar";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { CountUp } from "@/components/CountUp";
import { hoverLift, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
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
import { dialogSmMax2xl, dialogSmMaxMd } from "@/lib/dialogLayout";
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
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  LayoutTemplate,
  Mail,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Power,
  Send,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ALL_TRIGGERS: AutomationTrigger[] = [
  "proposal_sent",
  "proposal_follow_up",
  "proposal_approved",
  "proposal_approved_customer_notify",
  "proposal_rejected",
  "deal_created",
  "estimate_shared",
  "deal_invoice_sent",
  "deal_won",
  "deal_lost",
  "deal_follow_up",
  "payment_due",
  "payment_received",
  "invoice_overdue",
  "subscription_expiring",
  "subscription_renewal_30d",
  "subscription_expiry_day",
  "subscription_overdue",
  "subscription_renewed_confirm",
  "executive_open_proposals_reminder",
];

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  proposal_sent: "Proposal Sent",
  proposal_follow_up: "Proposal Follow-up",
  proposal_approved: "Proposal Approved",
  proposal_approved_customer_notify: "Proposal Approved — Customer Notify",
  proposal_rejected: "Proposal Rejected",
  deal_created: "Deal Created",
  estimate_shared: "Estimate Shared (manual)",
  deal_invoice_sent: "Deal Invoice Sent (manual)",
  deal_won: "Deal Won",
  deal_lost: "Deal Lost",
  deal_follow_up: "Deal Follow-up Reminder",
  payment_due: "Payment Due",
  payment_received: "Payment Received",
  invoice_overdue: "Invoice Overdue",
  subscription_expiring: "Subscription Expiring",
  subscription_renewal_30d: "Subscription — 30 days before",
  subscription_expiry_day: "Subscription — expiry day",
  subscription_overdue: "Subscription — overdue",
  subscription_renewed_confirm: "Subscription — renewed confirmation",
  executive_open_proposals_reminder: "Executive — Open Proposals Reminder",
};

const CHANNEL_ICON: Record<AutomationChannel, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-3.5 w-3.5 text-success" />,
  email: <Mail className="h-3.5 w-3.5 text-primary" />,
  sms: <MessageSquare className="h-3.5 w-3.5 text-warning" />,
  in_app: <Bell className="h-3.5 w-3.5 text-muted-foreground" />,
};

const CHANNEL_META: Record<
  AutomationChannel,
  { icon: LucideIcon; color: string; bg: string; label: string }
> = {
  whatsapp: { icon: MessageSquare, color: "text-success", bg: "bg-success/10", label: "WhatsApp" },
  email: { icon: Mail, color: "text-primary", bg: "bg-primary/10", label: "Email" },
  sms: { icon: MessageSquare, color: "text-warning", bg: "bg-warning/10", label: "SMS" },
  in_app: { icon: Bell, color: "text-muted-foreground", bg: "bg-muted", label: "In-app" },
};

function logStatusTone(status: AutomationLog["status"]): StatusTone {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  return "muted";
}

function AutomationKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const isPlainInt = /^\d+$/.test(String(value).trim());
  const inner = (
    <>
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
          {isPlainInt ? <CountUp value={Number(value)} /> : value}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        variants={staggerItem}
        whileHover={hoverLift}
        whileTap={tapPress}
        className={cn("card-kpi w-full text-left hover:border-primary/30", active && "border-primary/40 bg-primary/5")}
      >
        {inner}
      </motion.button>
    );
  }
  return (
    <motion.div variants={staggerItem} className="card-kpi w-full">
      {inner}
    </motion.div>
  );
}

function AutomationKillSwitch() {
  const settings = useAppStore((s) => s.automationSettings);
  const updateSettings = useAppStore((s) => s.updateAutomationSettings);
  const enabled = settings.automationsEnabled !== false;

  return (
    <div
      className={cn(
        "card-soft flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        enabled ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            enabled ? "bg-success/15" : "bg-destructive/15",
          )}
        >
          <Power className={cn("h-3.5 w-3.5", enabled ? "text-success" : "text-destructive")} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {enabled ? "Automations are on" : "Automations are off"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {enabled
              ? "Templates, rules, and scheduled checks can send WhatsApp, email, and in-app messages."
              : "Nothing will send automatically — triggers, reminders, follow-ups, and n8n webhooks are paused."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Label htmlFor="automation-kill-switch" className="cursor-pointer text-[11px] font-medium text-muted-foreground">
          {enabled ? "Enabled" : "Disabled"}
        </Label>
        <Switch
          id="automation-kill-switch"
          checked={enabled}
          onCheckedChange={(on) => {
            updateSettings({ automationsEnabled: on });
            toast({
              title: on ? "Automations enabled" : "All automations turned off",
              description: on
                ? "Triggers and scheduled checks will run again."
                : "No automated messages will be sent until you turn this back on.",
              variant: on ? "default" : "destructive",
            });
          }}
        />
      </div>
    </div>
  );
}

function ConnectionStatusPill({ service }: { service: "n8n" | "waha" }) {
  const settings = useAppStore((s) => s.automationSettings);
  const isConnected = service === "n8n" ? settings.isN8nConnected : settings.isWahaConnected;
  const label = service === "n8n" ? "n8n" : "WAHA";
  return (
    <StatusPill tone={isConnected ? "success" : "muted"}>
      {label} {isConnected ? "connected" : "offline"}
    </StatusPill>
  );
}

function RulesTab({
  rules,
  onChange,
  onToggle,
}: {
  rules: AutomationRule[];
  onChange: (next: AutomationRule[]) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Local rules with cooldown — when an event fires, matching actions run.
        </p>
        <Button
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={() => {
            const next: AutomationRule = {
              id: `r_${Math.random().toString(36).slice(2, 10)}`,
              name: "New Rule",
              isActive: true,
              trigger: "deal_won",
              conditions: [],
              actions: [{ type: "send_whatsapp", templateId: "", delayHours: 0 }],
              cooldownHours: 0,
            };
            onChange([next, ...rules]);
            toast({ title: "Rule added", description: "Toggle is ready. Editing UI will be added next." });
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add rule
        </Button>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className={cn("card-soft p-3", !rule.isActive && "opacity-60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                  <StatusPill tone="info">{TRIGGER_LABELS[rule.trigger]}</StatusPill>
                </div>

                {rule.conditions.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">When</span>
                    {rule.conditions.map((c, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {c.field} {c.operator} {String(c.value)}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Then</span>
                  {rule.actions.map((a, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[11px] text-success"
                    >
                      {a.type.replaceAll("_", " ")}
                      {a.delayHours > 0 ? ` after ${a.delayHours}h` : ""}
                    </span>
                  ))}
                </div>

                {rule.cooldownHours > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Cooldown: {rule.cooldownHours}h between fires</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Switch checked={rule.isActive} onCheckedChange={() => onToggle(rule.id)} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    toast({
                      title: "Editing UI coming next",
                      description: "Rule editing (trigger/conditions/actions) will be added next.",
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="card-soft flex flex-col items-center px-4 py-10 text-center">
            <p className="text-sm font-medium">No rules yet</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Add a rule to fire templates automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Automation() {
  const automationTemplates = useAppStore((s) => s.automationTemplates);
  const automationLogs = useAppStore((s) => s.automationLogs);
  const automationSettings = useAppStore((s) => s.automationSettings);
  const setAutomationTemplates = useAppStore((s) => s.setAutomationTemplates);
  const setAutomationLogs = useAppStore((s) => s.setAutomationLogs);
  const setAutomationSettings = useAppStore((s) => s.setAutomationSettings);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutomationTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<"Templates" | "Rules" | "Activity Logs" | "Settings">("Templates");
  const [rules, setRules] = useState<AutomationRule[]>(() => loadRulesFromStore());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tplRes, logRes, settingsRes] = await Promise.all([
          fetch(apiUrl("/api/automation/templates")),
          fetch(apiUrl("/api/automation/logs")),
          fetch(apiUrl("/api/automation/settings")),
        ]);
        if (!mounted) return;

        if (tplRes.ok) {
          const serverTemplates = (await tplRes.json()) as AutomationTemplate[];
          const localTemplates = automationTemplates;

          const isNewerOrEqual = (a?: string, b?: string) => {
            const da = a ? new Date(a).getTime() : 0;
            const db = b ? new Date(b).getTime() : 0;
            return da >= db;
          };

          const differs = (a: AutomationTemplate, b: AutomationTemplate) => {
            return (
              a.name !== b.name ||
              a.trigger !== b.trigger ||
              a.channel !== b.channel ||
              a.isActive !== b.isActive ||
              (a.delayHours ?? 0) !== (b.delayHours ?? 0) ||
              (a.repeatEveryHours ?? 0) !== (b.repeatEveryHours ?? 0) ||
              (a.maxRepeats ?? 0) !== (b.maxRepeats ?? 0) ||
              (a.subject ?? "") !== (b.subject ?? "") ||
              (a.emailCc ?? "").trim() !== (b.emailCc ?? "").trim() ||
              (a.wahaSession ?? "").trim() !== (b.wahaSession ?? "").trim() ||
              a.body !== b.body ||
              JSON.stringify(a.recipients ?? []) !== JSON.stringify(b.recipients ?? [])
            );
          };

          if (serverTemplates.length > 0) {
            // If local defaults (seed) are newer/different, sync them to server so
            // "old templates" in sqlite don't keep winning after updates.
            const serverById = new Map(serverTemplates.map((t) => [t.id, t]));
            const mergedById = new Map(serverTemplates.map((t) => [t.id, t]));

            const syncTasks: Promise<unknown>[] = [];
            for (const local of localTemplates) {
              const server = serverById.get(local.id);
              if (!server) {
                mergedById.set(local.id, local);
                syncTasks.push(
                  fetch(apiUrl("/api/automation/templates"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(local),
                  }).catch(() => undefined),
                );
                continue;
              }

              const shouldOverride =
                differs(local, server) &&
                (import.meta.env.DEV || isNewerOrEqual(local.updatedAt, server.updatedAt));

              if (shouldOverride) {
                mergedById.set(local.id, { ...local, id: server.id });
                syncTasks.push(
                  fetch(apiUrl(`/api/automation/templates/${encodeURIComponent(local.id)}`), {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...local, id: server.id }),
                  }).catch(() => undefined),
                );
              }
            }

            if (syncTasks.length > 0) await Promise.all(syncTasks);
            setAutomationTemplates(Array.from(mergedById.values()).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")));
          } else if (localTemplates.length > 0) {
            await Promise.all(
              localTemplates.map((t) =>
                fetch(apiUrl("/api/automation/templates"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(t),
                }).catch(() => undefined),
              ),
            );
          }
        }

        if (logRes.ok) {
          const serverLogs = (await logRes.json()) as AutomationLog[];
          setAutomationLogs(serverLogs);
        }

        if (settingsRes.ok) {
          const serverSettings = (await settingsRes.json()) as Partial<typeof automationSettings>;
          if (serverSettings && Object.keys(serverSettings).length > 0) {
            setAutomationSettings({ ...automationSettings, ...serverSettings });
          }
        }
      } catch {
        // Keep local state when backend is unreachable.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const sentToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return automationLogs.filter((l) => {
      if (l.status !== "sent") return false;
      const dt = new Date(l.sentAt);
      dt.setHours(0, 0, 0, 0);
      return dt.getTime() === today.getTime();
    }).length;
  }, [automationLogs]);

  const failed = useMemo(() => automationLogs.filter((l) => l.status === "failed").length, [automationLogs]);

  return (
    <>
      <Topbar
        title="Automation"
        subtitle="WhatsApp, email, and in-app workflows"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <ConnectionStatusPill service="n8n" />
            <ConnectionStatusPill service="waha" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={automationSettings.automationsEnabled === false}
              onClick={() => {
                if (automationSettings.automationsEnabled === false) {
                  toast({
                    title: "Automations are off",
                    description: "Turn on the kill switch above to run rules.",
                    variant: "destructive",
                  });
                  return;
                }
                runAutomationRules();
                toast({ title: "Rule check started", description: "Proposal follow-up and payment rules evaluated." });
              }}
            >
              Run rules
            </Button>
            <Button
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => setShowAddTemplate(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
            </Button>
          </div>
        }
      />
      <div className="space-y-2.5">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <AutomationKpiCard
            label="Templates"
            value={String(automationTemplates.length)}
            sub="All workflows"
            icon={LayoutTemplate}
            iconColor="text-primary"
            iconBg="bg-primary/10"
            active={activeTab === "Templates"}
            onClick={() => setActiveTab("Templates")}
          />
          <AutomationKpiCard
            label="Active"
            value={String(automationTemplates.filter((t) => t.isActive).length)}
            sub="Currently on"
            icon={CheckCircle2}
            iconColor="text-success"
            iconBg="bg-success/10"
            onClick={() => setActiveTab("Templates")}
          />
          <AutomationKpiCard
            label="Sent today"
            value={String(sentToday)}
            sub="Successful sends"
            icon={Send}
            iconColor="text-info"
            iconBg="bg-info/10"
            active={activeTab === "Activity Logs"}
            onClick={() => setActiveTab("Activity Logs")}
          />
          <AutomationKpiCard
            label="Failed"
            value={String(failed)}
            sub={failed > 0 ? "Needs attention" : "No failures"}
            icon={AlertTriangle}
            iconColor={failed > 0 ? "text-destructive" : "text-muted-foreground"}
            iconBg={failed > 0 ? "bg-destructive/10" : "bg-muted"}
            active={activeTab === "Activity Logs"}
            onClick={() => setActiveTab("Activity Logs")}
          />
        </motion.div>

        <AutomationKillSwitch />

        <div className="inline-flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5">
          {(["Templates", "Rules", "Activity Logs", "Settings"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === "Activity Logs" ? "Logs" : tab}
            </button>
          ))}
        </div>

        {activeTab === "Templates" && (
          <TemplatesTab onNew={() => setShowAddTemplate(true)} onEdit={(t) => setEditingTemplate(t)} />
        )}
        {activeTab === "Rules" && (
          <RulesTab
            rules={rules}
            onChange={(next) => {
              setRules(next);
              saveRulesToStore(next);
            }}
            onToggle={(id) => {
              const updated = toggleRule(id);
              setRules(updated);
            }}
          />
        )}
        {activeTab === "Activity Logs" && <LogsTab />}
        {activeTab === "Settings" && <SettingsTab />}

        <Dialog open={showAddTemplate} onOpenChange={setShowAddTemplate}>
          <TemplateDialog template={null} onClose={() => setShowAddTemplate(false)} />
        </Dialog>

        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <TemplateDialog template={editingTemplate} onClose={() => setEditingTemplate(null)} />
        </Dialog>
      </div>
    </>
  );
}

function AutomationTemplateCard({
  template,
  onEdit,
  onDelete,
  onToggle,
  onTest,
}: {
  template: AutomationTemplate;
  onEdit: (t: AutomationTemplate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onTest: (t: AutomationTemplate) => void;
}) {
  const ch = CHANNEL_META[template.channel] ?? CHANNEL_META.in_app;
  const ChannelIcon = ch.icon;

  return (
    <motion.div
      variants={staggerItem}
      whileHover={hoverLift}
      className={cn("card-soft flex flex-col p-3", !template.isActive && "opacity-60")}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", ch.bg)}>
            <ChannelIcon className={cn("h-3.5 w-3.5", ch.color)} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug text-foreground">{template.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{ch.label}</p>
          </div>
        </div>
        <Switch checked={template.isActive} onCheckedChange={() => onToggle(template.id)} className="shrink-0" />
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        <StatusPill tone="info">{TRIGGER_LABELS[template.trigger] ?? template.trigger}</StatusPill>
        {template.recipients.map((r) => (
          <span
            key={r}
            className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] capitalize text-muted-foreground"
          >
            {r.replace("_", " ")}
          </span>
        ))}
      </div>

      {(template.delayHours ?? 0) > 0 && (
        <div className="mb-2 flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            After {template.delayHours}h
            {template.repeatEveryHours ? ` · every ${template.repeatEveryHours}h` : ""}
            {template.maxRepeats ? ` · max ${template.maxRepeats}x` : ""}
          </span>
        </div>
      )}

      {template.channel === "email" && (template.emailCc ?? "").trim() !== "" && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">CC</span>{" "}
          <span className="break-all font-mono">{(template.emailCc ?? "").trim()}</span>
        </p>
      )}

      {(template.wahaSession ?? "").trim() !== "" && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">WAHA session</span>{" "}
          <span className="font-mono">{(template.wahaSession ?? "").trim()}</span>
        </p>
      )}

      <div className="mb-2.5 rounded-md border border-border bg-muted/30 px-2.5 py-2">
        <p className="line-clamp-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{template.body}</p>
      </div>

      <div className="mt-auto flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 flex-1 px-2 text-[11px]" onClick={() => onEdit(template)}>
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 text-primary"
          title="Test send"
          onClick={() => onTest(template)}
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => onDelete(template.id)}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

function TemplatesTab({ onEdit }: { onNew: () => void; onEdit: (t: AutomationTemplate) => void }) {
  const templates = useAppStore((s) => s.automationTemplates);
  const toggleAutomationTemplate = useAppStore((s) => s.toggleAutomationTemplate);
  const deleteAutomationTemplate = useAppStore((s) => s.deleteAutomationTemplate);
  const appendAutomationLog = useAppStore((s) => s.appendAutomationLog);
  const settings = useAppStore((s) => s.automationSettings);

  const [triggerFilter, setTriggerFilter] = useState<AutomationTrigger | "all">("all");
  const [channelFilter, setChannelFilter] = useState<AutomationChannel | "all">("all");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testTemplate, setTestTemplate] = useState<AutomationTemplate | null>(null);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (triggerFilter !== "all" && t.trigger !== triggerFilter) return false;
      if (channelFilter !== "all" && t.channel !== channelFilter) return false;
      return true;
    });
  }, [templates, triggerFilter, channelFilter]);

  const confirmDelete = (id: string) => setDeleteId(id);

  const doDelete = () => {
    if (!deleteId) return;
    deleteAutomationTemplate(deleteId);
    toast({ title: "Template deleted" });
    setDeleteId(null);
  };

  const openTestTemplate = (t: AutomationTemplate) => setTestTemplate(t);

  const toWahaChatId = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return `${digits}@c.us`;
  };

  const sendTest = async (template: AutomationTemplate, recipient: { name: string; phone?: string; email?: string }) => {
    const logEntry: AutomationLog = {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      trigger: template.trigger,
      channel: template.channel,
      recipient: recipient.phone ?? recipient.email ?? "",
      recipientName: recipient.name,
      entityType: "customer",
      entityId: "test",
      entityName: "Test",
      status: "pending",
      sentAt: new Date().toISOString(),
    };
    appendAutomationLog(logEntry);

    try {
      if (template.channel === "whatsapp") {
        const digits = (recipient.phone ?? "").replace(/\D/g, "");
        if (!digits) {
          throw new Error("Phone number missing/invalid for WhatsApp test");
        }
      }
      if (template.channel === "email" && !recipient.email?.trim()) {
        throw new Error("Email missing/invalid for email test");
      }

      const me = useAppStore.getState().me;
      const testCcCtx: AutomationContext = {
        ...(me.id && me.id !== "__guest__" ? { salesRepId: me.id } : {}),
        customerEmail: recipient.email,
        customerName: recipient.name,
      };

      const res =
        template.channel === "whatsapp"
          ? await fetchWahaSendText(settings, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": settings.wahaApiKey,
            },
            body: JSON.stringify({
              session: resolveWahaSession(template, settings),
              chatId: recipient.phone ? toWahaChatId(recipient.phone) : "",
              text: template.body,
            }),
          })
          : await fetchN8nWebhook(
            settings,
            template.trigger === "estimate_shared" ? "buildesk-estimate" : "buildesk-email",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channel: template.channel,
                templateId: template.id,
                templateName: template.name,
                trigger: template.trigger,
                recipientPhone: recipient.phone,
                recipientEmail: recipient.email,
                recipientName: recipient.name,
                messageBody: template.body,
                emailSubject: template.subject,
                ...(template.channel === "email"
                  ? { emailCc: resolveMergedEmailCc(settings, template, testCcCtx) }
                  : {}),
                delayHours: 0,
                wahaApiUrl: settings.wahaApiUrl,
                wahaApiKey: settings.wahaApiKey,
                wahaSession: resolveWahaSession(template, settings),
                entityType: "customer",
                entityId: "test",
                entityName: "Test",
              }),
            });

      const ok = res.ok;
      const rawErr = ok ? "" : (await res.text().catch(() => ""))?.slice(0, 500);
      const errorBody = rawErr.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
      const nextLogs = useAppStore
        .getState()
        .automationLogs.map((l) =>
          l.id === logEntry.id
            ? {
              ...l,
              status: ok ? "sent" : ("failed" as const),
              errorMessage: ok ? undefined : `${res.status} ${res.statusText}${errorBody ? ` — ${errorBody}` : ""}`,
            }
            : l,
        );
      useAppStore.setState({ automationLogs: nextLogs });
      const updated = nextLogs.find((l) => l.id === logEntry.id);
      if (updated) {
        void fetch(apiUrl(`/api/automation/logs/${logEntry.id}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }).catch(() => undefined);
      }
      toast({ title: ok ? "Test triggered" : "Test failed", variant: ok ? "default" : "destructive" });
    } catch (e) {
      const nextLogs = useAppStore
        .getState()
        .automationLogs.map((l) =>
          l.id === logEntry.id ? { ...l, status: "failed", errorMessage: e instanceof Error ? e.message : String(e) } : l,
        );
      useAppStore.setState({ automationLogs: nextLogs });
      const updated = nextLogs.find((l) => l.id === logEntry.id);
      if (updated) {
        void fetch(apiUrl(`/api/automation/logs/${logEntry.id}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }).catch(() => undefined);
      }
      toast({ title: "Test failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select value={triggerFilter} onValueChange={(v) => setTriggerFilter(v as AutomationTrigger | "all")}>
          <SelectTrigger className="h-9 w-full sm:w-[200px]">
            <SelectValue placeholder="All triggers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All triggers</SelectItem>
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as AutomationChannel | "all")}>
          <SelectTrigger className="h-9 w-full sm:w-[140px]">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="in_app">In-app</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="card-soft flex flex-col items-center px-4 py-10 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No templates found</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Adjust filters or create a template.</p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filteredTemplates.map((template) => (
            <AutomationTemplateCard
              key={template.id}
              template={template}
              onEdit={onEdit}
              onDelete={confirmDelete}
              onToggle={toggleAutomationTemplate}
              onTest={openTestTemplate}
            />
          ))}
        </motion.div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the template permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={doDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!testTemplate} onOpenChange={(o) => !o && setTestTemplate(null)}>
        {testTemplate && (
          <TestTemplateDialog template={testTemplate} onClose={() => setTestTemplate(null)} onSend={sendTest} />
        )}
      </Dialog>
    </div>
  );
}

function TestTemplateDialog({
  template,
  onClose,
  onSend,
}: {
  template: AutomationTemplate;
  onClose: () => void;
  onSend: (template: AutomationTemplate, recipient: { name: string; phone?: string; email?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("Test Recipient");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const isEmail = template.channel === "email";
  const isWhatsApp = template.channel === "whatsapp";

  return (
    <DialogContent className={dialogSmMaxMd}>
      <DialogHeader>
        <DialogTitle>Test template</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Send a one-time test message using the configured channel.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Template</p>
          <p className="text-sm font-medium text-foreground">{template.name}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Recipient name</p>
            <Input className="h-9 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isWhatsApp && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
              <Input className="h-9 text-sm" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          )}
          {isEmail && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Email</p>
              <Input className="h-9 text-sm" placeholder="test@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          {!isEmail && !isWhatsApp && (
            <p className="text-xs text-muted-foreground">In-app templates can’t be tested via n8n. Trigger the event to generate logs.</p>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={async () => {
            if (isWhatsApp && !phone.trim()) {
              toast({ title: "Phone is required", variant: "destructive" });
              return;
            }
            if (isEmail && !email.trim()) {
              toast({ title: "Email is required", variant: "destructive" });
              return;
            }
            if (!isEmail && !isWhatsApp) {
              toast({ title: "In-app test not supported here", variant: "destructive" });
              return;
            }
            await onSend(template, { name, phone: phone.trim() || undefined, email: email.trim() || undefined });
            onClose();
          }}
        >
          Send test
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

type TemplateDialogProps = { template: AutomationTemplate | null; onClose: () => void };

function TemplateDialog({ template, onClose }: TemplateDialogProps) {
  const addAutomationTemplate = useAppStore((s) => s.addAutomationTemplate);
  const updateAutomationTemplate = useAppStore((s) => s.updateAutomationTemplate);
  const settingsWahaSession = useAppStore((s) => s.automationSettings.wahaSession);
  const settingsSessionHint = settingsWahaSession?.trim()
    ? ` (currently “${settingsWahaSession.trim()}”)`
    : "";

  const schema = z.object({
    name: z.string().min(3),
    trigger: z.enum(ALL_TRIGGERS as [AutomationTrigger, ...AutomationTrigger[]]),
    channel: z.enum(["whatsapp", "email", "sms", "in_app"]),
    recipients: z
      .array(z.enum(["customer", "sales_rep", "sales_manager", "finance", "super_admin"]))
      .min(1),
    subject: z.string().optional(),
    emailCc: z.string().optional(),
    body: z.string().min(10),
    isActive: z.boolean(),
    delayHours: z.number().min(0),
    repeatEveryHours: z.number().min(0),
    maxRepeats: z.number().min(0),
    wahaSession: z.string().optional(),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template?.name ?? "",
      trigger: template?.trigger ?? "proposal_sent",
      channel: template?.channel ?? "whatsapp",
      recipients: (template?.recipients ?? ["customer"]) as AutomationRecipient[],
      subject: template?.subject ?? "",
      emailCc: template?.emailCc ?? "",
      body: template?.body ?? "",
      isActive: template?.isActive ?? true,
      delayHours: template?.delayHours ?? 0,
      repeatEveryHours: template?.repeatEveryHours ?? 0,
      maxRepeats: template?.maxRepeats ?? 0,
      wahaSession: template?.wahaSession ?? "",
    },
  });

  // When opening "Edit", ensure the current template values are loaded.
  // `defaultValues` are only applied on first render in react-hook-form.
  useEffect(() => {
    form.reset({
      name: template?.name ?? "",
      trigger: template?.trigger ?? "proposal_sent",
      channel: template?.channel ?? "whatsapp",
      recipients: (template?.recipients ?? ["customer"]) as AutomationRecipient[],
      subject: template?.subject ?? "",
      emailCc: template?.emailCc ?? "",
      body: template?.body ?? "",
      isActive: template?.isActive ?? true,
      delayHours: template?.delayHours ?? 0,
      repeatEveryHours: template?.repeatEveryHours ?? 0,
      maxRepeats: template?.maxRepeats ?? 0,
      wahaSession: template?.wahaSession ?? "",
    });
  }, [template?.id]);

  const watchedTrigger = form.watch("trigger");
  const watchedChannel = form.watch("channel");
  const availableVars = TEMPLATE_VARIABLES[watchedTrigger] ?? [];

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRegister = form.register("body");
  const insertVariable = (token: string) => {
    const el = bodyRef.current;
    const current = form.getValues("body") ?? "";
    if (!el) {
      form.setValue("body", `${current}${token}`, { shouldDirty: true });
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    form.setValue("body", next, { shouldDirty: true });
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  };

  const onSubmit = async (values: FormValues) => {
    const now = new Date().toISOString();
    if (template) {
      const next = {
        ...template,
        ...values,
        subject: values.channel === "email" ? values.subject : undefined,
        emailCc: values.channel === "email" ? (values.emailCc?.trim() ? values.emailCc.trim() : undefined) : undefined,
        wahaSession: values.wahaSession?.trim() ? values.wahaSession.trim() : undefined,
        updatedAt: now,
      } satisfies AutomationTemplate;
      try {
        const res = await fetch(apiUrl(`/api/automation/templates/${encodeURIComponent(template.id)}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
        updateAutomationTemplate(template.id, next);
        toast({ title: "Template updated" });
      } catch (e) {
        toast({ title: "Failed to save template", description: String(e), variant: "destructive" });
        return;
      }
    } else {
      const newTemplate: AutomationTemplate = {
        id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
        name: values.name,
        trigger: values.trigger,
        channel: values.channel,
        recipients: values.recipients,
        subject: values.channel === "email" ? values.subject : undefined,
        emailCc: values.channel === "email" ? (values.emailCc?.trim() ? values.emailCc.trim() : undefined) : undefined,
        body: values.body,
        isActive: values.isActive,
        delayHours: values.delayHours || 0,
        repeatEveryHours: values.repeatEveryHours || 0,
        maxRepeats: values.maxRepeats || 0,
        wahaSession: values.wahaSession?.trim() ? values.wahaSession.trim() : undefined,
        createdAt: now,
        updatedAt: now,
      };
      try {
        const res = await fetch(apiUrl("/api/automation/templates"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newTemplate),
        });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
        addAutomationTemplate(newTemplate);
        toast({ title: "Template created" });
      } catch (e) {
        toast({ title: "Failed to create template", description: String(e), variant: "destructive" });
        return;
      }
    }
    onClose();
  };

  return (
    <DialogContent className={dialogSmMax2xl}>
      <DialogHeader>
        <DialogTitle>{template ? "Edit Template" : "New Automation Template"}</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Configure trigger, channel, recipients, and message variables.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-foreground">Template name</p>
              <Input className="h-9 text-sm" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex items-center gap-2 pb-1 sm:justify-end">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">Trigger event</p>
              <SearchableSelect
                value={watchedTrigger}
                onValueChange={(v) => form.setValue("trigger", v as AutomationTrigger)}
                options={ALL_TRIGGERS.map((t) => ({ value: t, label: TRIGGER_LABELS[t] }))}
                placeholder="Select trigger"
                searchPlaceholder="Search triggers…"
                triggerClassName="h-9 text-sm"
              />
              {watchedTrigger === "estimate_shared" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Used by Deals → Actions → Send (manual). No automatic sending unless you trigger it from UI.
                </p>
              )}
              {watchedTrigger === "deal_invoice_sent" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Deals → Send invoice merges this email template (subject/body/recipient/CC) into the single{" "}
                  <code className="text-[10px]">buildesk-invoice</code> payload; it is not sent again to{" "}
                  <code className="text-[10px]">buildesk-email</code>.
                  Email automations include multipart field <code className="text-[10px]">invoice_pdf</code> when the
                  installment invoice can be loaded (same pattern as <code className="text-[10px]">estimate_pdf</code>).
                </p>
              )}
              {watchedTrigger === "executive_open_proposals_reminder" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Used by Executive Performance → Remind executive (manual). Edit subject/body here; variables include{" "}
                  <code className="text-[10px]">{"{{executive_name}}"}</code>,{" "}
                  <code className="text-[10px]">{"{{period_label}}"}</code>,{" "}
                  <code className="text-[10px]">{"{{open_proposal_count}}"}</code>,{" "}
                  <code className="text-[10px]">{"{{total_value}}"}</code>,{" "}
                  <code className="text-[10px]">{"{{proposal_list}}"}</code>.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">Channel</p>
              <SearchableSelect
                value={watchedChannel}
                onValueChange={(v) => form.setValue("channel", v as AutomationChannel)}
                options={[
                  { value: "whatsapp", label: "💬 WhatsApp" },
                  { value: "email", label: "📧 Email" },
                  { value: "in_app", label: "🔔 In-App" },
                ]}
                placeholder="Select channel"
                triggerClassName="h-9 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Recipients</label>
            <div className="flex flex-wrap gap-1.5">
              {(["customer", "sales_rep", "sales_manager", "finance", "super_admin"] as const).map((r) => {
                const checked = form.watch("recipients")?.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      const current = new Set(form.getValues("recipients"));
                      if (current.has(r)) current.delete(r);
                      else current.add(r);
                      form.setValue("recipients", Array.from(current) as AutomationRecipient[], { shouldDirty: true });
                    }}
                    className={cn(
                      "h-7 rounded-md px-2 text-[11px] font-medium capitalize transition-colors",
                      checked
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {r.replace("_", " ")}
                  </button>
                );
              })}
            </div>
            {form.formState.errors.recipients && (
              <p className="text-xs text-destructive mt-1">Select at least 1 recipient.</p>
            )}
          </div>

          {watchedChannel === "email" && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-foreground">Email subject</p>
                <Input className="h-9 text-sm" {...form.register("subject")} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-foreground">CC</p>
                <Input
                  className="h-9 text-sm"
                  placeholder="ops@example.com, manager@example.com"
                  {...form.register("emailCc")}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Optional. Comma-separated for this template; merged with Settings → CC. Supports the same{" "}
                  <code className="text-[11px]">{"{{ }}"}</code> variables as the subject (e.g.{" "}
                  <code className="text-[11px]">{"{{sales_rep_email}}"}</code>).
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Delay (hours)</label>
              <Controller
                name="delayHours"
                control={form.control}
                render={({ field }) => (
                  <NumericInput
                    className="h-9 text-sm"
                    min={0}
                    integer
                    emptyOnBlur={0}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Repeat every (hours)
              </label>
              <Controller
                name="repeatEveryHours"
                control={form.control}
                render={({ field }) => (
                  <NumericInput
                    className="h-9 text-sm"
                    min={0}
                    integer
                    emptyOnBlur={0}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Max repeats</label>
              <Controller
                name="maxRepeats"
                control={form.control}
                render={({ field }) => (
                  <NumericInput
                    className="h-9 text-sm"
                    min={0}
                    integer
                    emptyOnBlur={0}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              WAHA session name
            </label>
            <Input
              className="h-9 text-sm font-mono"
              placeholder="Leave blank to use Automation Settings session"
              {...form.register("wahaSession")}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Optional per-template override. Empty = use Settings → Session name
              {settingsSessionHint}.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Message body</label>
              <span className="text-[11px] text-muted-foreground">Click a variable to insert</span>
            </div>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {availableVars.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/15"
                >
                  {v}
                </button>
              ))}
            </div>
            <Textarea
              rows={6}
              className="text-sm font-mono resize-none"
              {...bodyRegister}
              ref={(el) => {
                bodyRegister.ref(el);
                bodyRef.current = el;
              }}
              placeholder="Type your message here. Click variables above to insert them."
            />
            {form.formState.errors.body && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.body.message}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {watchedChannel === "whatsapp"
                ? "WhatsApp: use *bold*, _italic_. Max 1024 chars."
                : "Email: plain text. HTML not supported."}
            </p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 px-2.5 text-xs">
            {template ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function LogsTab() {
  const logs = useAppStore((s) => s.automationLogs);
  const setAutomationLogs = useAppStore((s) => s.setAutomationLogs);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLogs = logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearFailedConfirmOpen, setClearFailedConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    return {
      sent: logs.filter((l) => l.status === "sent").length,
      failed: logs.filter((l) => l.status === "failed").length,
      pending: logs.filter((l) => l.status === "pending").length,
      total: logs.length,
    };
  }, [logs]);

  const exportCsv = () => {
    const cols = [
      "sentAt",
      "status",
      "channel",
      "trigger",
      "templateId",
      "templateName",
      "recipient",
      "recipientName",
      "entityType",
      "entityId",
      "entityName",
      "errorMessage",
      "n8nExecutionId",
    ] as const;

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      // CSV-safe quoting
      const needs = /[",\n\r]/.test(s);
      const out = s.replace(/"/g, '""');
      return needs ? `"${out}"` : out;
    };

    const header = cols.join(",");
    const rows = logs.map((l) =>
      [
        l.sentAt,
        l.status,
        l.channel,
        l.trigger,
        l.templateId,
        l.templateName,
        l.recipient,
        l.recipientName,
        l.entityType,
        l.entityId,
        l.entityName,
        l.errorMessage ?? "",
        l.n8nExecutionId ?? "",
      ]
        .map(esc)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `automation-logs-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Server activity log — last 1000 entries.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={exportCsv} disabled={logs.length === 0}>
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={async () => {
              try {
                const res = await fetch(apiUrl("/api/automation/logs"));
                if (!res.ok) throw new Error(String(res.status));
                const items = (await res.json()) as AutomationLog[];
                setAutomationLogs(items);
                toast({ title: "Logs refreshed" });
              } catch {
                toast({ title: "Refresh failed", variant: "destructive" });
              }
            }}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs text-destructive"
            onClick={() => setClearFailedConfirmOpen(true)}
            disabled={stats.failed === 0}
          >
            Clear failed
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs text-destructive"
            onClick={() => setClearConfirmOpen(true)}
            disabled={logs.length === 0}
          >
            Clear logs
          </Button>
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <AutomationKpiCard
          label="Sent"
          value={String(stats.sent)}
          sub="Delivered"
          icon={CheckCircle2}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <AutomationKpiCard
          label="Failed"
          value={String(stats.failed)}
          sub="Needs attention"
          icon={AlertTriangle}
          iconColor={stats.failed > 0 ? "text-destructive" : "text-muted-foreground"}
          iconBg={stats.failed > 0 ? "bg-destructive/10" : "bg-muted"}
        />
        <AutomationKpiCard
          label="Pending"
          value={String(stats.pending)}
          sub="In flight"
          icon={Clock}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
        <AutomationKpiCard
          label="Total"
          value={String(stats.total)}
          sub="All entries"
          icon={FileText}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
      </motion.div>

      <div className="card-soft overflow-hidden">
          <div className="scrollbar-soft overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Template
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Date
                  </th>
                  <th className="hidden px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                    Channel
                  </th>
                  <th className="hidden px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                    Recipient
                  </th>
                  <th className="hidden px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:table-cell">
                    Entity
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Manage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedLogs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-medium text-foreground">{log.templateName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusPill tone={logStatusTone(log.status)} className="capitalize">
                        {log.status}
                      </StatusPill>
                      {log.errorMessage && <p className="mt-0.5 text-[11px] text-destructive">{log.errorMessage}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[11px] tabular-nums text-muted-foreground">
                      {new Date(log.sentAt).toLocaleString("en-IN")}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <div className="flex items-center gap-1.5">
                        {CHANNEL_ICON[log.channel]}
                        <span className="text-[11px] capitalize text-muted-foreground">{log.channel}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <span className="text-[11px] text-muted-foreground">{log.recipientName}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      <span className="text-[11px] text-muted-foreground">{log.entityName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive"
                        disabled={deletingId === log.id}
                        onClick={async () => {
                          setDeletingId(log.id);
                          try {
                            const res = await fetch(apiUrl(`/api/automation/logs/${encodeURIComponent(log.id)}`), {
                              method: "DELETE",
                            });
                            if (!res.ok) throw new Error(String(res.status));
                            setAutomationLogs(useAppStore.getState().automationLogs.filter((l) => l.id !== log.id));
                            toast({ title: "Log removed" });
                          } catch {
                            toast({ title: "Delete failed", variant: "destructive" });
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {paginatedLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No automation logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {logs.length > PAGE_SIZE && (
            <DataTablePagination
              page={currentPage}
              totalPages={totalPages}
              total={logs.length}
              perPage={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
      </div>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all automation logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the entire automation activity log history from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                try {
                  const res = await fetch(apiUrl("/api/automation/logs"), { method: "DELETE" });
                  if (!res.ok) throw new Error(String(res.status));
                  setAutomationLogs([]);
                  toast({ title: "Logs cleared" });
                } catch {
                  toast({ title: "Clear failed", variant: "destructive" });
                } finally {
                  setClearConfirmOpen(false);
                }
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearFailedConfirmOpen} onOpenChange={setClearFailedConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear failed logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete only logs with status <strong>failed</strong> from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                try {
                  const res = await fetch(apiUrl("/api/automation/logs?status=failed"), { method: "DELETE" });
                  if (!res.ok) throw new Error(String(res.status));
                  setAutomationLogs(useAppStore.getState().automationLogs.filter((l) => l.status !== "failed"));
                  toast({ title: "Failed logs cleared" });
                } catch {
                  toast({ title: "Clear failed logs failed", variant: "destructive" });
                } finally {
                  setClearFailedConfirmOpen(false);
                }
              }}
            >
              Clear failed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsTab() {
  const settings = useAppStore((s) => s.automationSettings);
  const updateSettings = useAppStore((s) => s.updateAutomationSettings);

  const testN8nConnection = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetchN8nWebhook(settings, "buildesk-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ping: true }),
        signal: ctrl.signal,
      });
      updateSettings({ isN8nConnected: res.ok });
      toast({ title: res.ok ? "n8n connected ✓" : "n8n connection failed", variant: res.ok ? "default" : "destructive" });
    } catch {
      updateSettings({ isN8nConnected: false });
      toast({ title: "n8n unreachable", variant: "destructive" });
    } finally {
      clearTimeout(t);
    }
  };

  const testWahaConnection = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetchWahaSessions(settings, {
        headers: { "X-Api-Key": settings.wahaApiKey },
        signal: ctrl.signal,
      });
      updateSettings({ isWahaConnected: res.ok });
      toast({ title: res.ok ? "WAHA connected ✓" : "WAHA connection failed", variant: res.ok ? "default" : "destructive" });
    } catch {
      updateSettings({ isWahaConnected: false });
      toast({ title: "WAHA unreachable", variant: "destructive" });
    } finally {
      clearTimeout(t);
    }
  };

  return (
    <div className="max-w-2xl space-y-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ConnectionCard
          title="n8n Workflow Engine"
          url={settings.n8nWebhookBase}
          isConnected={settings.isN8nConnected}
          onTest={testN8nConnection}
          icon={<Zap className="h-3.5 w-3.5" />}
          iconBg="bg-warning/10"
          iconColor="text-warning"
        />
        <ConnectionCard
          title="WAHA WhatsApp"
          url={settings.wahaApiUrl}
          isConnected={settings.isWahaConnected}
          onTest={testWahaConnection}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          iconBg="bg-success/10"
          iconColor="text-success"
        />
      </div>

      <div className="card-soft space-y-3 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Zap className="h-3.5 w-3.5 text-warning" />
          n8n
        </p>
        <SettingField
          label="Webhook base URL"
          value={settings.n8nWebhookBase}
          onChange={(v) => updateSettings({ n8nWebhookBase: v })}
          hint="e.g. http://72.60.200.185:5678/webhook"
        />
        <div className="rounded-md border border-warning/30 bg-warning/10 p-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-warning-foreground">Required n8n webhooks</p>
          <div className="space-y-1">
            {[
              { path: "buildesk-email", desc: "Email via Gmail/SMTP" },
              { path: "buildesk-estimate", desc: "Estimate share email (with PDF)" },
              { path: "buildesk-health", desc: "Health check for settings tab" },
            ].map((w) => (
              <div key={w.path} className="flex flex-wrap items-center gap-2">
                <code className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground">
                  /webhook/{w.path}
                </code>
                <span className="text-[11px] text-muted-foreground">— {w.desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            WhatsApp is sent directly via WAHA (n8n is not used for WhatsApp).
          </p>
        </div>
      </div>

      <div className="card-soft space-y-3 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MessageSquare className="h-3.5 w-3.5 text-success" />
          WAHA WhatsApp
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SettingField label="WAHA API URL" value={settings.wahaApiUrl} onChange={(v) => updateSettings({ wahaApiUrl: v })} />
          <SettingField label="API key" type="password" value={settings.wahaApiKey} onChange={(v) => updateSettings({ wahaApiKey: v })} />
          <SettingField label="Session name" value={settings.wahaSession} onChange={(v) => updateSettings({ wahaSession: v })} hint="Default: 'default'" />
          <SettingField label="WhatsApp number" value={settings.wahaFromNumber} onChange={(v) => updateSettings({ wahaFromNumber: v })} hint="Linked number (with country code)" />
        </div>
        <a
          href={`${settings.wahaApiUrl}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open WAHA dashboard to scan QR
        </a>
      </div>

      <div className="card-soft space-y-3 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Mail className="h-3.5 w-3.5 text-primary" />
          Email
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SettingField
            label="From address"
            value={settings.emailFromAddress}
            onChange={(v) => updateSettings({ emailFromAddress: v })}
          />
          <SettingField label="From name" value={settings.emailFromName} onChange={(v) => updateSettings({ emailFromName: v })} />
          <div className="sm:col-span-2">
            <SettingField
              label="CC (email automation)"
              value={settings.emailCc ?? ""}
              onChange={(v) => updateSettings({ emailCc: v })}
              hint="Comma-separated; merged with per-template CC. Same {{variables}} as templates (e.g. {{sales_rep_email}}). Sent as emailCc to n8n."
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Email is sent via your n8n Gmail or SMTP node. Configure credentials inside n8n directly.
        </p>
      </div>
    </div>
  );
}

function ConnectionCard({
  title,
  url,
  isConnected,
  onTest,
  icon,
  iconBg,
  iconColor,
}: {
  title: string;
  url: string;
  isConnected: boolean;
  onTest: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="card-soft space-y-2.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{url}</p>
        </div>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
          <div className={iconColor}>{icon}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <StatusPill tone={isConnected ? "success" : "muted"}>
          {isConnected ? "Connected" : "Offline"}
        </StatusPill>
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onTest}>
          Test
        </Button>
      </div>
    </div>
  );
}

function SettingField({
  label,
  value,
  onChange,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
}) {
  return (
    <div>
      <p className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <Input className="h-9 text-sm" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

