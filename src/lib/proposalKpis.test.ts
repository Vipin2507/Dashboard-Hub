import { describe, expect, it } from "vitest";
import { computeProposalKpis } from "@/lib/proposalKpis";

function row(partial: {
  status: string;
  createdAt: string;
  updatedAt?: string;
  valueExclGst?: number;
}) {
  return { valueExclGst: 100_000, ...partial };
}

describe("computeProposalKpis", () => {
  it("applies the created-date window to total, pending, won, and pipeline", () => {
    const rows = [
      row({ status: "sent", createdAt: "2026-08-02T10:00:00", valueExclGst: 50_000 }),
      row({ status: "approval_pending", createdAt: "2026-07-20T10:00:00", valueExclGst: 20_000 }),
      row({ status: "won", createdAt: "2026-07-05T10:00:00", updatedAt: "2026-08-10T12:00:00", valueExclGst: 80_000 }),
      row({ status: "deal_created", createdAt: "2026-08-03T10:00:00", updatedAt: "2026-08-03T10:01:00", valueExclGst: 40_000 }),
      row({ status: "rejected", createdAt: "2026-08-04T10:00:00", valueExclGst: 10_000 }),
      row({ status: "won", createdAt: "2026-07-01T10:00:00", updatedAt: "2026-07-15T10:00:00", valueExclGst: 5_000 }),
    ];

    const kpi = computeProposalKpis(rows, "2026-08-01", "2026-08-31");

    expect(kpi.total).toBe(3);
    expect(kpi.pending).toBe(0);
    expect(kpi.won).toBe(1);
    expect(kpi.totalValue).toBe(50_000);
  });
});
