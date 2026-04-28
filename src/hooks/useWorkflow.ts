import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { INVALIDATE } from "@/lib/queryKeys";
import { triggerAutomation } from "@/lib/automationService";
import { normalizeDealStatus } from "@/lib/dealStatus";
import { useAppStore } from "@/store/useAppStore";
import type { Deal, Proposal } from "@/types";

async function loadProposal(proposalId: string): Promise<Proposal> {
  const list = await api.get<Proposal[]>("/proposals");
  const p = list.find((x) => x.id === proposalId);
  if (!p) throw new Error("Proposal not found");
  return p;
}

// ─── 1. Proposal: Submit for approval ────────────────────────────────────────

export function useSubmitProposalForApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const p = await loadProposal(proposalId);
      const updated: Proposal = {
        ...p,
        status: "approval_pending",
        updatedAt: new Date().toISOString(),
      };
      return api.put<Proposal>(`/proposals/${proposalId}`, updated);
    },
    onSuccess: (proposal) => {
      INVALIDATE.proposal(qc, proposal.id, proposal.customerId);
      useAppStore.getState().pushNotification({
        type: "INTERNAL_EMAIL",
        to: "manager@buildesk.com",
        subject: `Approval required — ${proposal.proposalNumber} (${proposal.customerName})`,
        entityId: proposal.id,
      });
      toast({ title: "Submitted for approval" });
    },
  });
}

// ─── 2. Proposal: Approve ───────────────────────────────────────────────────

export function useApproveProposal() {
  const qc = useQueryClient();
  const me = useAppStore((s) => s.me);
  return useMutation({
    mutationFn: async ({ proposalId, approverId }: { proposalId: string; approverId: string }) => {
      const p = await loadProposal(proposalId);
      const now = new Date().toISOString();
      const updated: Proposal = {
        ...p,
        status: "approved",
        approvedBy: approverId,
        approvedAt: now,
        updatedAt: now,
      };
      return api.put<Proposal>(`/proposals/${proposalId}`, updated);
    },
    onSuccess: async (proposal) => {
      INVALIDATE.proposal(qc, proposal.id, proposal.customerId);
      const users = useAppStore.getState().users;
      const customers = useAppStore.getState().customers;
      const approver = users.find((u) => u.id === proposal.approvedBy);
      const rep = users.find((u) => u.id === proposal.assignedTo);
      const customer = customers.find((c) => c.id === proposal.customerId);
      const primary = customer?.contacts?.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
      await triggerAutomation("proposal_approved", {
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        proposalTitle: proposal.title,
        grandTotal: proposal.finalQuoteValue ?? proposal.grandTotal,
        customerId: proposal.customerId,
        customerName: proposal.customerName,
        approvedBy: approver?.name ?? me.name,
        salesRepId: rep?.id,
        salesRepName: rep?.name,
        salesRepPhone: (rep as { phone?: string } | undefined)?.phone,
      });
      await triggerAutomation("proposal_approved_customer_notify", {
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        proposalTitle: proposal.title,
        grandTotal: proposal.finalQuoteValue ?? proposal.grandTotal,
        customerId: proposal.customerId,
        customerName: proposal.customerName,
        customerPhone: primary?.phone,
        customerEmail: primary?.email,
        approvedBy: approver?.name ?? me.name,
        salesRepId: rep?.id,
        salesRepName: rep?.name,
        salesRepPhone: (rep as { phone?: string } | undefined)?.phone,
        companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
      });
      useAppStore.getState().pushNotification({
        type: "INTERNAL_EMAIL",
        to: rep?.email ?? proposal.assignedTo,
        subject: `Proposal approved — ${proposal.proposalNumber}`,
        entityId: proposal.id,
      });
      toast({ title: "Proposal approved", description: proposal.proposalNumber });
    },
  });
}

// ─── 3. Proposal: Reject ────────────────────────────────────────────────────

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: string; reason: string }) => {
      const p = await loadProposal(proposalId);
      const updated: Proposal = {
        ...p,
        status: "rejected",
        rejectionReason: reason,
        updatedAt: new Date().toISOString(),
      };
      return api.put<Proposal>(`/proposals/${proposalId}`, updated);
    },
    onSuccess: async (proposal) => {
      INVALIDATE.proposal(qc, proposal.id, proposal.customerId);
      const users = useAppStore.getState().users;
      const rep = users.find((u) => u.id === proposal.assignedTo);
      await triggerAutomation("proposal_rejected", {
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        proposalTitle: proposal.title,
        customerId: proposal.customerId,
        customerName: proposal.customerName,
        rejectionReason: proposal.rejectionReason ?? "",
        salesRepId: rep?.id,
        salesRepName: rep?.name,
        salesRepPhone: (rep as { phone?: string } | undefined)?.phone,
      });
      useAppStore.getState().pushNotification({
        type: "INTERNAL_EMAIL",
        to: rep?.email ?? proposal.assignedTo,
        subject: `Proposal rejected — ${proposal.proposalNumber}`,
        entityId: proposal.id,
      });
      toast({ title: "Proposal rejected", variant: "destructive" });
    },
  });
}

// ─── 4. Proposal: Send to customer ───────────────────────────────────────────

export function useSendProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const p = await loadProposal(proposalId);
      const now = new Date().toISOString();
      const updated: Proposal = {
        ...p,
        status: "sent",
        sentAt: now,
        updatedAt: now,
      };
      return api.put<Proposal>(`/proposals/${proposalId}`, updated);
    },
    onSuccess: async (proposal) => {
      INVALIDATE.proposal(qc, proposal.id, proposal.customerId);
      const customers = useAppStore.getState().customers;
      const customer = customers.find((c) => c.id === proposal.customerId);
      const primary = customer?.contacts?.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
      const users = useAppStore.getState().users;
      const rep = users.find((u) => u.id === proposal.assignedTo);
      await triggerAutomation("proposal_sent", {
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        proposalTitle: proposal.title,
        grandTotal: proposal.finalQuoteValue ?? proposal.grandTotal,
        validUntil: proposal.validUntil,
        customerId: proposal.customerId,
        customerName: proposal.customerName,
        customerPhone: primary?.phone,
        customerEmail: primary?.email,
        salesRepId: rep?.id,
        salesRepName: rep?.name,
        salesRepPhone: (rep as { phone?: string } | undefined)?.phone,
        companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
      });
      toast({
        title: "Proposal sent",
        description: `Shared with ${proposal.customerName}`,
      });
    },
  });
}

// ─── 5. Deal: Create from approved proposal ───────────────────────────────────

export function useCreateDealFromProposal() {
  const qc = useQueryClient();
  const me = useAppStore((s) => s.me);
  return useMutation({
    mutationFn: async (proposal: Proposal) => {
      if (proposal.dealId) {
        throw new Error("A deal already exists for this proposal");
      }
      const value = proposal.finalQuoteValue ?? proposal.grandTotal ?? 0;
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Set a valid final quote value before creating a deal");
      }
      const body = {
        name: `Deal — ${proposal.title}`,
        customerId: proposal.customerId,
        ownerUserId: proposal.assignedTo,
        teamId: proposal.teamId,
        regionId: proposal.regionId,
        stage: "Qualified",
        value,
        locked: true,
        proposalId: proposal.id,
        dealStatus: "Active",
        dealSource: "Direct",
        expectedCloseDate: null,
        priority: "Medium",
        nextFollowUpDate: null,
        lossReason: null,
        changedByUserId: me.id,
        changedByName: me.name,
        createdByUserId: me.id,
        createdByName: me.name,
        actorRole: me.role,
      };
      const deal = await api.post<Deal>("/deals", body);
      const proposalUpdated: Proposal = {
        ...proposal,
        status: "deal_created",
        dealId: deal.id,
        updatedAt: new Date().toISOString(),
      };
      await api.put<Proposal>(`/proposals/${proposal.id}`, proposalUpdated);
      return { deal, proposal: proposalUpdated };
    },
    onSuccess: ({ deal, proposal }) => {
      INVALIDATE.deal(qc, deal.id, deal.customerId);
      INVALIDATE.proposal(qc, proposal.id, proposal.customerId);
      useAppStore.getState().pushNotification({
        type: "INTERNAL_EMAIL",
        to: "admin@buildesk.com",
        subject: `Deal created from ${proposal.proposalNumber}`,
        entityId: proposal.id,
      });
      toast({
        title: "Deal created",
        description: `${deal.name} is now listed under Deals.`,
      });
    },
  });
}

// ─── 6. Deal: Update stage / pipeline status ─────────────────────────────────

export function useUpdateDealStage() {
  const qc = useQueryClient();
  const me = useAppStore((s) => s.me);
  return useMutation({
    mutationFn: async (input: {
      dealId: string;
      /** Sales stage (e.g. Qualified, Negotiation) */
      stage?: string;
      /** Pipeline card status — use "Closed/Won" / "Closed/Lost" with lossReason when applicable */
      dealStatus?: string;
      lossReason?: string | null;
      /** For automation: previous pipeline status */
      prevDealStatus?: string | null;
    }) => {
      const { dealId, stage, dealStatus, lossReason } = input;
      const body: Record<string, unknown> = {
        actorRole: me.role,
        changedByUserId: me.id,
        changedByName: me.name,
      };
      if (stage !== undefined) body.stage = stage;
      if (dealStatus !== undefined) body.dealStatus = dealStatus;
      if (lossReason !== undefined) body.lossReason = lossReason;
      return api.put<Deal>(`/deals/${dealId}`, body);
    },
    onSuccess: async (deal, vars) => {
      INVALIDATE.deal(qc, deal.id, deal.customerId);
      const prev = normalizeDealStatus(vars.prevDealStatus);
      const next = normalizeDealStatus(deal.dealStatus);
      const customers = useAppStore.getState().customers;
      const users = useAppStore.getState().users;
      const customer = customers.find((c) => c.id === deal.customerId);
      const rep = users.find((u) => u.id === deal.ownerUserId);
      const primary = customer?.contacts?.find((c) => c.isPrimary) ?? customer?.contacts?.[0];

      if (next === "Closed/Won" && prev !== "Closed/Won") {
        await triggerAutomation("deal_won", {
          dealId: deal.id,
          dealTitle: deal.name,
          dealValue: deal.value,
          customerId: deal.customerId,
          customerName: customer?.customerName ?? customer?.companyName,
          customerPhone: primary?.phone,
          customerEmail: primary?.email,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
        });
        useAppStore.getState().pushNotification({
          type: "INTERNAL_EMAIL",
          to: "finance@buildesk.com",
          subject: `Deal won — set up payment for ${customer?.companyName || customer?.customerName || deal.name}`,
          entityId: deal.id,
        });
        toast({
          title: "Deal won",
          description: `${deal.name} — assign a payment plan when ready`,
        });
      } else if (next === "Closed/Lost" && prev !== "Closed/Lost") {
        await triggerAutomation("deal_lost", {
          dealId: deal.id,
          dealTitle: deal.name,
          dealValue: deal.value,
          customerId: deal.customerId,
          customerName: customer?.customerName ?? customer?.companyName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          lossReason: deal.lossReason ?? "",
          companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
        });
        toast({ title: `Deal marked ${next}` });
      } else {
        toast({ title: "Deal updated" });
      }
    },
  });
}

// ─── 7. Payment: Record installment ──────────────────────────────────────────

export function useRecordPayment() {
  const qc = useQueryClient();
  const me = useAppStore((s) => s.me);
  return useMutation({
    mutationFn: async (payment: {
      customerId: string;
      dealId?: string;
      amountPaid: number;
      paidOn: string;
      paymentMode: string;
      transactionRef?: string;
      internalNotes?: string;
    }) => {
      const notes = [payment.internalNotes, payment.dealId ? `deal:${payment.dealId}` : ""]
        .filter(Boolean)
        .join(" | ");
      return api.post(`/payments/customer/${payment.customerId}/payment`, {
        paymentMode: payment.paymentMode,
        amountPaid: payment.amountPaid,
        paymentDate: payment.paidOn,
        transactionRef: payment.transactionRef ?? null,
        internalNotes: notes || null,
        userId: me.id,
        userName: me.name,
      });
    },
    onSuccess: (_, vars) => {
      INVALIDATE.payment(qc, vars.customerId);
      toast({ title: "Payment recorded successfully" });
    },
  });
}

// ─── 8. Customer: Status change ─────────────────────────────────────────────

export function useUpdateCustomerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, status }: { customerId: string; status: string }) => {
      return api.put<{ id: string; status?: string }>(`/customers/${customerId}`, { status });
    },
    onSuccess: (customer) => {
      INVALIDATE.customer(qc, customer.id);
      toast({ title: `Customer updated`, description: `Status: ${customer.status ?? "updated"}` });
    },
  });
}
