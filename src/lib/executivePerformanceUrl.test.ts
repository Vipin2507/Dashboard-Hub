import { describe, expect, it } from "vitest";
import { yearToDateYmd } from "@/lib/dateRange";
import {
  executiveFiltersToSearchParams,
  readExecutiveFiltersFromParams,
} from "./executivePerformanceUrl";

describe("executivePerformanceUrl", () => {
  it("defaults to year-to-date and all scopes", () => {
    const ytd = yearToDateYmd();
    const filters = readExecutiveFiltersFromParams(new URLSearchParams());
    expect(filters.from).toBe(ytd.from);
    expect(filters.to).toBe(ytd.to);
    expect(filters.executiveId).toBe("all");
    expect(filters.weekday).toBe("all");
  });

  it("round-trips applied filters and tab into URL params", () => {
    const filters = {
      from: "2026-07-01",
      to: "2026-07-18",
      executiveId: "u1",
      teamId: "t1",
      regionId: "all",
      weekday: "6",
      reasonType: "loss",
      reason: "Price",
    };
    const params = executiveFiltersToSearchParams(filters, "comparison");
    expect(params.get("from")).toBe("2026-07-01");
    expect(params.get("executive")).toBe("u1");
    expect(params.get("team")).toBe("t1");
    expect(params.get("region")).toBeNull();
    expect(params.get("weekday")).toBe("6");
    expect(params.get("reasonType")).toBe("loss");
    expect(params.get("reason")).toBe("Price");
    expect(params.get("tab")).toBe("comparison");

    const restored = readExecutiveFiltersFromParams(params);
    expect(restored).toEqual(filters);
  });

  it("omits overview tab from the URL", () => {
    const ytd = yearToDateYmd();
    const params = executiveFiltersToSearchParams(
      {
        from: ytd.from,
        to: ytd.to,
        executiveId: "all",
        teamId: "all",
        regionId: "all",
        weekday: "all",
        reasonType: "all",
        reason: "all",
      },
      "overview",
    );
    expect(params.get("tab")).toBeNull();
  });
});
