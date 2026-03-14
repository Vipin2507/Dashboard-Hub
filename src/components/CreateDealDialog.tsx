import { useState } from "react";
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
import { useAppStore } from "@/store/useAppStore";
import { formatINR } from "@/lib/rbac";
import { toast } from "@/components/ui/use-toast";

interface CreateDealDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function CreateDealDialog({ proposalId, onClose }: CreateDealDialogProps) {
  const proposal = useAppStore((s) => s.proposals.find((p) => p.id === proposalId));
  const addDealWithId = useAppStore((s) => s.addDealWithId);
  const createDealFromProposal = useAppStore((s) => s.createDealFromProposal);

  const [title, setTitle] = useState(proposal?.title ?? "");
  const [value, setValue] = useState(String(proposal?.finalQuoteValue ?? proposal?.grandTotal ?? 0));

  if (!proposal) return null;

  const handleCreate = () => {
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue <= 0) {
      toast({ title: "Invalid value", variant: "destructive" });
      return;
    }
    const dealId = "d" + Math.random().toString(36).slice(2, 10);
    addDealWithId({
      id: dealId,
      name: title || `Deal - ${proposal.customerName}`,
      customerId: proposal.customerId,
      ownerUserId: proposal.assignedTo,
      teamId: proposal.teamId,
      regionId: proposal.regionId,
      stage: "Qualified",
      value: numValue,
      locked: true,
      proposalId,
    });
    createDealFromProposal(proposalId, dealId);
    toast({ title: "Deal created", description: `Deal created from proposal ${proposal.proposalNumber}.` });
    onClose();
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate}>Create deal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
