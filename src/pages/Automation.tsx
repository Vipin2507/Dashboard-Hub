import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAppStore } from "@/store/useAppStore";
import { fetchN8nWebhook, fetchWahaSendText, fetchWahaSessions } from "@/lib/automationEndpoints";
import { runAutomationRules } from "@/lib/automationService";
import { loadRulesFromStore, saveRulesToStore, toggleRule, type AutomationRule } from "@/lib/automationRules";
import { apiUrl } from "@/lib/api";
import type { AutomationChannel, AutomationLog, AutomationRecipient, AutomationTemplate, AutomationTrigger } from "@/types";
import { TEMPLATE_VARIABLES } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { DataTablePagination } from "@/components/DataTablePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  Bell,
  Clock,
  ExternalLink,
  Mail,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

const ALL_TRIGGERS: AutomationTrigger[] = [
  "proposal_sent",
  "proposal_follow_up",
  "proposal_approved",
  "proposal_approved_customer_notify",
  "proposal_rejected",
  "deal_created",
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
];

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  proposal_sent: "Proposal Sent",
  proposal_follow_up: "Proposal Follow-up",
  proposal_approved: "Proposal Approved",
  proposal_approved_customer_notify: "Proposal Approved — Customer Notify",
  proposal_rejected: "Proposal Rejected",
  deal_created: "Deal Created",
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
};

const CHANNEL_ICON: Record<AutomationChannel, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-4 w-4 text-green-600" />,
  email: <Mail className="h-4 w-4 text-blue-600" />,
  sms: <MessageSquare className="h-4 w-4 text-orange-600" />,
  in_app: <Bell className="h-4 w-4 text-purple-600" />,
};

function ConnectionStatusPill({ service }: { service: "n8n" | "waha" }) {
  const settings = useAppStore((s) => s.automationSettings);
  const isConnected = service === "n8n" ? settings.isN8nConnected : settings.isWahaConnected;
  const label = service === "n8n" ? "n8n" : "WAHA";
  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium",
        isConnected
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      )}
    >
      {label} {isConnected ? "connected" : "offline"}
    </span>
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
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Define when automations fire automatically (local rules with cooldown).
        </p>
        <Button
          size="sm"
          className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg"
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
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Rule
        </Button>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rule.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {TRIGGER_LABELS[rule.trigger]}
                  </span>
                </div>

                {rule.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-xs text-gray-500">When:</span>
                    {rule.conditions.map((c, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {c.field} {c.operator} {String(c.value)}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-500">Then:</span>
                  {rule.actions.map((a, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                    >
                      {a.type.replaceAll("_", " ")}
                      {a.delayHours > 0 ? ` after ${a.delayHours}h` : ""}
                    </span>
                  ))}
                </div>

                {rule.cooldownHours > 0 && (
                  <p className="text-xs text-gray-400 mt-2">Cooldown: {rule.cooldownHours}h between fires</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch checked={rule.isActive} onCheckedChange={() => onToggle(rule.id)} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-md"
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
          <p className="text-sm text-muted-foreground py-8 text-center">No rules yet.</p>
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
          if (serverTemplates.length > 0) {
            setAutomationTemplates(serverTemplates);
          } else if (automationTemplates.length > 0) {
            await Promise.all(
              automationTemplates.map((t) =>
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
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Automation</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage WhatsApp, email and notification workflows
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ConnectionStatusPill service="n8n" />
          <ConnectionStatusPill service="waha" />
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              runAutomationRules();
              toast({ title: "Rule check started", description: "Proposal follow-up and payment rules evaluated." });
            }}
          >
            Run Rules Now
          </Button>
          <Button
            onClick={() => setShowAddTemplate(true)}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Templates", value: automationTemplates.length },
          {
            label: "Active",
            value: automationTemplates.filter((t) => t.isActive).length,
            color: "text-emerald-600",
          },
          { label: "Sent Today", value: sentToday, color: "text-blue-600" },
          {
            label: "Failed",
            value: failed,
            color: failed > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{s.label}</p>
            <p className={cn("text-2xl font-bold tracking-tight", s.color ?? "text-gray-900 dark:text-gray-100")}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-0">
          {(["Templates", "Rules", "Activity Logs", "Settings"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
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
  const CHANNEL_CONFIG: Record<
    string,
    { icon: typeof MessageSquare; color: string; bg: string; label: string }
  > = {
    whatsapp: {
      icon: MessageSquare,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950",
      label: "WhatsApp",
    },
    email: {
      icon: Mail,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950",
      label: "Email",
    },
    in_app: {
      icon: Bell,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-950",
      label: "In-App",
    },
    sms: {
      icon: MessageSquare,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-950",
      label: "SMS",
    },
  };

  const ch = CHANNEL_CONFIG[template.channel] ?? CHANNEL_CONFIG.in_app;
  const ChannelIcon = ch.icon;

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 border rounded-xl p-5",
        "transition-all duration-200",
        template.isActive
          ? "border-gray-200 dark:border-gray-800 hover:shadow-sm"
          : "border-gray-100 dark:border-gray-800/50 opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", ch.bg)}>
            <ChannelIcon className={cn("h-4.5 w-4.5", ch.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug truncate">
              {template.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{ch.label}</p>
          </div>
        </div>

        <Switch
          checked={template.isActive}
          onCheckedChange={() => onToggle(template.id)}
          className="flex-shrink-0"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
          {TRIGGER_LABELS[template.trigger] ?? template.trigger}
        </span>
        {template.recipients.map((r) => (
          <span
            key={r}
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 capitalize"
          >
            {r.replace("_", " ")}
          </span>
        ))}
      </div>

      {(template.delayHours ?? 0) > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Sends after {template.delayHours}h
            {template.repeatEveryHours ? ` · repeats every ${template.repeatEveryHours}h` : ""}
            {template.maxRepeats ? ` · max ${template.maxRepeats}x` : ""}
          </span>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5 mb-4 border border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed font-mono">
          {template.body}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs rounded-lg"
          onClick={() => onEdit(template)}
        >
          <Pencil className="h-3 w-3 mr-1.5" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 rounded-lg text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
          title="Test send"
          onClick={() => onTest(template)}
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 rounded-lg text-red-500 border-red-100 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() => onDelete(template.id)}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
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

      const res =
        template.channel === "whatsapp"
          ? await fetchWahaSendText(settings, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": settings.wahaApiKey,
              },
              body: JSON.stringify({
                session: settings.wahaSession,
                chatId: recipient.phone ? toWahaChatId(recipient.phone) : "",
                text: template.body,
              }),
            })
          : await fetchN8nWebhook(settings, "buildesk-email", {
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
                delayHours: 0,
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={triggerFilter} onValueChange={(v) => setTriggerFilter(v as AutomationTrigger | "all")}>
          <SelectTrigger className="h-9 w-[200px] text-sm">
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
          <SelectTrigger className="h-9 w-[140px] text-sm">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
      </div>

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
        <DialogDescription className="text-sm text-gray-500">
          Send a one-time test message using the configured channel.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Template</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{template.name}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Recipient name</p>
            <Input className="h-9 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isWhatsApp && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Phone</p>
              <Input className="h-9 text-sm" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          )}
          {isEmail && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email</p>
              <Input className="h-9 text-sm" placeholder="test@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          {!isEmail && !isWhatsApp && (
            <p className="text-sm text-gray-500">In-app templates can’t be tested via n8n. Trigger the event to generate logs.</p>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
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

  const schema = z.object({
    name: z.string().min(3),
    trigger: z.enum(ALL_TRIGGERS as [AutomationTrigger, ...AutomationTrigger[]]),
    channel: z.enum(["whatsapp", "email", "sms", "in_app"]),
    recipients: z
      .array(z.enum(["customer", "sales_rep", "sales_manager", "finance", "super_admin"]))
      .min(1),
    subject: z.string().optional(),
    body: z.string().min(10),
    isActive: z.boolean(),
    delayHours: z.number().min(0),
    repeatEveryHours: z.number().min(0),
    maxRepeats: z.number().min(0),
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
      body: template?.body ?? "",
      isActive: template?.isActive ?? true,
      delayHours: template?.delayHours ?? 0,
      repeatEveryHours: template?.repeatEveryHours ?? 0,
      maxRepeats: template?.maxRepeats ?? 0,
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
      body: template?.body ?? "",
      isActive: template?.isActive ?? true,
      delayHours: template?.delayHours ?? 0,
      repeatEveryHours: template?.repeatEveryHours ?? 0,
      maxRepeats: template?.maxRepeats ?? 0,
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

  const onSubmit = (values: FormValues) => {
    const now = new Date().toISOString();
    if (template) {
      updateAutomationTemplate(template.id, {
        ...values,
        subject: values.channel === "email" ? values.subject : undefined,
      });
      toast({ title: "Template updated" });
    } else {
      const newTemplate: AutomationTemplate = {
        id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
        name: values.name,
        trigger: values.trigger,
        channel: values.channel,
        recipients: values.recipients,
        subject: values.channel === "email" ? values.subject : undefined,
        body: values.body,
        isActive: values.isActive,
        delayHours: values.delayHours || 0,
        repeatEveryHours: values.repeatEveryHours || 0,
        maxRepeats: values.maxRepeats || 0,
        createdAt: now,
        updatedAt: now,
      };
      addAutomationTemplate(newTemplate);
      toast({ title: "Template created" });
    }
    onClose();
  };

  return (
    <DialogContent className={dialogSmMax2xl}>
      <DialogHeader>
        <DialogTitle>{template ? "Edit Template" : "New Automation Template"}</DialogTitle>
        <DialogDescription className="text-sm text-gray-500">
          Configure trigger, channel, recipients, and message variables.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DialogBody className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</p>
              <Input className="h-9 text-sm" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex items-center gap-2 pb-1 sm:justify-end">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
              <span className="text-sm text-gray-500">Active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger Event</p>
              <SearchableSelect
                value={watchedTrigger}
                onValueChange={(v) => form.setValue("trigger", v as AutomationTrigger)}
                options={ALL_TRIGGERS.map((t) => ({ value: t, label: TRIGGER_LABELS[t] }))}
                placeholder="Select trigger"
                searchPlaceholder="Search triggers…"
                triggerClassName="h-9 text-sm"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Channel</p>
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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Recipients</label>
            <div className="flex flex-wrap gap-2">
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
                      "flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border text-sm capitalize transition-colors",
                      checked
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900",
                    )}
                  >
                    <span>{r.replace("_", " ")}</span>
                  </button>
                );
              })}
            </div>
            {form.formState.errors.recipients && (
              <p className="text-xs text-destructive mt-1">Select at least 1 recipient.</p>
            )}
          </div>

          {watchedChannel === "email" && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Subject</p>
              <Input className="h-9 text-sm" {...form.register("subject")} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Delay (hours)</label>
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
              <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">
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
              <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Max repeats</label>
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
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Message Body</label>
              <span className="text-xs text-gray-400">Click a variable to insert</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {availableVars.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-mono hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
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
            <p className="text-xs text-gray-400 mt-1">
              {watchedChannel === "whatsapp"
                ? "WhatsApp: use *bold*, _italic_. Max 1024 chars."
                : "Email: plain text. HTML not supported."}
            </p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
            {template ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function LogsTab() {
  const logs = useAppStore((s) => s.automationLogs);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLogs = logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const STATUS_STYLE: Record<AutomationLog["status"], string> = {
    sent: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    skipped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  const stats = useMemo(() => {
    return {
      sent: logs.filter((l) => l.status === "sent").length,
      failed: logs.filter((l) => l.status === "failed").length,
      pending: logs.filter((l) => l.status === "pending").length,
      total: logs.length,
    };
  }, [logs]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          { label: "Total Sent", value: stats.sent, color: "text-emerald-600" },
          { label: "Failed", value: stats.failed, color: "text-red-600" },
          { label: "Pending", value: stats.pending, color: "text-amber-600" },
          { label: "Total", value: stats.total, color: "text-gray-900 dark:text-gray-100" },
        ].map((s) => (
          <Card key={s.label} className="border border-gray-200 dark:border-gray-800 shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden border border-gray-200 shadow-none dark:border-gray-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:px-4 md:py-3">
                  Template
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-gray-500 md:px-4 md:py-3">
                  Status
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500 md:px-4 md:py-3">
                  Date
                </th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell md:px-4 md:py-3">
                  Channel
                </th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell md:px-4 md:py-3">
                  Recipient
                </th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell md:px-4 md:py-3">
                  Entity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-3 py-3 md:px-4 md:py-3.5">
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{log.templateName}</span>
                  </td>
                  <td className="px-3 py-3 text-center md:px-4 md:py-3.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[log.status])}>
                      {log.status}
                    </span>
                    {log.errorMessage && <p className="mt-0.5 text-xs text-red-500">{log.errorMessage}</p>}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-gray-400 md:px-4 md:py-3.5">
                    {new Date(log.sentAt).toLocaleString("en-IN")}
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell md:px-4 md:py-3.5">
                    <div className="flex items-center gap-1.5">
                      {CHANNEL_ICON[log.channel]}
                      <span className="text-xs capitalize text-gray-500">{log.channel}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell md:px-4 md:py-3.5">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{log.recipientName}</span>
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell md:px-4 md:py-3.5">
                    <span className="text-xs text-gray-500">{log.entityName}</span>
                  </td>
                </tr>
              ))}
              {paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
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
        </CardContent>
      </Card>
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
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <ConnectionCard
          title="n8n Workflow Engine"
          url={settings.n8nWebhookBase}
          isConnected={settings.isN8nConnected}
          onTest={testN8nConnection}
          icon={<Zap className="h-5 w-5" />}
          iconBg="bg-orange-50 dark:bg-orange-950"
          iconColor="text-orange-500"
        />
        <ConnectionCard
          title="WAHA WhatsApp"
          url={settings.wahaApiUrl}
          isConnected={settings.isWahaConnected}
          onTest={testWahaConnection}
          icon={<MessageSquare className="h-5 w-5" />}
          iconBg="bg-green-50 dark:bg-green-950"
          iconColor="text-green-600"
        />
      </div>

      <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            n8n Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <SettingField
            label="Webhook Base URL"
            value={settings.n8nWebhookBase}
            onChange={(v) => updateSettings({ n8nWebhookBase: v })}
            hint="e.g. http://72.60.200.185:5678/webhook"
          />
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-1">Required n8n webhooks</p>
            <div className="space-y-1">
              {[
                { path: "buildesk-email", desc: "Email via Gmail/SMTP" },
                { path: "buildesk-health", desc: "Health check for settings tab" },
              ].map((w) => (
                <div key={w.path} className="flex items-center gap-2">
                  <code className="text-xs bg-white dark:bg-gray-900 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100">
                    /webhook/{w.path}
                  </code>
                  <span className="text-xs text-amber-700 dark:text-amber-300">— {w.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              WhatsApp automation is sent directly via WAHA (n8n not used for WhatsApp).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-600" />
            WAHA WhatsApp Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SettingField label="WAHA API URL" value={settings.wahaApiUrl} onChange={(v) => updateSettings({ wahaApiUrl: v })} />
            <SettingField label="API Key" type="password" value={settings.wahaApiKey} onChange={(v) => updateSettings({ wahaApiKey: v })} />
            <SettingField label="Session Name" value={settings.wahaSession} onChange={(v) => updateSettings({ wahaSession: v })} hint="Default: 'default'" />
            <SettingField label="WhatsApp Number" value={settings.wahaFromNumber} onChange={(v) => updateSettings({ wahaFromNumber: v })} hint="Linked number (with country code)" />
          </div>
          <a
            href={`${settings.wahaApiUrl}/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open WAHA Dashboard to scan QR code
          </a>
        </CardContent>
      </Card>

      <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            Email Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-4">
            <SettingField
              label="From Address"
              value={settings.emailFromAddress}
              onChange={(v) => updateSettings({ emailFromAddress: v })}
            />
            <SettingField label="From Name" value={settings.emailFromName} onChange={(v) => updateSettings({ emailFromName: v })} />
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Email is sent via your n8n Gmail or SMTP node. Configure credentials inside n8n directly.
          </p>
        </CardContent>
      </Card>
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
    <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
            <p className="text-xs text-gray-500 truncate">{url}</p>
          </div>
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconBg)}>
            <div className={iconColor}>{icon}</div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium",
              isConnected
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
            )}
          >
            {isConnected ? "Connected" : "Not connected"}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onTest}>
            Test
          </Button>
        </div>
      </CardContent>
    </Card>
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
      <p className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">{label}</p>
      <Input className="h-9 text-sm" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

