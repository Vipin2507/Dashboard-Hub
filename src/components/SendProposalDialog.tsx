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

interface SendProposalDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function SendProposalDialog({ proposalId, onClose }: SendProposalDialogProps) {
  const proposal = useAppStore((s) => s.proposals.find((p) => p.id === proposalId));
  const customers = useAppStore((s) => s.customers);
  const sendProposal = useAppStore((s) => s.sendProposal);

  if (!proposal) return null;
  const customer = customers.find((c) => c.id === proposal.customerId);
  const email = customer?.email ?? "customer@example.com";

  const handleSend = () => {
    sendProposal(proposalId);
    toast({ title: "Proposal sent", description: `Proposal ${proposal.proposalNumber} sent to ${email}.` });
    onClose();
  };

  return (
    <AlertDialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send proposal to customer</AlertDialogTitle>
          <AlertDialogDescription>
            Send proposal <strong>{proposal.proposalNumber}</strong> ({proposal.title}) to <strong>{email}</strong>? Grand total: {formatINR(proposal.finalQuoteValue ?? proposal.grandTotal)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSend}>Send</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
