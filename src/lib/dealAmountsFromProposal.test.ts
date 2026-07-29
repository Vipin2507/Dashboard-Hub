import { describe, expect, it } from "vitest";
import { dealAmountsFromProposal, dealAmountsFromInclusiveTotal, dealNeedsTaxSplitFix } from "./dealAmountsFromProposal";
import type { Proposal } from "@/types";

function baseProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    proposalNumber: "P-1",
    title: "Test",
    customerId: "c1",
    customerName: "Acme",
    assignedTo: "u1",
    assignedToName: "Rep",
    regionId: "r1",
    teamId: "t1",
    status: "approved",
    validUntil: "2026-12-31",
    lineItems: [
      {
        id: "li1",
        inventoryItemId: "inv1",
        name: "CRM",
        sku: "CRM",
        qty: 1,
        unitPrice: 10000,
        taxRate: 18,
        discount: 0,
        lineTotal: 10000,
        taxAmount: 1800,
      },
    ],
    setupDeploymentCharges: 200,
    subtotal: 10000,
    totalDiscount: 0,
    totalTax: 1800,
    grandTotal: 12000,
    notes: "",
    versions: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    createdBy: "u1",
    ...overrides,
  } as Proposal;
}

describe("dealAmountsFromProposal", () => {
  it("splits proposal subtotal+setup and tax into deal finance fields", () => {
    const amounts = dealAmountsFromProposal(baseProposal());
    expect(amounts.amountWithoutTax).toBe(10200);
    expect(amounts.taxAmount).toBe(1800);
    expect(amounts.totalAmount).toBe(12000);
  });

  it("scales split when deal value differs from grand total", () => {
    const amounts = dealAmountsFromProposal(baseProposal(), 6000);
    expect(amounts.totalAmount).toBe(6000);
    expect(amounts.amountWithoutTax + amounts.taxAmount).toBeCloseTo(6000, 2);
    expect(amounts.taxAmount).toBeGreaterThan(0);
    expect(amounts.amountWithoutTax).toBeGreaterThan(0);
  });

  it("uses finalQuoteValue when dealValue omitted", () => {
    const amounts = dealAmountsFromProposal(baseProposal({ finalQuoteValue: 11000 }));
    expect(amounts.totalAmount).toBe(11000);
    expect(amounts.amountWithoutTax + amounts.taxAmount).toBeCloseTo(11000, 2);
  });
});

describe("dealAmountsFromInclusiveTotal / dealNeedsTaxSplitFix", () => {
  it("reverse-splits inclusive GST total", () => {
    const amounts = dealAmountsFromInclusiveTotal(11800, 18);
    expect(amounts.totalAmount).toBe(11800);
    expect(amounts.amountWithoutTax).toBe(10000);
    expect(amounts.taxAmount).toBe(1800);
  });

  it("detects deals that only have total", () => {
    expect(dealNeedsTaxSplitFix({ value: 10000, totalAmount: 10000, taxAmount: 0, amountWithoutTax: 0 })).toBe(true);
    expect(dealNeedsTaxSplitFix({ value: 10000, totalAmount: 10000, taxAmount: 0, amountWithoutTax: 10000 })).toBe(true);
    expect(dealNeedsTaxSplitFix({ value: 11800, totalAmount: 11800, taxAmount: 1800, amountWithoutTax: 10000 })).toBe(false);
  });
});
