import type { jsPDF } from "jspdf";

/** 1 CSS px in mm at 96dpi (jsPDF default screen mapping). */
export const PDF_PX_MM = 25.4 / 96;

/** Horizontal cell padding: 10px left + right (see generateEstimatePdf). */
export const PDF_CELL_PAD_LR_MM = 10 * PDF_PX_MM;

/** Minimum body row height: 30px. */
export const PDF_MIN_BODY_ROW_H_MM = 30 * PDF_PX_MM;

/** Target column weight sum (5+35+12+10+12+15); widths are normalized to `contentWidthMm`. */
export const ESTIMATE_ITEM_COL_WEIGHTS = [5, 35, 12, 10, 12, 15] as const;
const WEIGHT_SUM = ESTIMATE_ITEM_COL_WEIGHTS.reduce((a, b) => a + b, 0);

function maxLineTextWidthMm(
  doc: jsPDF,
  text: string,
  fontSize: number,
  fontStyle: "normal" | "bold" = "normal",
): number {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  let max = 0;
  for (const line of String(text).split("\n")) {
    max = Math.max(max, doc.getTextWidth(line));
  }
  return max;
}

export type EstimatePdfLineItemForLayout = {
  description: string;
  hsnSac?: string;
  qty: number;
  unit?: string;
  rate: number;
  amount: number;
};

/**
 * Indian grouping + 2 decimals, ASCII-only prefix for PDF.
 * Standard Helvetica has no ₹ (U+20B9); using it caused wrong glyphs and huge gaps between symbol and digits.
 */
export function formatEstimatePdfInr(amount: number): string {
  const n = Number(amount) || 0;
  const num = n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Rs.${num}`;
}

/**
 * Line-item table column widths (mm) for the estimate PDF: proportional targets,
 * expanded so Rate/Amount/Qty never clip, remainder goes to Item & Description.
 * Sum equals `contentWidthMm` (floating drift absorbed on column 1).
 */
export function computeEstimatePdfItemColumnWidths(
  doc: jsPDF,
  contentWidthMm: number,
  lineItems: EstimatePdfLineItemForLayout[],
): number[] {
  const pad = PDF_CELL_PAD_LR_MM * 2;
  const base = (i: number) => (contentWidthMm * ESTIMATE_ITEM_COL_WEIGHTS[i]) / WEIGHT_SUM;

  const headSize = 8.5;
  const bodySize = 8.5;
  const qtySize = 8;

  let textMin0 = maxLineTextWidthMm(doc, "#", headSize, "bold") + pad;
  for (let i = 0; i < lineItems.length; i++) {
    textMin0 = Math.max(textMin0, maxLineTextWidthMm(doc, String(i + 1), bodySize, "normal") + pad);
  }

  let textMin2 = maxLineTextWidthMm(doc, "HSN/SAC", headSize, "bold") + pad;
  for (const it of lineItems) {
    const h = String(it.hsnSac ?? "").trim();
    if (h) textMin2 = Math.max(textMin2, maxLineTextWidthMm(doc, h, bodySize, "normal") + pad);
  }

  let textMin3 = maxLineTextWidthMm(doc, "Qty", headSize, "bold") + pad;
  for (const it of lineItems) {
    const cell = `${Number(it.qty || 0).toFixed(2)}\n${String(it.unit ?? "")}`;
    textMin3 = Math.max(textMin3, maxLineTextWidthMm(doc, cell, qtySize, "normal") + pad);
  }

  let textMin4 = maxLineTextWidthMm(doc, "Rate", headSize, "bold") + pad;
  for (const it of lineItems) {
    textMin4 = Math.max(
      textMin4,
      maxLineTextWidthMm(doc, formatEstimatePdfInr(Number(it.rate || 0)), bodySize, "normal") + pad,
    );
  }

  let textMin5 = maxLineTextWidthMm(doc, "Amount", headSize, "bold") + pad;
  for (const it of lineItems) {
    textMin5 = Math.max(
      textMin5,
      maxLineTextWidthMm(doc, formatEstimatePdfInr(Number(it.amount || 0)), bodySize, "normal") + pad,
    );
  }

  let w0 = Math.max(base(0), textMin0);
  const w2 = Math.max(base(2), textMin2);
  const w3 = Math.max(base(3), textMin3);
  let w4 = Math.max(base(4), textMin4);
  let w5 = Math.max(base(5), textMin5);

  let w1 = contentWidthMm - w0 - w2 - w3 - w4 - w5;
  const minDesc = Math.max(24, base(1) * 0.5);

  if (w1 < minDesc) {
    let deficit = minDesc - w1;
    const order: Array<0 | 2 | 3 | 4 | 5> = [4, 5, 3, 2, 0];
    const widths: Record<0 | 2 | 3 | 4 | 5, number> = { 0: w0, 2: w2, 3: w3, 4: w4, 5: w5 };
    const textMins: Record<0 | 2 | 3 | 4 | 5, number> = {
      0: textMin0,
      2: textMin2,
      3: textMin3,
      4: textMin4,
      5: textMin5,
    };

    for (const idx of order) {
      if (deficit <= 0.001) break;
      const slack = widths[idx] - textMins[idx];
      if (slack <= 0) continue;
      const take = Math.min(deficit, slack);
      widths[idx] -= take;
      deficit -= take;
    }

    w0 = widths[0];
    w4 = widths[4];
    w5 = widths[5];
    const w2f = widths[2];
    const w3f = widths[3];
    w1 = contentWidthMm - w0 - w2f - w3f - w4 - w5;
    const out = [w0, w1, w2f, w3f, w4, w5];
    const drift = contentWidthMm - out.reduce((a, b) => a + b, 0);
    out[1] += drift;
    return out;
  }

  const out2 = [w0, w1, w2, w3, w4, w5];
  const drift2 = contentWidthMm - out2.reduce((a, b) => a + b, 0);
  out2[1] += drift2;
  return out2;
}

export type TotalsFooterLayout = { spacer: number; labelCol: number; amountCol: number };

export function computeEstimatePdfTotalsFooterLayout(
  doc: jsPDF,
  contentWidthMm: number,
  labelAmountRows: { label: string; amount: string }[],
  grandLabel: string,
  grandAmount: string,
): TotalsFooterLayout {
  const pad = PDF_CELL_PAD_LR_MM * 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let labelMax = maxLineTextWidthMm(doc, "Sub Total", 8.5, "normal");
  for (const row of labelAmountRows) {
    labelMax = Math.max(labelMax, maxLineTextWidthMm(doc, row.label, 8.5, "normal"));
  }
  labelMax = Math.max(labelMax, maxLineTextWidthMm(doc, grandLabel, 9.5, "bold"));
  const labelCol = labelMax + pad + 1;

  let amtMax = 0;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const row of labelAmountRows) {
    amtMax = Math.max(amtMax, maxLineTextWidthMm(doc, row.amount, 8.5, "normal"));
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  amtMax = Math.max(amtMax, maxLineTextWidthMm(doc, grandAmount, 9.5, "bold"));
  doc.setFont("helvetica", "normal");

  const amountCol = amtMax + pad + 1;
  const spacer = Math.max(0, contentWidthMm - labelCol - amountCol);
  return { spacer, labelCol, amountCol };
}
