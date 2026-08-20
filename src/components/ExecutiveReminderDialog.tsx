import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Mail, MessageCircle, Bell, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeFilter } from "@/components/TimeRangeFilter";
import { StatusPill } from "@/components/StatusPill";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { formatINR } from "@/lib/rbac";
import { resolveTimeRangeYmd, type TimeRangePreset } from "@/lib/dateRange";
import { proposalStatusLabel } from "@/lib/proposalStatus";
import { useAppStore } from "@/store/useAppStore";
import {
  buildExecutiveReminderDraft,
  filterUnconvertedProposals,
  normalizeWhatsAppPhone,
  proposalReminderValue,
  sendExecutiveReminderEmail,
  sendExecutiveReminderWhatsApp,
} from "@/lib/executiveReminder";
import type { Proposal, User } from "@/types";
import { Link } from "react-router-dom";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executives: User[];
  senderName?: string;
  initialExecutiveId?: string;
  initialRange?: TimeRangePreset;
  initialFrom?: string;
  initialTo?: string;
};

export function ExecutiveReminderDialog({
  open,
  onOpenChange,
  executives,
  senderName,
  initialExecutiveId = "",
  initialRange = "this_month",
  initialFrom = "",
  initialTo = "",
}: Props) {
  const [range, setRange] = useState<TimeRangePreset>(initialRange);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [executiveId, setExecutiveId] = useState(initialExecutiveId);
  const [phoneOverride, setPhoneOverride] = useState("");
  const [emailOverride, setEmailOverride] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [sending, setSending] = useState(false);

  const proposalsQuery = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
    enabled: open,
    staleTime: 15_000,
  });

  const automationTemplates = useAppStore((s) => s.automationTemplates);

  useEffect(() => {
    if (!open) return;
    setRange(initialRange);
    setFrom(initialFrom);
    setTo(initialTo);
    setExecutiveId(initialExecutiveId && initialExecutiveId !== "all" ? initialExecutiveId : "");
  }, [open, initialRange, initialFrom, initialTo, initialExecutiveId]);

  const resolved = useMemo(() => resolveTimeRangeYmd(range, from, to), [range, from, to]);
  const executive = executives.find((u) => u.id === executiveId) ?? null;

  useEffect(() => {
    if (!executive) {
      setEmailOverride("");
      setPhoneOverride("");
      return;
    }
    setEmailOverride((executive.email || "").trim());
    setPhoneOverride((executive.phone != null ? String(executive.phone) : "").trim());
  }, [executive?.id, executive?.email, executive?.phone]);

  const pending = useMemo(() => {
    if (!executiveId) return [];
    return filterUnconvertedProposals(proposalsQuery.data ?? [], {
      executiveId,
      from: resolved.from,
      to: resolved.to,
    });
  }, [executiveId, proposalsQuery.data, resolved.from, resolved.to]);

  const draft = useMemo(() => {
    if (!executive) return null;
    return buildExecutiveReminderDraft({
      executive,
      from: resolved.from,
      to: resolved.to,
      proposals: pending,
      senderName,
      templates: automationTemplates,
    });
  }, [executive, pending, resolved.from, resolved.to, senderName, automationTemplates]);

  useEffect(() => {
    if (!draft) {
      setEmailSubject("");
      setEmailBody("");
      setWhatsappMessage("");
      return;
    }
    setEmailSubject(draft.emailSubject);
    setEmailBody(draft.emailBody);
    setWhatsappMessage(draft.whatsappMessage);
  }, [draft]);

  const emailTo = emailOverride.trim();
  const phoneTo = phoneOverride.trim();

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const shareEmail = async (opts?: { silentSuccess?: boolean }): Promise<boolean> => {
    if (!pending.length) {
      toast({ title: "No open proposals to remind about", variant: "destructive" });
      return false;
    }
    if (!emailTo || !emailTo.includes("@")) {
      toast({ title: "Add an email address", variant: "destructive" });
      return false;
    }
    const emailTpl = automationTemplates.find(
      (t) => t.trigger === "executive_open_proposals_reminder" && t.channel === "email" && t.isActive,
    );
    const result = await sendExecutiveReminderEmail({
      email: emailTo,
      subject: emailSubject,
      body: emailBody,
      executiveName: executive?.name || "Executive",
      executiveId: executive?.id,
      templateId: emailTpl?.id,
      templateName: emailTpl?.name,
      emailCc: emailTpl?.emailCc,
    });
    if (!result.ok) {
      toast({
        title: "Email send failed",
        description: result.error || "n8n could not send the email",
        variant: "destructive",
      });
      return false;
    }
    if (!opts?.silentSuccess) {
      toast({ title: "Email sent via n8n" });
    }
    return true;
  };

  const sendWhatsAppViaWaha = async (opts?: { silentSuccess?: boolean }): Promise<boolean> => {
    if (!pending.length) {
      toast({ title: "No open proposals to remind about", variant: "destructive" });
      return false;
    }
    if (!normalizeWhatsAppPhone(phoneTo)) {
      toast({ title: "Add a WhatsApp number", variant: "destructive" });
      return false;
    }
    const waTpl = automationTemplates.find(
      (t) => t.trigger === "executive_open_proposals_reminder" && t.channel === "whatsapp" && t.isActive,
    );
    const result = await sendExecutiveReminderWhatsApp({
      phone: phoneTo,
      message: whatsappMessage,
      executiveName: executive?.name || "Executive",
      executiveId: executive?.id,
      templateId: waTpl?.id,
      templateName: waTpl?.name,
    });
    if (!result.ok) {
      toast({
        title: "WhatsApp send failed",
        description: result.error || "WAHA could not send the message",
        variant: "destructive",
      });
      return false;
    }
    if (!opts?.silentSuccess) {
      toast({ title: "WhatsApp sent via WAHA" });
    }
    return true;
  };

  const onShareEmail = async () => {
    if (sending) return;
    setSending(true);
    try {
      await shareEmail();
    } finally {
      setSending(false);
    }
  };

  const shareWhatsApp = async () => {
    if (sending) return;
    setSending(true);
    try {
      await sendWhatsAppViaWaha();
    } finally {
      setSending(false);
    }
  };

  const shareBoth = async () => {
    if (sending) return;
    if (!pending.length) {
      toast({ title: "No open proposals to remind about", variant: "destructive" });
      return;
    }
    if (!emailTo || !emailTo.includes("@")) {
      toast({ title: "Add an email address", variant: "destructive" });
      return;
    }
    if (!normalizeWhatsAppPhone(phoneTo)) {
      toast({ title: "Add a WhatsApp number", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const [emailOk, waOk] = await Promise.all([
        shareEmail({ silentSuccess: true }),
        sendWhatsAppViaWaha({ silentSuccess: true }),
      ]);
      if (emailOk && waOk) {
        toast({ title: "Email sent via n8n · WhatsApp sent via WAHA" });
      } else if (emailOk) {
        toast({ title: "Email sent via n8n (WhatsApp failed)", variant: "destructive" });
      } else if (waOk) {
        toast({ title: "WhatsApp sent via WAHA (email failed)", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Executive reminder
          </DialogTitle>
          <DialogDescription>
            Pick a time range and executive, then share an email or WhatsApp reminder for proposals not yet
            converted into deals. Edit wording in{" "}
            <Link to="/automation" className="font-medium text-primary underline-offset-2 hover:underline">
              Automation
            </Link>{" "}
            (trigger: Executive — Open Proposals Reminder).
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid items-start gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Time range</p>
              <TimeRangeFilter
                preset={range}
                customFrom={from}
                customTo={to}
                onPresetChange={(preset) => {
                  if (preset === "custom") {
                    setRange(preset);
                    return;
                  }
                  const next = resolveTimeRangeYmd(preset, from, to);
                  setRange(preset);
                  setFrom(next.from);
                  setTo(next.to);
                }}
                onCustomChange={(f, t) => {
                  setRange("custom");
                  setFrom(f);
                  setTo(t);
                }}
                customPlaceholder={!from && !to ? "All time" : "Date range"}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Executive</p>
              <Select value={executiveId || undefined} onValueChange={setExecutiveId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select executive" />
                </SelectTrigger>
                <SelectContent>
                  {executives.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!executiveId ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Select an executive to load open proposals.
            </p>
          ) : proposalsQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading proposals…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <StatusPill tone={pending.length ? "warning" : "success"}>
                  {pending.length} open proposal{pending.length === 1 ? "" : "s"}
                </StatusPill>
                <span className="text-[11px] text-muted-foreground">
                  {draft?.periodLabel ?? "—"} · {formatINR(draft?.totalValue ?? 0)} excl. GST
                </span>
              </div>

              {pending.length > 0 ? (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                  {pending.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] font-medium text-primary">{p.proposalNumber}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {p.customerCompanyName || p.customerName || "Customer"} · {proposalStatusLabel(p.status)}
                        </p>
                      </div>
                      <p className="shrink-0 text-[11px] font-semibold tabular-nums">
                        {formatINR(proposalReminderValue(p))}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  No open proposals pending deal conversion for this executive in the selected period.
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Email to</p>
                  <Input
                    className="h-9 text-xs"
                    type="email"
                    placeholder="executive@example.com"
                    value={emailOverride}
                    onChange={(e) => setEmailOverride(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">WhatsApp number</p>
                  <Input
                    className="h-9 text-xs"
                    placeholder="e.g. 919876543210"
                    value={phoneOverride}
                    onChange={(e) => setPhoneOverride(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => copyText("Email", `${emailSubject}\n\n${emailBody}`)}
                    disabled={!emailBody}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <Input
                  className="h-8 text-xs"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                />
                <Textarea
                  className="min-h-[120px] text-xs"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">WhatsApp</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => copyText("WhatsApp message", whatsappMessage)}
                    disabled={!whatsappMessage}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <Textarea
                  className="min-h-[120px] text-xs"
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                />
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={!executiveId || pending.length === 0 || sending}
            onClick={() => void onShareEmail()}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Email
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={!executiveId || pending.length === 0 || sending}
            onClick={() => void shareWhatsApp()}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
            WhatsApp
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={!executiveId || pending.length === 0 || sending}
            onClick={() => void shareBoth()}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Mail className="h-3.5 w-3.5" />
                <MessageCircle className="h-3.5 w-3.5" />
              </>
            )}
            Send both
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
