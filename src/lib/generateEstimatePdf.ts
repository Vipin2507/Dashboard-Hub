import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Deal } from "@/types";
import type { EstimateData } from "@/types/estimate";
import { calculateEstimateTotals } from "@/lib/estimateCalculator";
import { COMPANY, ESTIMATE_DEFAULTS } from "@/lib/estimateConfig";
import {
  computeEstimatePdfItemColumnWidths,
  computeEstimatePdfTotalsFooterLayout,
  formatEstimatePdfInr,
  PDF_CELL_PAD_LR_MM,
  PDF_MIN_BODY_ROW_H_MM,
  PDF_PX_MM,
} from "@/lib/estimatePdfTableLayout";

type EstimateLineItem = {
  name: string;
  description?: string;
  subDescription?: string;
  validity?: string;
  hsnSac?: string;
  qty: number;
  unit?: string;
  rate: number;
};

export type DealEstimatePayload = {
  billTo: {
    companyName: string;
    customerFullName: string;
    email?: string;
    phone?: string;
    billingAddress: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    gstin: string;
    placeOfSupply: string;
  };
  estimate: {
    estimateNumber: string;
    estimateDate: string; // YYYY-MM-DD
    dealTitle: string;
    dealValue: number;
  };
  items: EstimateLineItem[];
  tax: {
    subTotal: number;
    cgstPct: number;
    sgstPct: number;
    igstPct: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    total: number;
  };
  notes: string;
};

export const COLORS = {
  tableHeaderBg: [51, 51, 51],
  tableHeaderText: [255, 255, 255],
  totalRowBg: [242, 242, 242],
  totalBoldBg: [230, 230, 230],
  tableBorder: [204, 204, 204],
  companyName: [0, 0, 0],
  estimateLabel: [0, 0, 0],
  estNumber: [80, 80, 80],
  sectionLabel: [0, 0, 0],
  bodyText: [50, 50, 50],
  dividerLine: [200, 200, 200],
} as const;

function fmtINR(amount: number): string {
  return formatEstimatePdfInr(amount);
}

function fmtDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function drawHRule(doc: jsPDF, x1: number, y: number, x2: number, lineWidth = 0.45) {
  const nx1 = Number(x1);
  const ny = Number(y);
  const nx2 = Number(x2);
  if (!Number.isFinite(nx1) || !Number.isFinite(ny) || !Number.isFinite(nx2)) return;
  doc.setLineWidth(lineWidth);
  doc.line(nx1, ny, nx2, ny);
}

const ROW_RULE_COLOR: [number, number, number] = [204, 204, 204];
const ROW_LINE_MM = 1 * PDF_PX_MM;

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" | null {
  const m = /^data:([^;]+);base64,/i.exec(String(dataUrl || ""));
  const mime = (m?.[1] || "").toLowerCase();
  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg" || mime === "image/jpg") return "JPEG";
  if (mime === "image/webp") return "WEBP";
  return null;
}

async function loadLogo(): Promise<{ dataUrl: string; format: "PNG" | "JPEG" | "WEBP" } | null> {
  const candidates = ["/logo-cravingcode.png", "/logo_cravingcode.png", "/logo.png"];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      const format = imageFormatFromDataUrl(dataUrl);
      if (!format) continue;
      return { dataUrl, format };
    } catch {
      // try next
    }
  }
  return null;
}

async function generateEstimatePdfDoc(estimate: EstimateData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN_L = 15;
  const MARGIN_R = 15;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  const RIGHT_EDGE = PAGE_W - MARGIN_R;

  const totals = calculateEstimateTotals(estimate.lineItems, estimate.gstType);
  const logo = await loadLogo();

  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, MARGIN_L, 15, 45, 12);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 102, 204);
    doc.text("cravingcode", MARGIN_L, 23);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("TECHNOLOGIES PVT. LTD.", MARGIN_L, 27);
  }

  doc.setFont("times");
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.estimateLabel);
  doc.text("ESTIMATE", RIGHT_EDGE, 22, { align: "right" });

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.estNumber);
  doc.text(`# ${estimate.estimateNumber}`, RIGHT_EDGE, 28, { align: "right" });

  let y = 33;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.companyName);
  doc.text(COMPANY.name, MARGIN_L, y);
  y += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.bodyText);
  [
    COMPANY.address1,
    COMPANY.address2,
    `${COMPANY.city} ${COMPANY.state} ${COMPANY.pincode}`,
    COMPANY.country,
    `GSTIN ${COMPANY.gstin}`,
  ].forEach((line) => {
    doc.text(line, MARGIN_L, y);
    y += 4;
  });

  y = Math.max(y + 6, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Bill To", MARGIN_L, y);
  y += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(estimate.customerName, MARGIN_L, y);
  y += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.bodyText);

  const customerAddressLines = [
    estimate.customerAddress,
    `${estimate.customerPincode} ${estimate.customerState}`,
    estimate.customerCountry,
    ...(estimate.customerGstin ? [`GSTIN ${estimate.customerGstin}`] : []),
  ].filter(Boolean);

  customerAddressLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line), 95);
    doc.text(wrapped, MARGIN_L, y);
    y += wrapped.length * 4;
  });

  const dateY = 62;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Estimate Date :", 105, dateY);
  doc.setTextColor(0, 0, 0);
  doc.text(fmtDate(estimate.estimateDate), RIGHT_EDGE, dateY, { align: "right" });

  y = Math.max(y + 4, 78);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.bodyText);
  doc.text(`Place Of Supply: ${estimate.customerState} (${estimate.customerStateCode})`, MARGIN_L, y);
  y += 6;

  const tableBody = estimate.lineItems.map((item, idx) => [
    idx + 1,
    item.description,
    item.hsnSac,
    `${Number(item.qty || 0).toFixed(2)}\n${item.unit}`,
    fmtINR(Number(item.rate || 0)),
    fmtINR(Number(item.amount || 0)),
  ]);

  const itemColWidths = computeEstimatePdfItemColumnWidths(doc, CONTENT_W, estimate.lineItems);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item & Description", "HSN/SAC", "Qty", "Rate", "Amount"]],
    body: tableBody,
    theme: "plain",
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      overflow: "linebreak",
      cellPadding: {
        top: PDF_CELL_PAD_LR_MM,
        bottom: PDF_CELL_PAD_LR_MM,
        left: PDF_CELL_PAD_LR_MM,
        right: PDF_CELL_PAD_LR_MM,
      },
      textColor: COLORS.bodyText as any,
      lineColor: ROW_RULE_COLOR as any,
      lineWidth: { top: 0, right: 0, bottom: ROW_LINE_MM, left: 0 } as any,
      valign: "top",
      minCellHeight: PDF_MIN_BODY_ROW_H_MM,
    },
    headStyles: {
      fillColor: COLORS.tableHeaderBg as any,
      textColor: COLORS.tableHeaderText as any,
      fontStyle: "bold",
      fontSize: 8.5,
      valign: "middle",
      minCellHeight: 8.5,
      overflow: "hidden",
      cellPadding: {
        top: PDF_CELL_PAD_LR_MM,
        bottom: PDF_CELL_PAD_LR_MM,
        left: PDF_CELL_PAD_LR_MM,
        right: PDF_CELL_PAD_LR_MM,
      },
      lineWidth: { top: 0, right: 0, bottom: ROW_LINE_MM, left: 0 } as any,
      lineColor: ROW_RULE_COLOR as any,
    },
    columnStyles: {
      0: { cellWidth: itemColWidths[0], halign: "center" },
      1: { cellWidth: itemColWidths[1], halign: "left" },
      2: { cellWidth: itemColWidths[2], halign: "center" },
      3: { cellWidth: itemColWidths[3], halign: "center" },
      4: { cellWidth: itemColWidths[4], halign: "right" },
      5: { cellWidth: itemColWidths[5], halign: "right" },
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    bodyStyles: { fillColor: [255, 255, 255] },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didParseCell: (data) => {
      const headHalign: Array<"center" | "left" | "right"> = [
        "center",
        "left",
        "center",
        "center",
        "right",
        "right",
      ];
      if (data.section === "head") {
        data.cell.styles.halign = headHalign[data.column.index] ?? "left";
      }
      if (data.section === "body" && data.column.index === 3) {
        data.cell.styles.fontSize = 8;
      }
      if (data.section === "body" && data.column.index === 1) {
        data.cell.styles.overflow = "linebreak";
      }
      if (data.section === "body" && (data.column.index === 4 || data.column.index === 5)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  const tableBottom = (doc as any).lastAutoTable.finalY;

  const totalsLayoutRows = [
    { label: "Sub Total", amount: fmtINR(totals.subTotal) },
    ...totals.taxBreakdown.map((row) => ({ label: row.label, amount: fmtINR(row.amount) })),
  ];
  const totalsFooter = computeEstimatePdfTotalsFooterLayout(
    doc,
    CONTENT_W,
    totalsLayoutRows,
    "Total",
    fmtINR(totals.grandTotal),
  );

  const totalsData = [
    ["", "Sub Total", fmtINR(totals.subTotal)],
    ...totals.taxBreakdown.map((row) => ["", row.label, fmtINR(row.amount)]),
  ];

  autoTable(doc, {
    startY: tableBottom,
    body: totalsData,
    theme: "plain",
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      overflow: "linebreak",
      cellPadding: {
        top: PDF_CELL_PAD_LR_MM,
        bottom: PDF_CELL_PAD_LR_MM,
        left: PDF_CELL_PAD_LR_MM,
        right: PDF_CELL_PAD_LR_MM,
      },
      textColor: COLORS.bodyText as any,
      lineColor: COLORS.tableBorder as any,
      lineWidth: 0,
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: {
        cellWidth: totalsFooter.spacer,
        fillColor: [255, 255, 255],
        lineColor: [255, 255, 255],
      },
      1: { cellWidth: totalsFooter.labelCol, halign: "right" },
      2: { cellWidth: totalsFooter.amountCol, halign: "right" },
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didDrawCell: (data) => {
      const isRowStart = data.column.index === 0;
      if (!isRowStart) return;
      if (data.section !== "body") return;
      const startX = Number((data.table as any).startX ?? MARGIN_L);
      const width = Number((data.table as any).width ?? 0);
      if (!Number.isFinite(startX) || !Number.isFinite(width) || width <= totalsFooter.spacer) return;
      const x = startX + totalsFooter.spacer;
      const yLine = Number(data.cell.y) + Number(data.cell.height);
      doc.setDrawColor(...COLORS.tableBorder);
      drawHRule(doc, x, yLine, startX + width, ROW_LINE_MM);
    },
  });

  const totalsRowBottom = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    startY: totalsRowBottom,
    body: [["", "Total", fmtINR(totals.grandTotal)]],
    theme: "plain",
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      fontStyle: "bold",
      overflow: "linebreak",
      cellPadding: {
        top: PDF_CELL_PAD_LR_MM,
        bottom: PDF_CELL_PAD_LR_MM,
        left: PDF_CELL_PAD_LR_MM,
        right: PDF_CELL_PAD_LR_MM,
      },
      textColor: [0, 0, 0],
      lineColor: COLORS.tableBorder as any,
      lineWidth: 0,
    },
    columnStyles: {
      0: {
        cellWidth: totalsFooter.spacer,
        fillColor: [255, 255, 255],
        lineColor: [255, 255, 255],
      },
      1: { cellWidth: totalsFooter.labelCol, halign: "right", fillColor: COLORS.totalBoldBg as any },
      2: { cellWidth: totalsFooter.amountCol, halign: "right", fillColor: COLORS.totalBoldBg as any },
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didDrawCell: (data) => {
      const isRowStart = data.column.index === 0;
      if (!isRowStart) return;
      if (data.section !== "body") return;
      const startX = Number((data.table as any).startX ?? MARGIN_L);
      const width = Number((data.table as any).width ?? 0);
      if (!Number.isFinite(startX) || !Number.isFinite(width) || width <= totalsFooter.spacer) return;
      const x = startX + totalsFooter.spacer;
      const yLine = Number(data.cell.y) + Number(data.cell.height);
      doc.setDrawColor(...COLORS.tableBorder);
      drawHRule(doc, x, yLine, startX + width, ROW_LINE_MM);
    },
  });

  let afterTotalsY = (doc as any).lastAutoTable.finalY + 8;

  if (estimate.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.sectionLabel);
    doc.text("Notes", MARGIN_L, afterTotalsY);
    afterTotalsY += 5;
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.bodyText);
    const noteLines = doc.splitTextToSize(estimate.notes, CONTENT_W);
    doc.text(noteLines, MARGIN_L, afterTotalsY);
    afterTotalsY += noteLines.length * 4.5 + 6;
  }

  const terms = estimate.termsAndConditions ?? ESTIMATE_DEFAULTS.terms;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.sectionLabel);
  doc.text("Terms & Conditions", MARGIN_L, afterTotalsY);
  afterTotalsY += 5;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.bodyText);
  const termLines = doc.splitTextToSize(terms, CONTENT_W);
  doc.text(termLines, MARGIN_L, afterTotalsY);

  doc.setDrawColor(...COLORS.dividerLine);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, PAGE_H - 12, RIGHT_EDGE, PAGE_H - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("1", RIGHT_EDGE, PAGE_H - 8, { align: "right" });

  return doc;
}

export async function generateEstimatePdfFromData(estimate: EstimateData): Promise<void> {
  const doc = await generateEstimatePdfDoc(estimate);
  doc.save(`${estimate.estimateNumber}.pdf`);
}

export async function generateEstimatePdfBlobFromData(estimate: EstimateData): Promise<Blob> {
  const doc = await generateEstimatePdfDoc(estimate);
  const bytes = doc.output("arraybuffer");
  return new Blob([bytes], { type: "application/pdf" });
}

function isDealEstimatePayload(x: any): x is DealEstimatePayload {
  return (
    !!x &&
    typeof x === "object" &&
    !!x.billTo &&
    typeof x.billTo === "object" &&
    !!x.estimate &&
    typeof x.estimate === "object" &&
    Array.isArray((x as any).items)
  );
}

function isEstimateData(x: any): x is EstimateData {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as any).estimateNumber === "string" &&
    typeof (x as any).estimateDate === "string" &&
    Array.isArray((x as any).lineItems)
  );
}

function normalizeEstimatePayload(deal: Deal): DealEstimatePayload | EstimateData | null {
  const raw = (deal.estimateJson ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Deals can store either DealEstimatePayload (billTo/estimate/items) or EstimateData directly.
    if (isDealEstimatePayload(parsed) || isEstimateData(parsed)) return parsed;
    return parsed as any;
  } catch {
    return null;
  }
}

export async function generateEstimatePdf(deal: Deal, payloadOverride?: DealEstimatePayload): Promise<void> {
  const payload = (payloadOverride as any) ?? normalizeEstimatePayload(deal);
  if (!payload) throw new Error("Estimate data not found on deal");
  if (isEstimateData(payload)) {
    await generateEstimatePdfFromData(payload);
    return;
  }
  const estimate = estimateDataFromDealPayload(payload as DealEstimatePayload);
  await generateEstimatePdfFromData(estimate);
}

export async function generateEstimatePdfBlob(deal: Deal, payloadOverride?: DealEstimatePayload): Promise<Blob> {
  const payload = (payloadOverride as any) ?? normalizeEstimatePayload(deal);
  if (!payload) throw new Error("Estimate data not found on deal");
  if (isEstimateData(payload)) {
    return generateEstimatePdfBlobFromData(payload);
  }
  const estimate = estimateDataFromDealPayload(payload as DealEstimatePayload);
  return generateEstimatePdfBlobFromData(estimate);
}

function estimateDataFromDealPayload(payload: DealEstimatePayload): EstimateData {
  const customerStateCode = String(payload.billTo.gstin || "").substring(0, 2) || COMPANY.stateCode;
  const taxRateGuess = payload.tax?.igstPct
    ? Number(payload.tax.igstPct) || 0
    : Number(payload.tax?.cgstPct || 0) + Number(payload.tax?.sgstPct || 0);

  return {
    estimateNumber: payload.estimate.estimateNumber,
    estimateDate: payload.estimate.estimateDate,
    customerName: payload.billTo.companyName,
    customerAddress: payload.billTo.billingAddress,
    customerCity: payload.billTo.city,
    customerState: payload.billTo.state,
    customerPincode: payload.billTo.pincode,
    customerCountry: payload.billTo.country || "India",
    customerGstin: payload.billTo.gstin || undefined,
    customerStateCode,
    gstType: customerStateCode === COMPANY.stateCode ? "intra" : "inter",
    lineItems: payload.items.map((it, idx) => ({
      id: `li-${idx}`,
      description: [it.name, it.description, it.subDescription, it.validity].filter(Boolean).join("\n"),
      hsnSac: String(it.hsnSac || ""),
      qty: Number(it.qty || 0),
      unit: String(it.unit || ""),
      rate: Number(it.rate || 0),
      amount: (Number(it.qty) || 0) * (Number(it.rate) || 0),
      taxRate: taxRateGuess,
    })),
    notes: payload.notes || ESTIMATE_DEFAULTS.notes,
    termsAndConditions: ESTIMATE_DEFAULTS.terms,
  };
}

