import { describe, expect, it } from "vitest";
import { flattenDealHeaders, parseMoney, parseDateCell } from "./bulkDealExcel";

describe("bulkDealExcel CRM headers", () => {
  it("flattens two-row CRM headers into Amount / With GST fields", () => {
    const matrix = [
      [
        "Date",
        "Client Id from CRM Admin",
        "Customer Name/Company Name",
        "Subscription/Contact Period",
        "",
        "Subscribed Modules",
        "Licenses",
        "",
        "Total Deal Value",
        "Total Deal Value",
        "Annual Payment (Paid)",
        "",
        "Outstanding Payment (Due)",
        "Assigned Team",
        "Sales Agent",
        "Status",
      ],
      [
        "",
        "",
        "",
        "Start date",
        "End Date",
        "",
        "No of Licenses",
        "Active Licenses",
        "Amount",
        "With GST",
        "Date",
        "Amount",
        "",
        "",
        "",
        "",
      ],
      ["2025-11-01", "CRM-1", "Acme", "2025-11-01", "2026-10-31", "ERP", "10", "10", "100000", "118000", "2025-11-15", "50000", "68000", "West", "Amit", "Active"],
    ];
    const { headers, dataStartRow } = flattenDealHeaders(matrix);
    expect(dataStartRow).toBe(2);
    expect(headers.some((h) => /total deal value amount/i.test(h))).toBe(true);
    expect(headers.some((h) => /with gst/i.test(h))).toBe(true);
    expect(headers.some((h) => /annual payment.*amount/i.test(h))).toBe(true);
  });

  it("parses money and dates used in CRM sheets", () => {
    expect(parseMoney("1,18,000")).toBe(118000);
    expect(parseMoney("₹ 100000")).toBe(100000);
    expect(parseDateCell("15/11/2025")).toBe("2025-11-15");
    expect(parseDateCell("2025-11-15")).toBe("2025-11-15");
  });
});
