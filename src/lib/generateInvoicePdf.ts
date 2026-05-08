import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EstimateData } from "@/types/estimate";
import { calculateEstimateTotals } from "@/lib/estimateCalculator";
import { COMPANY } from "@/lib/estimateConfig";

/**
 * InvoiceData mirrors EstimateData (line items, GST, customer block) and adds
 * the invoice-specific fields visible in the CCT-1476 sample:
 *   - invoiceNumber (CCT-XXXX)
 *   - invoiceDate / dueDate / terms (e.g. "Due on Receipt")
 *   - totalDealValue, paymentMade, balanceDue
 */
export interface InvoiceData extends EstimateData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms?: string;
  totalDealValue: number;
  paymentMade: number;
  balanceDue: number;
}

const COLORS = {
  tableHeaderBg: [51, 51, 51],
  tableHeaderText: [255, 255, 255],
  totalRowBg: [242, 242, 242],
  totalBoldBg: [230, 230, 230],
  tableBorder: [180, 180, 180],
  companyName: [0, 0, 0],
  estimateLabel: [0, 0, 0],
  estNumber: [80, 80, 80],
  sectionLabel: [0, 0, 0],
  bodyText: [50, 50, 50],
  dividerLine: [200, 200, 200],
} as const;

const ROW_RULE_COLOR: [number, number, number] = [150, 150, 150];

function fmtINR(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(isoDate: string): string {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T00:00:00`);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

function drawHRule(doc: jsPDF, x1: number, y: number, x2: number, lineWidth = 0.45) {
  if (![x1, y, x2].every(Number.isFinite)) return;
  doc.setLineWidth(lineWidth);
  doc.line(x1, y, x2, y);
}

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

async function generateInvoicePdfDoc(invoice: InvoiceData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN_L = 15;
  const MARGIN_R = 15;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  const RIGHT_EDGE = PAGE_W - MARGIN_R;

  const totals = calculateEstimateTotals(invoice.lineItems, invoice.gstType);
  const grandTotal = totals.grandTotal;
  // Invoices are issued post-payment, so Payment Made == Total and Balance Due == 0.
  const paymentMade = grandTotal;
  const balanceDue = 0;
  const totalDealValue = Number(invoice.totalDealValue) || grandTotal;

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

  // Invoice title + number (top-right)
  doc.setFont("times");
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.estimateLabel);
  doc.text("Invoice", RIGHT_EDGE, 22, { align: "right" });

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.estNumber);
  doc.text(`# ${invoice.invoiceNumber}`, RIGHT_EDGE, 28, { align: "right" });

  // Balance Due chip (top-right, just under the number)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Balance Due", RIGHT_EDGE, 35, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(fmtINR(balanceDue), RIGHT_EDGE, 41, { align: "right" });

  // Company block (top-left)
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

  y = Math.max(y + 6, 62);

  // Bill To
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Bill To", MARGIN_L, y);
  y += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(invoice.customerName, MARGIN_L, y);
  y += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.bodyText);
  const customerAddressLines = [
    invoice.customerAddress,
    `${invoice.customerPincode} ${invoice.customerState}`,
    invoice.customerCountry,
    ...(invoice.customerGstin ? [`GSTIN ${invoice.customerGstin}`] : []),
  ].filter(Boolean);
  customerAddressLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line), 95);
    doc.text(wrapped, MARGIN_L, y);
    y += wrapped.length * 4;
  });

  // Right-side meta block (Invoice Date, Terms, Due Date, Total Deal Value)
  const metaLeftLabel = 110;
  const metaRightVal = RIGHT_EDGE;
  let metaY = 65;
  const metaRow = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text(label, metaLeftLabel, metaY);
    doc.setTextColor(0, 0, 0);
    doc.text(value, metaRightVal, metaY, { align: "right" });
    metaY += 5;
  };
  metaRow("Invoice Date :", fmtDate(invoice.invoiceDate));
  metaRow("Terms :", String(invoice.terms ?? "Due on Receipt"));
  metaRow("Due Date :", fmtDate(invoice.dueDate));
  metaRow("Total Deal Value :", String(Math.round(totalDealValue)));

  y = Math.max(y + 4, metaY + 2);

  // Place of supply
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.bodyText);
  doc.text(
    `Place Of Supply: ${invoice.customerState} (${invoice.customerStateCode})`,
    MARGIN_L,
    y,
  );
  y += 6;

  // Items table
  const tableBody = invoice.lineItems.map((item, idx) => [
    idx + 1,
    item.description,
    item.hsnSac,
    `${Number(item.qty || 0).toFixed(2)}\n${item.unit}`,
    fmtINR(Number(item.rate || 0)),
    fmtINR(Number(item.amount || 0)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item & Description", "HSN/SAC", "Qty", "Rate", "Amount"]],
    body: tableBody,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2.6, right: 2.6 },
      textColor: COLORS.bodyText as any,
      lineColor: ROW_RULE_COLOR as any,
      lineWidth: { top: 0, right: 0, bottom: 0.55, left: 0 } as any,
      valign: "top",
    },
    headStyles: {
      fillColor: COLORS.tableHeaderBg as any,
      textColor: COLORS.tableHeaderText as any,
      fontStyle: "normal",
      fontSize: 8.5,
      halign: "left",
      lineWidth: { top: 0, right: 0, bottom: 0.55, left: 0 } as any,
      lineColor: ROW_RULE_COLOR as any,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 78, halign: "left" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    bodyStyles: { fillColor: [255, 255, 255] },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        data.cell.styles.fontSize = 8;
      }
    },
  });

  const tableBottom = (doc as any).lastAutoTable.finalY;

  // Sub Total + tax breakdown
  const totalsData = [
    ["", "Sub Total", fmtINR(totals.subTotal)],
    ...totals.taxBreakdown.map((row) => ["", row.label, fmtINR(row.amount)]),
  ];

  autoTable(doc, {
    startY: tableBottom,
    body: totalsData,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2.6, right: 2.6 },
      textColor: COLORS.bodyText as any,
      lineColor: COLORS.tableBorder as any,
      lineWidth: 0,
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 104, fillColor: [255, 255, 255], lineColor: [255, 255, 255] },
      1: { cellWidth: 48, halign: "right" },
      2: { cellWidth: 28, halign: "right" },
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didDrawCell: (data) => {
      const isRowStart = data.column.index === 0;
      if (!isRowStart) return;
      if (data.section !== "body") return;
      const startX = Number((data.table as any).startX ?? MARGIN_L);
      const width = Number((data.table as any).width ?? 0);
      if (!Number.isFinite(startX) || !Number.isFinite(width) || width <= 104) return;
      const x = startX + 104;
      const yLine = Number(data.cell.y) + Number(data.cell.height);
      doc.setDrawColor(...COLORS.tableBorder);
      drawHRule(doc, x, yLine, startX + width, 0.25);
    },
  });

  const totalsBottom = (doc as any).lastAutoTable.finalY;

  // Total (bold band)
  autoTable(doc, {
    startY: totalsBottom,
    body: [["", "Total", fmtINR(grandTotal)]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      fontStyle: "bold",
      cellPadding: { top: 2.6, bottom: 2.6, left: 2.6, right: 2.6 },
      textColor: [0, 0, 0],
      lineColor: COLORS.tableBorder as any,
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 104, fillColor: [255, 255, 255], lineColor: [255, 255, 255] },
      1: { cellWidth: 48, halign: "right", fillColor: COLORS.totalBoldBg as any },
      2: { cellWidth: 28, halign: "right", fillColor: COLORS.totalBoldBg as any },
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didDrawCell: (data) => {
      const isRowStart = data.column.index === 0;
      if (!isRowStart) return;
      if (data.section !== "body") return;
      const startX = Number((data.table as any).startX ?? MARGIN_L);
      const width = Number((data.table as any).width ?? 0);
      if (!Number.isFinite(startX) || !Number.isFinite(width) || width <= 104) return;
      const x = startX + 104;
      const yLine = Number(data.cell.y) + Number(data.cell.height);
      doc.setDrawColor(...COLORS.tableBorder);
      drawHRule(doc, x, yLine, startX + width, 0.25);
    },
  });

  const totalBottom = (doc as any).lastAutoTable.finalY;

  // Payment Made — plain row, value in red, prefixed with "(-)" per the sample.
  autoTable(doc, {
    startY: totalBottom,
    body: [["", "Payment Made", `(-) ${fmtINR(paymentMade)}`]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2.6, right: 2.6 },
      textColor: COLORS.bodyText as any,
      lineColor: COLORS.tableBorder as any,
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 104, fillColor: [255, 255, 255], lineColor: [255, 255, 255] },
      1: { cellWidth: 48, halign: "right" },
      2: { cellWidth: 28, halign: "right", textColor: [220, 38, 38] as any },
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
  });

  const paymentMadeBottom = (doc as any).lastAutoTable.finalY;

  // Balance Due — bold, gray fill (mirrors the Total row).
  autoTable(doc, {
    startY: paymentMadeBottom,
    body: [["", "Balance Due", fmtINR(balanceDue)]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      fontStyle: "bold",
      cellPadding: { top: 2.6, bottom: 2.6, left: 2.6, right: 2.6 },
      textColor: [0, 0, 0],
      lineColor: COLORS.tableBorder as any,
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 104, fillColor: [255, 255, 255], lineColor: [255, 255, 255] },
      1: { cellWidth: 48, halign: "right", fillColor: COLORS.totalBoldBg as any },
      2: { cellWidth: 28, halign: "right", fillColor: COLORS.totalBoldBg as any },
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
    didDrawCell: (data) => {
      const isRowStart = data.column.index === 0;
      if (!isRowStart) return;
      if (data.section !== "body") return;
      const startX = Number((data.table as any).startX ?? MARGIN_L);
      const width = Number((data.table as any).width ?? 0);
      if (!Number.isFinite(startX) || !Number.isFinite(width) || width <= 104) return;
      const x = startX + 104;
      const yLine = Number(data.cell.y) + Number(data.cell.height);
      doc.setDrawColor(...COLORS.tableBorder);
      drawHRule(doc, x, yLine, startX + width, 0.25);
    },
  });

  let afterTotalsY = (doc as any).lastAutoTable.finalY + 8;

  // Notes
  if (invoice.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.sectionLabel);
    doc.text("Notes", MARGIN_L, afterTotalsY);
    afterTotalsY += 5;
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.bodyText);
    const noteLines = doc.splitTextToSize(invoice.notes, CONTENT_W);
    doc.text(noteLines, MARGIN_L, afterTotalsY);
    afterTotalsY += noteLines.length * 4.5 + 6;
  }

  // Terms & Conditions (cheque + bank transfer block — matches CCT-1476 sample)
  const termsLines = [
    "Cheque to issued in favor of Cravingcode Technologies Pvt. Ltd",
    "For Online Transfer / NEFT / RTGS use the following details",
    `Bank Name: ${COMPANY.bankName}`,
    `Account Name: ${COMPANY.accountName}`,
    `Account No: ${COMPANY.accountNo}`,
    `Branch: ${COMPANY.branch}`,
    `IFSC: ${COMPANY.ifsc}`,
    "This is online generated receipt does not require a signature.",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.sectionLabel);
  doc.text("Terms & Conditions", MARGIN_L, afterTotalsY);
  afterTotalsY += 5;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.bodyText);
  termsLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, CONTENT_W);
    doc.text(wrapped, MARGIN_L, afterTotalsY);
    afterTotalsY += wrapped.length * 4;
  });

  // Footer divider + page number
  doc.setDrawColor(...COLORS.dividerLine);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, PAGE_H - 12, RIGHT_EDGE, PAGE_H - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("1", RIGHT_EDGE, PAGE_H - 8, { align: "right" });

  return doc;
}

export async function generateInvoicePdfFromData(invoice: InvoiceData): Promise<void> {
  const doc = await generateInvoicePdfDoc(invoice);
  doc.save(`${invoice.invoiceNumber}.pdf`);
}

export async function generateInvoicePdfBlobFromData(invoice: InvoiceData): Promise<Blob> {
  const doc = await generateInvoicePdfDoc(invoice);
  const bytes = doc.output("arraybuffer");
  return new Blob([bytes], { type: "application/pdf" });
}
