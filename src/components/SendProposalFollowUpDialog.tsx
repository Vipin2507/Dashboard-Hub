import { useEffect, useState } from "react";
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
import { resolveCustomerNotifyReachability } from "@/lib/customerNotifyContacts";
import { proposalFollowUpFields, sendProposalFollowUp } from "@/lib/proposalFollowUp";
import { formatINR } from "@/lib/rbac";
import { useAppStore } from "@/store/useAppStore";
import type { Proposal } from "@/types";

interface SendProposalFollowUpDialogProps {
  proposal: Proposal;
  onClose: () => void;
}

export function SendProposalFollowUpDialog({ proposal, onClose }: SendProposalFollowUpDialogProps) {
  const storeCustomer = useAppStore((s) => s.customers.find((c) => c.id === proposal.customerId));
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingContact, setLoadingContact] = useState(true);
  const [sending, setSending] = useState(false);

  const fields = proposalFollowUpFields(proposal, storeCustomer?.companyName);

  useEffect(() => {
    let cancelled = false;
    setLoadingContact(true);
    void resolveCustomerNotifyReachability(proposal.customerId, storeCustomer ?? null).then((reach) => {
      if (cancelled) return;
      setEmail(reach.email ?? "");
      setPhone(reach.phone ?? "");
      setLoadingContact(false);
    });
    return () => {
      cancelled = true;
    };
  }, [proposal.customerId, storeCustomer]);

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await sendProposalFollowUp(proposal);
      const emailOk = result.email.ok;
      const waOk = result.whatsapp.ok;
      if (emailOk && waOk) {
        toast({
          title: "Follow-up sent",
          description: `Email and WhatsApp sent to ${fields.customerName}.`,
        });
        onClose();
        return;
      }
      if (!emailOk && !waOk) {
        toast({
          title: "Follow-up not sent",
          description: [result.email.error, result.whatsapp.error].filter(Boolean).join(" "),
          variant: "destructive",
        });
        return;
      }
      const sent = emailOk ? "Email sent" : "WhatsApp sent";
      const failed = emailOk ? result.whatsapp.error : result.email.error;
      toast({
        title: "Follow-up partially sent",
        description: `${sent}. ${failed ?? "The other channel failed."}`,
        variant: "destructive",
      });
      onClose();
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

  const canSend = !loadingContact && !sending && Boolean(email || phone);

  return (
    <AlertDialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send follow-up</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Send a follow-up for <strong className="text-foreground">{proposal.proposalNumber}</strong> to{" "}
                <strong className="text-foreground">{fields.customerName}</strong> by email and WhatsApp.
              </p>
              <p>
                {fields.companyName} · {formatINR(proposal.finalQuoteValue ?? proposal.grandTotal)} · created{" "}
                {fields.creationDate}
              </p>
              <p>
                Email: {loadingContact ? "Looking up…" : email || "No email on file"}
                <br />
                WhatsApp: {loadingContact ? "Looking up…" : phone || "No phone on file"}
              </p>
              {proposal.dealId ? (
                <p>
                  A deal is already linked to this proposal. The message asks the customer to ignore it if the deal was
                  created in Buildesk.
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending} onClick={onClose}>
            Cancel
          </AlertDialogCancel>
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend}>
            {sending ? "Sending…" : "Send follow-up"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
