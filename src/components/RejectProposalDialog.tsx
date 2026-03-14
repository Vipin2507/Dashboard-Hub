import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/components/ui/use-toast";

interface RejectProposalDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function RejectProposalDialog({ proposalId, onClose }: RejectProposalDialogProps) {
  const proposal = useAppStore((s) => s.proposals.find((p) => p.id === proposalId));
  const rejectProposal = useAppStore((s) => s.rejectProposal);
  const me = useAppStore((s) => s.me);
  const [reason, setReason] = useState("");

  if (!proposal) return null;

  const handleReject = () => {
    if (reason.trim().length < 10) {
      toast({ title: "Reason required", description: "Please enter at least 10 characters.", variant: "destructive" });
      return;
    }
    rejectProposal(proposalId, me.id, reason.trim());
    toast({ title: "Proposal rejected", description: `${proposal.proposalNumber} has been rejected.` });
    onClose();
  };

  return (
    <Dialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject proposal</DialogTitle>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleReject} disabled={reason.trim().length < 10}>
            Reject proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
