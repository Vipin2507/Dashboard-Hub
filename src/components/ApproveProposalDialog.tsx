import { useQuery } from "@tanstack/react-query";
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
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useApproveProposal } from "@/hooks/useWorkflow";
import type { Proposal } from "@/types";

interface ApproveProposalDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function ApproveProposalDialog({ proposalId, onClose }: ApproveProposalDialogProps) {
  const me = useAppStore((s) => s.me);
  const approve = useApproveProposal();
  const { data: proposals } = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });
  const proposal = proposals?.find((p) => p.id === proposalId);

  if (!proposal) return null;

  const handleApprove = () => {
    approve.mutate(
      { proposalId, approverId: me.id },
      { onSuccess: () => onClose() },
    );
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
          <AlertDialogAction onClick={handleApprove} disabled={approve.isPending}>
            {approve.isPending ? "Approving…" : "Approve proposal"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
