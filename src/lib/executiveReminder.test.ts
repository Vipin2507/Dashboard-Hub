import { describe, expect, it } from "vitest";
import {
  buildExecutiveReminderDraft,
  filterUnconvertedProposals,
  isUnconvertedProposal,
  normalizeWhatsAppPhone,
} from "@/lib/executiveReminder";
import type { Proposal } from "@/types";

function proposal(partial: Partial<Proposal> & Pick<Proposal, "id" | "status" | "assignedTo" | "createdAt">): Proposal {
  return {
    proposalNumber: partial.proposalNumber || "PROP-0001",
    title: "Test",
    customerId: "c1",
    customerName: "Acme",
    customerCompanyName: "Acme Pvt Ltd",
    assignedToName: "Rep",
    lineItems: [],
    setupDeploymentCharges: 0,
    subtotal: 100000,
    totalDiscount: 0,
    totalTax: 18000,
    grandTotal: 118000,
    versionHistory: [],
    currentVersion: 1,
    updatedAt: partial.createdAt,
    validUntil: "",
    ...partial,
  } as Proposal;
}

describe("executiveReminder", () => {
  it("treats shared/approved without deal as unconverted", () => {
    expect(isUnconvertedProposal(proposal({ id: "1", status: "shared", assignedTo: "u1", createdAt: "2026-08-01T00:00:00" }))).toBe(true);
    expect(isUnconvertedProposal(proposal({ id: "2", status: "approved", assignedTo: "u1", createdAt: "2026-08-01T00:00:00" }))).toBe(true);
    expect(isUnconvertedProposal(proposal({ id: "3", status: "won", assignedTo: "u1", createdAt: "2026-08-01T00:00:00" }))).toBe(false);
    expect(
      isUnconvertedProposal(
        proposal({ id: "4", status: "shared", assignedTo: "u1", createdAt: "2026-08-01T00:00:00", dealId: "d1" }),
      ),
    ).toBe(false);
  });

  it("filters by executive and created date range", () => {
    const rows = [
      proposal({ id: "a", status: "sent", assignedTo: "u1", createdAt: "2026-08-10T10:00:00", proposalNumber: "PROP-A" }),
      proposal({ id: "b", status: "sent", assignedTo: "u1", createdAt: "2026-07-10T10:00:00", proposalNumber: "PROP-B" }),
      proposal({ id: "c", status: "sent", assignedTo: "u2", createdAt: "2026-08-10T10:00:00", proposalNumber: "PROP-C" }),
    ];
    const filtered = filterUnconvertedProposals(rows, { executiveId: "u1", from: "2026-08-01", to: "2026-08-31" });
    expect(filtered.map((p) => p.id)).toEqual(["a"]);
  });

  it("builds reminder copy with proposal list", () => {
    const draft = buildExecutiveReminderDraft({
      executive: { id: "u1", name: "Riya", email: "riya@test.com", phone: "9876543210" },
      from: "2026-08-01",
      to: "2026-08-31",
      proposals: [
        proposal({
          id: "a",
          status: "approved",
          assignedTo: "u1",
          createdAt: "2026-08-10T10:00:00",
          proposalNumber: "PROP-0637",
          title: "PROP-0637 || Acme_CRM",
        }),
      ],
      senderName: "Admin",
    });
    expect(draft.emailSubject).toContain("1 open proposal");
    expect(draft.emailBody).toContain("Hi Riya");
    expect(draft.emailBody).toContain("PROP-0637 || Acme_CRM");
    expect(draft.emailBody).not.toContain("excl. GST | Created");
    expect(draft.whatsappMessage).toContain("*1* open proposal");
  });

  it("uses automation templates when provided", () => {
    const draft = buildExecutiveReminderDraft({
      executive: { id: "u1", name: "Riya", email: "riya@test.com" },
      from: "2026-08-01",
      to: "2026-08-31",
      proposals: [],
      senderName: "Admin",
      templates: [
        {
          id: "t-email",
          name: "Email",
          trigger: "executive_open_proposals_reminder",
          channel: "email",
          recipients: ["sales_rep"],
          isActive: true,
          subject: "Ping {{executive_name}} — {{open_proposal_count}}",
          body: "Hello {{executive_name}}, count={{open_proposal_count}}",
          createdAt: "2026-08-20T00:00:00Z",
          updatedAt: "2026-08-20T00:00:00Z",
        },
        {
          id: "t-wa",
          name: "WA",
          trigger: "executive_open_proposals_reminder",
          channel: "whatsapp",
          recipients: ["sales_rep"],
          isActive: true,
          body: "WA {{executive_name}} {{period_label}}",
          createdAt: "2026-08-20T00:00:00Z",
          updatedAt: "2026-08-20T00:00:00Z",
        },
      ],
    });
    expect(draft.emailSubject).toBe("Ping Riya — 0");
    expect(draft.emailBody).toContain("Hello Riya, count=0");
    expect(draft.whatsappMessage).toContain("WA Riya");
  });

  it("normalizes Indian phone numbers for WhatsApp", () => {
    expect(normalizeWhatsAppPhone("9876543210")).toBe("919876543210");
    expect(normalizeWhatsAppPhone("+91 98765 43210")).toBe("919876543210");
  });
});
