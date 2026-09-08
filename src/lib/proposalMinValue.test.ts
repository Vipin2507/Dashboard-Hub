import { describe, expect, it } from "vitest";
import {
  isProposalBelowMinimumTotal,
  MIN_PROPOSAL_TOTAL_VALUE,
  proposalTotalValue,
} from "./proposalMinValue";

describe("proposalMinValue", () => {
  it("uses finalQuoteValue when set", () => {
    expect(proposalTotalValue({ finalQuoteValue: 30_000, grandTotal: 10_000 })).toBe(30_000);
  });

  it("falls back to grandTotal", () => {
    expect(proposalTotalValue({ grandTotal: 25_000 })).toBe(25_000);
  });

  it("blocks totals below the minimum", () => {
    expect(isProposalBelowMinimumTotal({ grandTotal: MIN_PROPOSAL_TOTAL_VALUE - 1 })).toBe(true);
    expect(isProposalBelowMinimumTotal({ grandTotal: MIN_PROPOSAL_TOTAL_VALUE })).toBe(false);
  });
});
