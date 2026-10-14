import { describe, expect, it } from "vitest";
import {
  buildProposalFollowUpEmailBody,
  buildProposalFollowUpWhatsApp,
  proposalFollowUpFields,
} from "@/lib/proposalFollowUp";

describe("proposalFollowUp", () => {
  const fields = proposalFollowUpFields(
    {
      customerName: "Riya <Shah>",
      customerCompanyName: "Acme & Co",
      finalQuoteValue: 250000,
      grandTotal: 100000,
      createdAt: "2026-03-10T12:00:00",
    },
    "Fallback Co",
  );

  it("fills company, value, and creation date", () => {
    expect(fields.customerName).toBe("Riya <Shah>");
    expect(fields.companyName).toBe("Acme & Co");
    expect(fields.proposalValue).toBe("2,50,000");
    expect(fields.creationDate).toBe("10/03/2026");
  });

  it("renders the email follow-up with the proposal details", () => {
    const body = buildProposalFollowUpEmailBody(fields);
    expect(body).toContain("Dear Riya <Shah>,");
    expect(body).toContain("Greetings from Buildesk!");
    expect(body).toContain("proposal shared with Acme & Co");
    expect(body).toContain("Please find the proposal PDF attached");
    expect(body).toContain("- Proposal Value: ₹2,50,000");
    expect(body).toContain("- Proposal Creation Date: 10/03/2026");
    expect(body).toContain("If the deal has already been created in Buildesk, please disregard this follow-up message.");
    expect(body).toContain("Team Buildesk");
    expect(body).toContain("Customer Relationship Management System");
  });

  it("renders the WhatsApp follow-up with the requested formatting", () => {
    const text = buildProposalFollowUpWhatsApp(fields);
    expect(text).toContain("Hello Riya <Shah>! 👋");
    expect(text).toContain("Greetings from *Buildesk*.");
    expect(text).toContain("Please find the proposal PDF attached.");
    expect(text).toContain("📋 *Proposal Details*");
    expect(text).toContain("• *Proposal Value:* ₹2,50,000");
    expect(text).toContain("• *Creation Date:* 10/03/2026");
    expect(text).toContain("✅ *Already created?*");
    expect(text).toContain("*Team Buildesk*");
  });
});
