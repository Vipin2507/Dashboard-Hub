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
import { useSendProposal } from "@/hooks/useWorkflow";
import { isProposalBelowMinimumTotal, proposalMinimumTotalMessage } from "@/lib/proposalMinValue";
import { toast } from "@/components/ui/use-toast";
import type { Proposal } from "@/types";

interface SendProposalDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function SendProposalDialog({ proposalId, onClose }: SendProposalDialogProps) {
  const customers = useAppStore((s) => s.customers);
  const send = useSendProposal();
  const { data: proposals } = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });
  const proposal = proposals?.find((p) => p.id === proposalId);

  if (!proposal) return null;
  const customer = customers.find((c) => c.id === proposal.customerId);
  const email = customer?.email ?? "customer@example.com";
  const belowMinimum = isProposalBelowMinimumTotal(proposal);

  const handleSend = () => {
    if (belowMinimum) {
      toast({ title: "Total too low", description: proposalMinimumTotalMessage(proposal), variant: "destructive" });
      return;
    }
    send.mutate(proposalId, { onSuccess: () => onClose() });
  };

  return (
    <AlertDialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send proposal to customer</AlertDialogTitle>
          <AlertDialogDescription>
            Send proposal <strong>{proposal.proposalNumber}</strong> ({proposal.title}) to <strong>{email}</strong>? Grand total: {formatINR(proposal.finalQuoteValue ?? proposal.grandTotal)}.
            {belowMinimum ? (
              <span className="mt-2 block text-destructive">{proposalMinimumTotalMessage(proposal)}</span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSend} disabled={send.isPending || belowMinimum}>
            {send.isPending ? "Sending…" : "Send"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
