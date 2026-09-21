import { describe, expect, it } from "vitest";
import {
  SETUP_CONFIGURATION_GST_RATE,
  computeProposalMoneyTotals,
  setupConfigurationGstAmount,
} from "./proposalSetupCharge";

describe("setupConfigurationGstAmount", () => {
  it("applies 18% GST by default", () => {
    expect(SETUP_CONFIGURATION_GST_RATE).toBe(18);
    expect(setupConfigurationGstAmount(10_000)).toBe(1_800);
  });
});

describe("computeProposalMoneyTotals", () => {
  it("folds setup into subtotal and GST into totalTax", () => {
    const totals = computeProposalMoneyTotals(
      [{ lineTotal: 20_000, taxAmount: 3_600, qty: 1, unitPrice: 20_000, discount: 0 }],
      10_000,
    );
    expect(totals.lineSubtotal).toBe(20_000);
    expect(totals.setupCharges).toBe(10_000);
    expect(totals.subtotal).toBe(30_000);
    expect(totals.setupTax).toBe(1_800);
    expect(totals.lineTax).toBe(3_600);
    expect(totals.totalTax).toBe(5_400);
    expect(totals.grandTotal).toBe(35_400);
  });
});
