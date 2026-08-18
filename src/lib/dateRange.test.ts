import { describe, expect, it } from "vitest";
import {
  hydrateTimeRange,
  inferTimeRangePreset,
  parseTimeRangeFromSearchParams,
  resolveTimeRangeYmd,
  ymdBoundsForTimeRange,
} from "@/lib/dateRange";

const now = new Date(2026, 7, 18); // Tue 18 Aug 2026

describe("time range presets", () => {
  it("resolves this week as Sunday–Saturday", () => {
    expect(ymdBoundsForTimeRange("this_week", now)).toEqual({ from: "2026-08-16", to: "2026-08-22" });
  });

  it("resolves this month, this year, and previous year", () => {
    expect(ymdBoundsForTimeRange("this_month", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(ymdBoundsForTimeRange("this_year", now)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(ymdBoundsForTimeRange("previous_year", now)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("treats all-time as empty bounds and custom as the provided dates", () => {
    expect(resolveTimeRangeYmd("all", "2026-01-01", "2026-01-31", now)).toEqual({ from: "", to: "" });
    expect(resolveTimeRangeYmd("custom", "2026-03-01", "2026-03-15", now)).toEqual({
      from: "2026-03-01",
      to: "2026-03-15",
    });
  });

  it("infers a matching preset from concrete dates", () => {
    expect(inferTimeRangePreset("2026-08-01", "2026-08-31", now)).toBe("this_month");
    expect(inferTimeRangePreset("", "", now)).toBe("all");
    expect(inferTimeRangePreset("2026-03-01", "2026-03-15", now)).toBe("custom");
  });

  it("rehydrates a stored this_month preset without locking last month's dates", () => {
    expect(hydrateTimeRange({ timeRangeFilter: "this_month", dateFrom: "2026-07-01", dateTo: "2026-07-31" }, now)).toEqual({
      preset: "this_month",
      customFrom: "",
      customTo: "",
    });
  });

  it("parses range from search params", () => {
    expect(parseTimeRangeFromSearchParams(new URLSearchParams("range=this_year"))).toEqual({
      preset: "this_year",
      customFrom: "",
      customTo: "",
    });
    expect(parseTimeRangeFromSearchParams(new URLSearchParams("from=2026-03-01&to=2026-03-15"))).toEqual({
      preset: "custom",
      customFrom: "2026-03-01",
      customTo: "2026-03-15",
    });
  });
});
