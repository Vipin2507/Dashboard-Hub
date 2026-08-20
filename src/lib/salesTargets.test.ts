import { describe, expect, it } from "vitest";
import {
  buildTargetVsAchievementMetrics,
  enumerateYearMonths,
  formatTargetPeriodLabel,
  isValidYearMonth,
} from "../../server/salesTargetsLib.js";

describe("salesTargetsLib", () => {
  it("validates year-month strings", () => {
    expect(isValidYearMonth("2026-08")).toBe(true);
    expect(isValidYearMonth("2026-13")).toBe(false);
    expect(isValidYearMonth("bad")).toBe(false);
  });

  it("enumerates months in an inclusive range", () => {
    expect(enumerateYearMonths("2026-01-15", "2026-03-02")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(enumerateYearMonths("2025-11-01", "2026-02-28")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("formats period labels", () => {
    expect(formatTargetPeriodLabel("2026-08-01", "2026-08-31")).toMatch(/Aug 2026/);
    expect(formatTargetPeriodLabel("2026-08-01", "2026-09-15")).toContain("–");
  });

  it("builds achievement metrics with percentages", () => {
    const result = buildTargetVsAchievementMetrics({
      hasTargets: true,
      achieved: {
        proposalsSentTarget: 40,
        proposalsWonTarget: 8,
        revenueExclGstTarget: 500000,
      },
      targets: {
        proposalsSentTarget: 50,
        proposalsWonTarget: 10,
        revenueExclGstTarget: 1000000,
      },
    });
    expect(result.metrics[0].pct).toBe(80);
    expect(result.metrics[1].pct).toBe(80);
    expect(result.metrics[2].pct).toBe(50);
  });
});
