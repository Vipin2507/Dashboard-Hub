import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Square } from "lucide-react";
import { api } from "@/lib/api";
import { PROPOSAL_FOLLOW_UP_GAP_MS } from "@/lib/proposalFollowUp";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { dialogSmMaxMd } from "@/lib/dialogLayout";

const JOBS_KEY = ["outbound-jobs"] as const;

type OutboundJobSummary = {
  id: string;
  kind: "proposal_follow_up" | "broadcast";
  title: string;
  status: string;
  gapMs: number;
  createdAt: string;
  nextRunAt: string | null;
  error: string | null;
  total: number;
  done: number;
  failed: number;
  currentLabel: string;
  createdByName: string;
};

type OutboundJobDetail = OutboundJobSummary & {
  items: Array<{
    id: string;
    customerName: string;
    proposalNumber: string;
    email: string;
    phone: string;
    status: string;
    emailStatus: string | null;
    whatsappStatus: string | null;
    emailError: string | null;
    whatsappError: string | null;
  }>;
};

const STATUS_TONE: Record<string, StatusTone> = {
  preparing: "warning",
  running: "info",
  completed: "success",
  cancelled: "muted",
  failed: "danger",
  sent: "success",
  partial: "warning",
  pending: "muted",
  waiting: "info",
  skipped: "muted",
};

function statusLabel(status: string): string {
  if (status === "proposal_follow_up") return "Follow-up";
  if (status === "broadcast") return "Broadcast";
  return status.replace(/_/g, " ");
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function parseRecipients(raw: string): Array<{ customerName: string; email: string; phone: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", email = "", phone = ""] = line.split(",").map((part) => part.trim());
      return { customerName: name || email || phone, email, phone };
    })
    .filter((row) => row.email.includes("@") || row.phone.replace(/\D/g, "").length >= 10);
}

export function OutboundJobsPanel() {
  const qc = useQueryClient();
  const me = useAppStore((s) => s.me);
  const [openId, setOpenId] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [title, setTitle] = useState("Broadcast");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [queuing, setQueuing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: JOBS_KEY,
    queryFn: () => api.get<OutboundJobSummary[]>("/automation/outbound-jobs"),
    refetchInterval: 5000,
  });

  const detailQuery = useQuery({
    queryKey: ["outbound-jobs", openId],
    queryFn: () => api.get<OutboundJobDetail>(`/automation/outbound-jobs/${openId}`),
    enabled: Boolean(openId),
    refetchInterval: 5000,
  });

  const jobs = jobsQuery.data ?? [];
  const live = jobs.filter((job) => job.status === "running" || job.status === "preparing");

  const queueBroadcast = async () => {
    const recipients = parseRecipients(recipientsText);
    if (!recipients.length) {
      toast({
        title: "Add recipients",
        description: "Use one line per person: Name, email, phone",
        variant: "destructive",
      });
      return;
    }
    if (!emailBody.trim() && !whatsappMessage.trim()) {
      toast({ title: "Write a message", description: "Add an email, a WhatsApp message, or both.", variant: "destructive" });
      return;
    }
    if (recipients.some((r) => r.email.includes("@")) && !subject.trim()) {
      toast({ title: "Email subject is required", variant: "destructive" });
      return;
    }
    setQueuing(true);
    try {
      const created = await api.post<{ id: string }>("/automation/outbound-jobs", {
        kind: "broadcast",
        title: title.trim() || "Broadcast",
        gapMs: PROPOSAL_FOLLOW_UP_GAP_MS,
        createdByName: me.name,
        items: recipients.map((row) => ({
          customerName: row.customerName,
          email: row.email,
          phone: row.phone,
          emailSubject: subject.trim(),
          emailBody: emailBody.trim(),
          whatsappMessage: whatsappMessage.trim(),
        })),
      });
      await api.post(`/automation/outbound-jobs/${created.id}/start`, {});
      await qc.invalidateQueries({ queryKey: JOBS_KEY });
      setBroadcastOpen(false);
      setRecipientsText("");
      toast({
        title: "Broadcast queued",
        description: "It keeps sending on the server if you close this tab.",
      });
    } catch (e) {
      toast({
        title: "Broadcast was not queued",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setQueuing(false);
    }
  };

  const cancelJob = async (id: string) => {
    setCancellingId(id);
    try {
      await api.post(`/automation/outbound-jobs/${id}/cancel`, {});
      await qc.invalidateQueries({ queryKey: JOBS_KEY });
      toast({ title: "Queue stopped", description: "Messages already sent stay sent." });
    } catch (e) {
      toast({
        title: "Could not stop the queue",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Actions</h2>
          <p className="text-[11px] text-muted-foreground">
            Follow-ups and broadcasts keep running on the server after this tab is closed.
            {live.length ? ` ${live.length} active.` : ""}
          </p>
        </div>
        <Button type="button" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setBroadcastOpen(true)}>
          <Megaphone className="mr-1 h-3.5 w-3.5" />
          Broadcast
        </Button>
      </div>

      <div className="space-y-2 p-3">
        {jobsQuery.isLoading ? (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading queues
          </p>
        ) : jobs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No follow-ups or broadcasts yet. Start a follow-up from Proposals, or send a broadcast here.
          </p>
        ) : (
          jobs.slice(0, 8).map((job) => {
            const expanded = openId === job.id;
            const detail = expanded ? detailQuery.data : null;
            return (
              <div key={job.id} className="rounded-md border border-border px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(expanded ? null : job.id)}>
                    <span className="block truncate text-xs font-medium">{job.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {statusLabel(job.kind)} · {job.done}/{job.total} done
                      {job.currentLabel && (job.status === "running" || job.status === "preparing")
                        ? ` · ${job.currentLabel}`
                        : ""}
                      {job.nextRunAt && job.status === "running" ? ` · next ${formatWhen(job.nextRunAt)}` : ""}
                    </span>
                  </button>
                  <StatusPill tone={STATUS_TONE[job.status] || "muted"}>{statusLabel(job.status)}</StatusPill>
                  {(job.status === "running" || job.status === "preparing") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      disabled={cancellingId === job.id}
                      onClick={() => void cancelJob(job.id)}
                    >
                      <Square className="mr-1 h-3 w-3" />
                      Stop
                    </Button>
                  )}
                </div>
                {job.error && job.status !== "running" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{job.error}</p>
                ) : null}
                {expanded && detail?.items ? (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2">
                    {detail.items.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="truncate">
                          {item.customerName || item.proposalNumber || "Recipient"}
                          {item.proposalNumber ? ` · ${item.proposalNumber}` : ""}
                        </span>
                        <span className="text-muted-foreground">
                          Email {item.emailStatus || "—"} · WhatsApp {item.whatsappStatus || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className={dialogSmMaxMd}>
          <DialogHeader>
            <DialogTitle>Broadcast</DialogTitle>
            <DialogDescription>
              Sends one at a time, about {Math.round(PROPOSAL_FOLLOW_UP_GAP_MS / 60_000)} minutes between each email and
              WhatsApp message. The server finishes the list if this tab closes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="broadcast-title">Name</Label>
              <Input id="broadcast-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="broadcast-subject">Email subject</Label>
              <Input id="broadcast-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="broadcast-email">Email</Label>
              <Textarea id="broadcast-email" rows={5} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="broadcast-wa">WhatsApp</Label>
              <Textarea
                id="broadcast-wa"
                rows={4}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="broadcast-people">Recipients</Label>
              <Textarea
                id="broadcast-people"
                rows={5}
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                placeholder={"Riya Shah, riya@acme.com, 9876543210\nAmit, , 9811111111"}
              />
              <p className="text-[11px] text-muted-foreground">One person per line: Name, email, phone</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBroadcastOpen(false)} disabled={queuing}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void queueBroadcast()} disabled={queuing}>
              {queuing ? "Queuing…" : "Queue broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
