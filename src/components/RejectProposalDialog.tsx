import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useRejectProposal } from "@/hooks/useWorkflow";
import type { Proposal } from "@/types";

interface RejectProposalDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function RejectProposalDialog({ proposalId, onClose }: RejectProposalDialogProps) {
  const reject = useRejectProposal();
  const [reason, setReason] = useState("");
  const { data: proposals } = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });
  const proposal = proposals?.find((p) => p.id === proposalId);

  if (!proposal) return null;

  const handleReject = () => {
    if (reason.trim().length < 10) {
      toast({ title: "Reason required", description: "Please enter at least 10 characters.", variant: "destructive" });
      return;
    }
    reject.mutate(
      { proposalId, reason: reason.trim() },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject proposal</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Reject proposal <strong>{proposal.proposalNumber}</strong>? You must provide a reason (min 10 characters).
        </p>
        <div className="space-y-2">
          <Label>Rejection reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Budget not approved for this quarter."
            rows={4}
            minLength={10}
          />
        </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleReject} disabled={reason.trim().length < 10 || reject.isPending}>
            {reject.isPending ? "Rejecting…" : "Reject proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
