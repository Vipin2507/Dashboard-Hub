import { useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  enqueueProposalFollowUpJob,
  type FollowUpEnqueueProgress,
} from "@/lib/proposalFollowUp";
import { useAppStore } from "@/store/useAppStore";
import type { Proposal } from "@/types";

interface SendBulkProposalFollowUpDialogProps {
  proposals: Proposal[];
  onClose: () => void;
}

export function SendBulkProposalFollowUpDialog({ proposals, onClose }: SendBulkProposalFollowUpDialogProps) {
  const me = useAppStore((s) => s.me);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<FollowUpEnqueueProgress | null>(null);
  const [queued, setQueued] = useState(false);
  const cancelRef = useRef(false);
  const gapMinutes = Math.round(PROPOSAL_FOLLOW_UP_GAP_MS / 60_000);

  const handleSend = async () => {
    cancelRef.current = false;
    setPreparing(true);
    setQueued(false);
    try {
      await enqueueProposalFollowUpJob(proposals, {
        createdByName: me.name,
        isCancelled: () => cancelRef.current,
        onProgress: setProgress,
      });
      setQueued(true);
      setProgress(null);
      toast({
        title: "Follow-up queued",
        description: "The server will keep sending. You can close this tab.",
      });
    } catch (e) {
      if (cancelRef.current) {
        toast({ title: "Follow-up stopped", description: "Nothing else will be sent." });
        onClose();
        return;
      }
      toast({
        title: "Could not start follow-up",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setPreparing(false);
    }
  };

  const phaseLabel =
    progress?.phase === "upload"
      ? "Uploading PDF"
      : progress?.phase === "start"
        ? "Starting the queue"
        : "Creating PDF";

  return (
    <AlertDialog open onOpenChange={(open) => !open && !preparing && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send follow-up to filtered proposals</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {queued ? (
                <p>
                  These follow-ups are running on the server, about {gapMinutes} minutes apart. Closing or refreshing
                  this tab will not stop them. Track progress on the Automation page.
                </p>
              ) : (
                <>
                  <p>
                    This queues the follow-up email and WhatsApp, with the proposal PDF attached, for{" "}
                    <strong className="text-foreground">{proposals.length}</strong> proposal
                    {proposals.length === 1 ? "" : "s"} in the current filter.
                  </p>
                  <p>
                    This tab stays open only while the PDFs are prepared. After that, the server sends each email and
                    WhatsApp about {gapMinutes} minutes apart until the list is finished.
                  </p>
                </>
              )}
              {preparing && progress ? (
                <p className="text-foreground">
                  {phaseLabel} {Math.min(progress.index + 1, progress.total)} of {progress.total}
                  {progress.customerName ? ` — ${progress.customerName}` : ""}
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {queued ? (
            <>
              <Button type="button" variant="outline" asChild>
                <Link to="/automation">Open Automation</Link>
              </Button>
              <Button type="button" onClick={onClose}>
                Close
              </Button>
            </>
          ) : (
            <>
              <AlertDialogCancel
                onClick={(event) => {
                  if (!preparing) {
                    onClose();
                    return;
                  }
                  event.preventDefault();
                  cancelRef.current = true;
                }}
              >
                {preparing ? "Stop" : "Cancel"}
              </AlertDialogCancel>
              <Button type="button" onClick={() => void handleSend()} disabled={preparing || proposals.length === 0}>
                {preparing ? "Preparing…" : `Queue ${proposals.length}`}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
