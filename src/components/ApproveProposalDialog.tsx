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
import { useAppStore } from "@/store/useAppStore";
import { formatINR } from "@/lib/rbac";
import { toast } from "@/components/ui/use-toast";

interface ApproveProposalDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function ApproveProposalDialog({ proposalId, onClose }: ApproveProposalDialogProps) {
  const proposal = useAppStore((s) => s.proposals.find((p) => p.id === proposalId));
  const approveProposal = useAppStore((s) => s.approveProposal);
  const me = useAppStore((s) => s.me);

  if (!proposal) return null;

  const handleApprove = () => {
    approveProposal(proposalId, me.id);
    toast({ title: "Proposal approved", description: `${proposal.proposalNumber} has been approved.` });
    onClose();
  };

  return (
    <AlertDialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve proposal</AlertDialogTitle>
          <AlertDialogDescription>
            Approve proposal <strong>{proposal.proposalNumber}</strong> for {proposal.customerName}? Grand total: {formatINR(proposal.finalQuoteValue ?? proposal.grandTotal)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleApprove}>Approve proposal</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
