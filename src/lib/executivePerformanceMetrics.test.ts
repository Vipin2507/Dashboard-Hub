import { describe, expect, it } from "vitest";
import {
  avgDealSize,
  buildEmptyTrend,
  dateToYmd,
  inInclusiveYmdRange,
  isClosedLost,
  isClosedWon,
  isPipelineStatus,
  isValidYmd,
  matchesWeekdayFilter,
  normalizeReasonLabel,
  timestampToYmd,
  weekdayFromYmd,
  winRate,
} from "./executivePerformanceMetrics";

describe("executivePerformanceMetrics", () => {
  it("validates ymd and weekday boundaries", () => {
    expect(isValidYmd("2026-07-01")).toBe(true);
    expect(isValidYmd("2026-02-30")).toBe(false);
    expect(isValidYmd("bad")).toBe(false);
    expect(weekdayFromYmd("2026-07-18")).toBe(6); // Saturday
    expect(dateToYmd(new Date(2026, 6, 18))).toBe("2026-07-18");
  });

  it("parses timestamps to local ymd", () => {
    expect(timestampToYmd("2026-07-18")).toBe("2026-07-18");
    expect(timestampToYmd("2026-07-18T15:30:00")).toBe("2026-07-18");
    expect(timestampToYmd("2026-07-18 09:00:00")).toBe("2026-07-18");
    expect(timestampToYmd(null)).toBeNull();
  });

  it("applies inclusive range and weekday filters", () => {
    expect(inInclusiveYmdRange("2026-07-15", "2026-07-01", "2026-07-31")).toBe(true);
    expect(inInclusiveYmdRange("2026-06-30", "2026-07-01", "2026-07-31")).toBe(false);
    expect(matchesWeekdayFilter("2026-07-18", 6)).toBe(true);
    expect(matchesWeekdayFilter("2026-07-18", 1)).toBe(false);
    expect(matchesWeekdayFilter("2026-07-18", null)).toBe(true);
  });

  it("normalizes reason labels", () => {
    expect(normalizeReasonLabel("")).toBe("Unspecified");
    expect(normalizeReasonLabel("  Price  ")).toBe("Price");
    expect(normalizeReasonLabel("x".repeat(81))).toBe("Other");
  });

  it("computes win rate and average deal size safely", () => {
    expect(winRate(3, 1)).toBe(75);
    expect(winRate(0, 0)).toBe(0);
    expect(winRate(1, 2)).toBe(33.3);
    expect(avgDealSize(1000, 4)).toBe(250);
    expect(avgDealSize(100, 0)).toBe(0);
  });

  it("classifies deal statuses", () => {
    expect(isClosedWon("Closed/Won")).toBe(true);
    expect(isClosedLost("Closed/Lost")).toBe(true);
    expect(isPipelineStatus("Hot")).toBe(true);
    expect(isPipelineStatus("Closed/Won")).toBe(false);
  });

  it("builds contiguous empty trend days", () => {
    const trend = buildEmptyTrend("2026-07-01", "2026-07-03");
    expect(trend.map((t) => t.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(trend[0].wonValue).toBe(0);
  });
});
