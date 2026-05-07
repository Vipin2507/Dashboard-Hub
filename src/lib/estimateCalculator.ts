import type { EstimateLineItem, EstimateTotals, TaxBreakdownRow } from "@/types/estimate";

export function calculateEstimateTotals(lineItems: EstimateLineItem[], gstType: "intra" | "inter"): EstimateTotals {
  const subTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const taxGroups: Record<number, number> = {};
  lineItems.forEach((item) => {
    const key = Number(item.taxRate) || 0;
    taxGroups[key] = (taxGroups[key] ?? 0) + (Number(item.amount) || 0);
  });

  const taxBreakdown: TaxBreakdownRow[] = [];
  let totalTax = 0;

  if (gstType === "intra") {
    Object.entries(taxGroups).forEach(([rateStr, taxableAmount]) => {
      const rate = Number(rateStr);
      if (!Number.isFinite(rate) || rate === 0) return;
      const halfRate = rate / 2;
      const halfTax = (taxableAmount * halfRate) / 100;
      taxBreakdown.push({ label: `CGST${halfRate} (${halfRate}%)`, amount: halfTax });
      taxBreakdown.push({ label: `SGST${halfRate} (${halfRate}%)`, amount: halfTax });
      totalTax += halfTax * 2;
    });

    return {
      subTotal,
      cgst: totalTax / 2,
      sgst: totalTax / 2,
      taxBreakdown,
      grandTotal: subTotal + totalTax,
    };
  }

  Object.entries(taxGroups)
    .sort(([a], [b]) => Number(b) - Number(a))
    .forEach(([rateStr, taxableAmount]) => {
      const rate = Number(rateStr);
      if (!Number.isFinite(rate)) return;
      const tax = (taxableAmount * rate) / 100;
      taxBreakdown.push({ label: `IGST${rate} (${rate}%)`, amount: tax });
      totalTax += tax;
    });

  return {
    subTotal,
    igst: totalTax,
    taxBreakdown,
    grandTotal: subTotal + totalTax,
  };
}

export function numberToWords(num: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";

  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? ` ${convert(n % 100)}` : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? ` ${convert(n % 1000)}` : "");
    if (n < 10000000)
      return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? ` ${convert(n % 100000)}` : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? ` ${convert(n % 10000000)}` : "");
  }

  const intPart = Math.floor(num);
  const fracPart = Math.round((num - intPart) * 100);

  let result = `${convert(intPart)} Rupees`;
  if (fracPart > 0) result += ` and ${convert(fracPart)} Paise`;
  return `${result} Only`;
}

