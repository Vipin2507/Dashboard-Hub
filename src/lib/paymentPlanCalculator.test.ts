import { describe, expect, it } from "vitest";
import { calculateInstallments } from "./paymentPlanCalculator";

const sumAmounts = (xs: { amount: number }[]) =>
  Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;
const sumPct = (xs: { percentage: number }[]) =>
  Math.round(xs.reduce((s, x) => s + x.percentage, 0) * 100) / 100;

describe("paymentPlanCalculator — Part 5 verification scenarios", () => {
  it("Scenario 1 — Quarterly, Even Split (₹57,600 / 4)", () => {
    const out = calculateInstallments({
      slug: "quarterly",
      planName: "Quarterly (4 payments)",
      totalAmount: 57600,
      startDate: "2026-05-01",
      installmentCount: 4,
      distributionMode: "even",
    });

    expect(out).toHaveLength(4);
    expect(out.map((r) => r.amount)).toEqual([14400, 14400, 14400, 14400]);
    expect(out.map((r) => r.percentage)).toEqual([25, 25, 25, 25]);
    expect(out.map((r) => r.dueDate)).toEqual([
      "2026-05-01",
      "2026-08-01",
      "2026-11-01",
      "2027-02-01",
    ]);
    expect(out.map((r) => r.label)).toEqual([
      "Q1 Payment",
      "Q2 Payment",
      "Q3 Payment",
      "Q4 Payment",
    ]);
    expect(sumAmounts(out)).toBe(57600);
    expect(sumPct(out)).toBe(100);
  });

  it("Scenario 2 — Quarterly, Advance 40% + Equal (₹57,600)", () => {
    const out = calculateInstallments({
      slug: "quarterly",
      planName: "Quarterly (4 payments)",
      totalAmount: 57600,
      startDate: "2026-05-01",
      installmentCount: 4,
      distributionMode: "advance_then_equal",
      advancePercent: 40,
    });

    expect(out).toHaveLength(4);
    expect(out.map((r) => r.amount)).toEqual([23040, 11520, 11520, 11520]);
    expect(out.map((r) => r.percentage)).toEqual([40, 20, 20, 20]);
    expect(out.map((r) => r.dueDate)).toEqual([
      "2026-05-01",
      "2026-08-01",
      "2026-11-01",
      "2027-02-01",
    ]);
    expect(out[0].label).toBe("Advance (40%)");
    expect(out[1].label).toBe("Installment 1 of 3");
    expect(out[2].label).toBe("Installment 2 of 3");
    expect(out[3].label).toBe("Installment 3 of 3");
    expect(sumAmounts(out)).toBe(57600);
  });

  it("Scenario 3 — Monthly, 12 payments (₹57,600)", () => {
    const out = calculateInstallments({
      slug: "monthly",
      planName: "Monthly (12 payments)",
      totalAmount: 57600,
      startDate: "2026-05-01",
      installmentCount: 12,
      distributionMode: "even",
    });

    expect(out).toHaveLength(12);
    expect(out.every((r) => r.amount === 4800)).toBe(true);
    expect(sumAmounts(out)).toBe(57600);
    expect(out.map((r) => r.dueDate)).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
      "2027-04-01",
    ]);
    expect(out.map((r) => r.label)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Month ${i + 1} Payment`),
    );
  });

  it("Scenario 4 — Custom 3 installments, 2-month interval, [50,30,20] of ₹90,000", () => {
    const out = calculateInstallments({
      slug: "custom",
      planName: "Custom",
      totalAmount: 90000,
      startDate: "2026-04-15",
      installmentCount: 3,
      intervalMonths: 2,
      distributionMode: "custom_percent",
      customPercentages: [50, 30, 20],
    });

    expect(out).toHaveLength(3);
    expect(out.map((r) => r.amount)).toEqual([45000, 27000, 18000]);
    expect(out.map((r) => r.percentage)).toEqual([50, 30, 20]);
    expect(out.map((r) => r.dueDate)).toEqual([
      "2026-04-15",
      "2026-06-15",
      "2026-08-15",
    ]);
    expect(out.map((r) => r.label)).toEqual([
      "Installment 1 of 3",
      "Installment 2 of 3",
      "Installment 3 of 3",
    ]);
    expect(sumAmounts(out)).toBe(90000);
  });

  it("Edge — even split absorbs rounding remainder on the last row", () => {
    const out = calculateInstallments({
      slug: "quarterly",
      planName: "Quarterly",
      totalAmount: 100,
      startDate: "2026-01-01",
      installmentCount: 4,
      distributionMode: "even",
    });
    // 100 / 4 = 25, no rounding needed.
    expect(out.map((r) => r.amount)).toEqual([25, 25, 25, 25]);
    expect(sumAmounts(out)).toBe(100);

    const odd = calculateInstallments({
      slug: "monthly",
      planName: "Monthly",
      totalAmount: 100,
      startDate: "2026-01-01",
      installmentCount: 12,
      distributionMode: "even",
    });
    // floor(100/12 * 100)/100 = 8.33; remainder = 100 - 8.33*12 = 0.04 → goes to last
    expect(odd[0].amount).toBe(8.33);
    expect(odd[11].amount).toBeCloseTo(8.37, 2);
    expect(sumAmounts(odd)).toBe(100);
  });

  it("Edge — custom_percent rejects sums that don't equal 100", () => {
    expect(() =>
      calculateInstallments({
        slug: "custom",
        planName: "Bad",
        totalAmount: 1000,
        startDate: "2026-01-01",
        installmentCount: 3,
        intervalMonths: 1,
        distributionMode: "custom_percent",
        customPercentages: [50, 30, 10],
      }),
    ).toThrow(/100/);
  });

  it("Edge — addMonths handles month-end overflow (Jan 31 → Feb)", () => {
    const out = calculateInstallments({
      slug: "monthly",
      planName: "Monthly",
      totalAmount: 1200,
      startDate: "2026-01-31",
      installmentCount: 12,
      distributionMode: "even",
    });
    // Feb has no 31, so addMonths should clamp to last day of Feb.
    expect(out[1].dueDate).toBe("2026-02-28");
    // March has 31 — but we're stepping from Jan 31 each time, so March = 2026-03-31.
    expect(out[2].dueDate).toBe("2026-03-31");
  });
});
