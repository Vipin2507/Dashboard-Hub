import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/rbac";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useCreateDealFromProposal } from "@/hooks/useWorkflow";
import type { Proposal } from "@/types";
import { toast } from "sonner";

interface CreateDealDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function CreateDealDialog({ proposalId, onClose }: CreateDealDialogProps) {
  const createDeal = useCreateDealFromProposal();
  const { data: proposals } = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });
  const proposal = proposals?.find((p) => p.id === proposalId);

  const [title, setTitle] = useState(proposal?.title ?? "");
  const [value, setValue] = useState(String(proposal?.finalQuoteValue ?? proposal?.grandTotal ?? 0));

  useEffect(() => {
    if (!proposal) return;
    setTitle(proposal.title);
    setValue(String(proposal.finalQuoteValue ?? proposal.grandTotal ?? 0));
  }, [proposalId, proposal]);

  if (!proposal) return null;

  const handleCreate = () => {
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue <= 0) {
      toast.error("Enter a valid positive value.");
      return;
    }
    const merged: Proposal = {
      ...proposal,
      title: title.trim() || proposal.title,
      finalQuoteValue: numValue,
    };
    createDeal.mutate(merged, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <Dialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create deal from proposal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Proposal <strong>{proposal.proposalNumber}</strong> — {proposal.customerName}
          </p>
          <div className="space-y-2">
            <Label>Deal title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal - Customer Name" />
          </div>
          <div className="space-y-2">
            <Label>Value (₹)</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            <p className="text-xs text-muted-foreground">Proposal total: {formatINR(proposal.finalQuoteValue ?? proposal.grandTotal)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createDeal.isPending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createDeal.isPending}>
            {createDeal.isPending ? "Creating…" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
