import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  PROPOSAL_FOLLOW_UP_GAP_MS,
  sendProposalFollowUpBatch,
  type FollowUpBatchItemResult,
  type FollowUpBatchProgress,
} from "@/lib/proposalFollowUp";
import type { Proposal } from "@/types";

interface SendBulkProposalFollowUpDialogProps {
  proposals: Proposal[];
  onClose: () => void;
}

function tally(results: FollowUpBatchItemResult[]) {
  let both = 0;
  let emailOnly = 0;
  let whatsappOnly = 0;
  let none = 0;
  for (const row of results) {
    if (row.email.ok && row.whatsapp.ok) both += 1;
    else if (row.email.ok) emailOnly += 1;
    else if (row.whatsapp.ok) whatsappOnly += 1;
    else none += 1;
  }
  return { both, emailOnly, whatsappOnly, none };
}

export function SendBulkProposalFollowUpDialog({ proposals, onClose }: SendBulkProposalFollowUpDialogProps) {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<FollowUpBatchProgress | null>(null);
  const [done, setDone] = useState<{ results: FollowUpBatchItemResult[]; stoppedEarly: boolean } | null>(null);
  const cancelRef = useRef(false);
  const gapSeconds = Math.round(PROPOSAL_FOLLOW_UP_GAP_MS / 1000);

  const handleSend = async () => {
    cancelRef.current = false;
    setSending(true);
    setDone(null);
    try {
      const outcome = await sendProposalFollowUpBatch(proposals, {
        isCancelled: () => cancelRef.current,
        onProgress: setProgress,
      });
      setDone(outcome);
      setProgress(null);
      const counts = tally(outcome.results);
      const summary = [
        counts.both ? `${counts.both} email and WhatsApp` : "",
        counts.emailOnly ? `${counts.emailOnly} email only` : "",
        counts.whatsappOnly ? `${counts.whatsappOnly} WhatsApp only` : "",
        counts.none ? `${counts.none} not sent` : "",
      ]
        .filter(Boolean)
        .join(", ");
      toast({
        title: outcome.stoppedEarly ? "Follow-up stopped" : "Follow-up finished",
        description: summary || "No messages were sent.",
        variant: counts.none > 0 && counts.both === 0 ? "destructive" : "default",
      });
    } catch (e) {
      toast({
        title: "Follow-up failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const phaseLabel =
    progress?.phase === "email"
      ? "Sending email"
      : progress?.phase === "whatsapp"
        ? "Sending WhatsApp"
        : "Waiting before the next message";

  const counts = done ? tally(done.results) : null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send follow-up to filtered proposals</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {!done ? (
                <>
                  <p>
                    This sends the follow-up email and WhatsApp, with the proposal PDF attached, to{" "}
                    <strong className="text-foreground">{proposals.length}</strong> proposal
                    {proposals.length === 1 ? "" : "s"} in the current filter.
                  </p>
                  <p>
                    Messages go out one at a time, with about {gapSeconds} seconds between each email and each WhatsApp
                    message.
                  </p>
                </>
              ) : (
                <p>
                  {done.stoppedEarly ? "Stopped early. " : ""}
                  {counts?.both ?? 0} received both, {counts?.emailOnly ?? 0} email only,{" "}
                  {counts?.whatsappOnly ?? 0} WhatsApp only, {counts?.none ?? 0} not sent.
                </p>
              )}
              {sending && progress ? (
                <p className="text-foreground">
                  {phaseLabel} {progress.index + 1} of {progress.total}
                  {progress.customerName ? ` — ${progress.customerName}` : ""}
                  {progress.proposalNumber ? ` (${progress.proposalNumber})` : ""}
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {done ? (
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <AlertDialogCancel
                onClick={(event) => {
                  if (!sending) {
                    onClose();
                    return;
                  }
                  event.preventDefault();
                  cancelRef.current = true;
                }}
              >
                {sending ? "Stop" : "Cancel"}
              </AlertDialogCancel>
              <Button type="button" onClick={() => void handleSend()} disabled={sending || proposals.length === 0}>
                {sending ? "Sending…" : `Send to ${proposals.length}`}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
