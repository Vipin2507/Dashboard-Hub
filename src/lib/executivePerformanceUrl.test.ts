import { describe, expect, it } from "vitest";
import { currentMonthYmd } from "@/lib/dateRange";
import {
  executiveFiltersToSearchParams,
  readExecutiveFiltersFromParams,
} from "./executivePerformanceUrl";

const base = {
  executiveId: "all" as const,
  teamId: "all" as const,
  regionId: "all" as const,
  weekday: "all" as const,
  reasonType: "all" as const,
  reason: "all" as const,
};

describe("executivePerformanceUrl", () => {
  it("defaults to current month and all scopes", () => {
    const month = currentMonthYmd();
    const filters = readExecutiveFiltersFromParams(new URLSearchParams());
    expect(filters.range).toBe("this_month");
    expect(filters.from).toBe(month.from);
    expect(filters.to).toBe(month.to);
    expect(filters.executiveId).toBe("all");
    expect(filters.weekday).toBe("all");
  });

  it("round-trips applied filters and tab into URL params", () => {
    const filters = {
      range: "custom" as const,
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
    expect(params.get("range")).toBeNull();
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
    const month = currentMonthYmd();
    const params = executiveFiltersToSearchParams(
      {
        range: "this_month",
        from: month.from,
        to: month.to,
        ...base,
      },
      "overview",
    );
    expect(params.get("tab")).toBeNull();
    expect(params.get("range")).toBe("this_month");
    expect(params.get("from")).toBeNull();
  });

  it("encodes cleared date range as all-time", () => {
    const params = executiveFiltersToSearchParams(
      {
        range: "all",
        from: "",
        to: "",
        ...base,
      },
      "overview",
    );
    expect(params.get("range")).toBe("all");
    expect(params.get("from")).toBeNull();
    expect(readExecutiveFiltersFromParams(params)).toMatchObject({ range: "all", from: "", to: "" });
  });

  it("reads this_year from the range query param", () => {
    const filters = readExecutiveFiltersFromParams(new URLSearchParams("range=this_year"));
    expect(filters.range).toBe("this_year");
    expect(filters.from).toBe(`${new Date().getFullYear()}-01-01`);
  });
});
