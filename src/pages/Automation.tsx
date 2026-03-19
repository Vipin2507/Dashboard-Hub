import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAppStore } from "@/store/useAppStore";
import { runAutomationRules } from "@/lib/automationService";
import { apiUrl } from "@/lib/api";
import type { AutomationChannel, AutomationLog, AutomationRecipient, AutomationTemplate, AutomationTrigger } from "@/types";
import { TEMPLATE_VARIABLES } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  "proposal_rejected",
  "deal_won",
  "deal_lost",
  "payment_due",
  "payment_received",
  "invoice_overdue",
  "subscription_expiring",
];

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  proposal_sent: "Proposal Sent",
  proposal_follow_up: "Proposal Follow-up",
  proposal_approved: "Proposal Approved",
  proposal_rejected: "Proposal Rejected",
  deal_won: "Deal Won",
  deal_lost: "Deal Lost",
  payment_due: "Payment Due",
  payment_received: "Payment Received",
  invoice_overdue: "Invoice Overdue",
  subscription_expiring: "Subscription Expiring",
};

const CHANNEL_ICON: Record<AutomationChannel, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-4 w-4 text-green-600" />,
  email: <Mail className="h-4 w-4 text-blue-600" />,
  in_app: <Bell className="h-4 w-4 text-purple-600" />,
};

function ConnectionStatus() {
  const settings = useAppStore((s) => s.automationSettings);
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium",
          settings.isN8nConnected
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        )}
      >
        n8n {settings.isN8nConnected ? "connected" : "offline"}
      </span>
      <span
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium",
          settings.isWahaConnected
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        )}
      >
        WAHA {settings.isWahaConnected ? "connected" : "offline"}
      </span>
    </div>
  );
}

export default function Automation() {
  const automationTemplates = useAppStore((s) => s.automationTemplates);
  const automationSettings = useAppStore((s) => s.automationSettings);
  const setAutomationTemplates = useAppStore((s) => s.setAutomationTemplates);
  const setAutomationLogs = useAppStore((s) => s.setAutomationLogs);
  const setAutomationSettings = useAppStore((s) => s.setAutomationSettings);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutomationTemplate | null>(null);

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

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Automation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage WhatsApp, email workflows and notification templates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus />
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
            className="bg-blue-600 hover:bg-blue-700 text-white h-9"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Template
          </Button>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="border-b w-full justify-start rounded-none bg-transparent p-0 h-auto gap-0">
          {["templates", "logs", "settings"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 capitalize px-5 py-3 text-sm font-medium"
            >
              {tab === "logs" ? "Activity Logs" : tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="templates" className="mt-6">
          <TemplatesTab
            onNew={() => setShowAddTemplate(true)}
            onEdit={(t) => setEditingTemplate(t)}
          />
        </TabsContent>
        <TabsContent value="logs" className="mt-6">
          <LogsTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SettingsTab />
        </TabsContent>
      </Tabs>

      <Dialog open={showAddTemplate} onOpenChange={setShowAddTemplate}>
        <TemplateDialog template={null} onClose={() => setShowAddTemplate(false)} />
      </Dialog>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <TemplateDialog template={editingTemplate} onClose={() => setEditingTemplate(null)} />
      </Dialog>
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
          ? await fetch(`/waha/api/sendText`, {
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
          : await fetch(`/n8n/webhook/buildesk-email`, {
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
      const errorBody = ok ? "" : (await res.text().catch(() => ""))?.slice(0, 500);
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <Card key={template.id} className="border border-gray-200 dark:border-gray-800 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {CHANNEL_ICON[template.channel]}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                    {template.name}
                  </span>
                </div>
                <Switch checked={template.isActive} onCheckedChange={() => toggleAutomationTemplate(template.id)} />
              </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-medium">
                  {TRIGGER_LABELS[template.trigger]}
                </span>
                {template.recipients.map((r) => (
                  <span
                    key={r}
                    className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs capitalize"
                  >
                    {r.replace("_", " ")}
                  </span>
                ))}
              </div>

              {(template.delayHours ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 mb-3">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    Send after {template.delayHours}h
                    {template.repeatEveryHours ? `, repeat every ${template.repeatEveryHours}h` : ""}
                    {template.maxRepeats ? ` (max ${template.maxRepeats}x)` : ""}
                  </span>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 bg-gray-50 dark:bg-gray-900 rounded p-2">
                {template.body}
              </p>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => onEdit(template)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => openTestTemplate(template)}>
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  onClick={() => confirmDelete(template.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
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
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Test template</DialogTitle>
        <DialogDescription className="text-sm text-gray-500">
          Send a one-time test message using the configured channel.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Template</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{template.name}</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
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

        <div className="flex justify-end gap-2 pt-2">
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
        </div>
      </div>
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
    channel: z.enum(["whatsapp", "email", "in_app"]),
    recipients: z.array(z.enum(["customer", "sales_rep", "sales_manager", "finance"])).min(1),
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

  const watchedTrigger = form.watch("trigger");
  const watchedChannel = form.watch("channel");
  const availableVars = TEMPLATE_VARIABLES[watchedTrigger] ?? [];

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
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
    <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
      <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
        <DialogTitle>{template ? "Edit Template" : "New Automation Template"}</DialogTitle>
        <DialogDescription className="text-sm text-gray-500">
          Configure trigger, channel, recipients, and message variables.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</p>
              <Input className="h-9 text-sm" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
              <span className="text-sm text-gray-500">Active</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger Event</p>
              <Select value={watchedTrigger} onValueChange={(v) => form.setValue("trigger", v as AutomationTrigger)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TRIGGERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Channel</p>
              <Select value={watchedChannel} onValueChange={(v) => form.setValue("channel", v as AutomationChannel)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                  <SelectItem value="email">📧 Email</SelectItem>
                  <SelectItem value="in_app">🔔 In-App</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Recipients</label>
            <div className="flex flex-wrap gap-2">
              {(["customer", "sales_rep", "sales_manager", "finance"] as const).map((r) => {
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Delay (hours)</label>
              <Input
                type="number"
                min="0"
                className="h-9 text-sm"
                {...form.register("delayHours", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">
                Repeat every (hours)
              </label>
              <Input
                type="number"
                min="0"
                className="h-9 text-sm"
                {...form.register("repeatEveryHours", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Max repeats</label>
              <Input
                type="number"
                min="0"
                className="h-9 text-sm"
                {...form.register("maxRepeats", { valueAsNumber: true })}
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
              {...form.register("body")}
              ref={(el) => {
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
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
            {template ? "Save Changes" : "Create Template"}
          </Button>
        </div>
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
      <div className="grid grid-cols-4 gap-4">
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

      <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Template</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Channel</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Entity</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800 dark:text-gray-200 text-xs">{log.templateName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {CHANNEL_ICON[log.channel]}
                      <span className="text-xs text-gray-500 capitalize">{log.channel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{log.recipientName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{log.entityName}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_STYLE[log.status])}>
                      {log.status}
                    </span>
                    {log.errorMessage && <p className="text-xs text-red-500 mt-0.5">{log.errorMessage}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    {new Date(log.sentAt).toLocaleString("en-IN")}
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

          {logs.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8" disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="h-8" disabled={currentPage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>
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
      const res = await fetch(`/n8n/webhook/buildesk-health`, {
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
      const res = await fetch(`${settings.wahaApiUrl}/api/sessions`, {
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

