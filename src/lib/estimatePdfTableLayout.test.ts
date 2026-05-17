import jsPDF from "jspdf";
import { describe, expect, it } from "vitest";
import {
  computeEstimatePdfItemColumnWidths,
  formatEstimatePdfInr,
  PDF_CELL_PAD_LR_MM,
} from "./estimatePdfTableLayout";

describe("estimatePdfTableLayout", () => {
  it("formats INR with Rs. prefix, grouping, and two decimals (ASCII for PDF fonts)", () => {
    expect(formatEstimatePdfInr(10)).toBe("Rs.10.00");
    expect(formatEstimatePdfInr(1000)).toBe("Rs.1,000.00");
    expect(formatEstimatePdfInr(8850)).toBe("Rs.8,850.00");
    expect(formatEstimatePdfInr(104430)).toBe("Rs.1,04,430.00");
  });

  it("sums line-item column widths to content width", () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const contentW = 180;

    const narrow: Parameters<typeof computeEstimatePdfItemColumnWidths>[2] = [
      { description: "A", hsnSac: "9983", qty: 1, unit: "Nos", rate: 100, amount: 100 },
    ];
    const wNarrow = computeEstimatePdfItemColumnWidths(doc, contentW, narrow);
    expect(wNarrow.reduce((a, b) => a + b, 0)).toBeCloseTo(contentW, 5);

    const wide: Parameters<typeof computeEstimatePdfItemColumnWidths>[2] = [
      {
        description: "Long item name",
        hsnSac: "998314",
        qty: 12.5,
        unit: "Square Metre",
        rate: 104430,
        amount: 104430 * 12.5,
      },
    ];
    const wWide = computeEstimatePdfItemColumnWidths(doc, contentW, wide);
    expect(wWide.reduce((a, b) => a + b, 0)).toBeCloseTo(contentW, 5);
    expect(wWide[4]).toBeGreaterThanOrEqual(wNarrow[4]);
    expect(wWide[5]).toBeGreaterThanOrEqual(wNarrow[5]);
    expect(wWide[1]).toBeGreaterThan(20);
  });

  it("expands rate/amount columns for large values vs small values", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const contentW = 180;
    const small = computeEstimatePdfItemColumnWidths(doc, contentW, [
      { description: "X", qty: 1, unit: "Nos", rate: 10, amount: 10 },
    ]);
    const large = computeEstimatePdfItemColumnWidths(doc, contentW, [
      { description: "X", qty: 1, unit: "Nos", rate: 104430, amount: 104430 },
    ]);
    expect(large[4]).toBeGreaterThanOrEqual(small[4]);
    expect(large[5]).toBeGreaterThanOrEqual(small[5]);
  });

  it("uses ~10px horizontal padding constant in mm", () => {
    expect(PDF_CELL_PAD_LR_MM).toBeCloseTo((10 * 25.4) / 96, 4);
  });
});
