import type { Proposal, ProposalLineItem, ProposalVersion } from "@/types";
import type { jsPDF } from "jspdf";
import { useAppStore } from "@/store/useAppStore";

// jsPDF built-in fonts don't support ₹ Unicode. Use these helpers for all money in the PDF:
function pdfRupee(amount: number): string {
  return "Rs. " + amount.toLocaleString("en-IN");
}
function pdfRupeeTotal(amount: number): string {
  return "Rs. " + amount.toLocaleString("en-IN") + "/-";
}

const COLORS = {
  buildeskBlue: [0, 114, 188] as [number, number, number],
  darkGray: [64, 64, 64] as [number, number, number],
  darkGrayBg: [61, 61, 61] as [number, number, number], // #3D3D3D
  lightGray: [245, 245, 245] as [number, number, number],
  lightGrayAlt: [249, 249, 249] as [number, number, number],
  textDark: [30, 30, 30] as [number, number, number],
  textMedium: [80, 80, 80] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  tableHeaderBg: [0, 114, 188] as [number, number, number],
  tableBorder: [200, 200, 200] as [number, number, number],
  accentBlue: [0, 114, 188] as [number, number, number],
  accentGray: [100, 100, 100] as [number, number, number],
  stripeBlue: [26, 143, 209] as [number, number, number],
  stripeGray: [204, 204, 204] as [number, number, number],
  photoGray: [204, 204, 204] as [number, number, number],
  triangleGray: [224, 224, 224] as [number, number, number],
  totalRowBg: [235, 244, 252] as [number, number, number],
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const MARGIN_RIGHT = 22; // leave space for blue bar (5mm at 205)
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN - MARGIN_RIGHT; // 168mm
const HEADER_Y = 18;
const BODY_START_Y = 25;
const LINE_HEIGHT = 5.5;
const PARA_SPACING = 6;
const LOGO_STRIP_HEIGHT = 35;
const LOGO_BUILDESK_WIDTH = 42;
const LOGO_BUILDESK_HEIGHT = 20;
const LOGO_CRAVING_WIDTH = 50;
const LOGO_CRAVING_HEIGHT = 18;

function getOrdinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  switch (n % 10) {
    case 1: return n + "st";
    case 2: return n + "nd";
    case 3: return n + "rd";
    default: return n + "th";
  }
}

function getOrdinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function formatProposalDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const dayStr = String(day).padStart(2, "0");
  return `${dayStr}${getOrdinalSuffix(day)} ${month}, ${year}`;
}


function addPageHeader(doc: jsPDF): void {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 114, 188);
  doc.text("Enabling ", 14, 9);
  const enablingWidth = doc.getTextWidth("Enabling ");
  doc.setTextColor(0, 114, 188);
  doc.text("AI", 14 + enablingWidth, 9);
  const aiWidth = doc.getTextWidth("AI");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(" for your ", 14 + enablingWidth + aiWidth, 9);
  const forWidth = doc.getTextWidth(" for your ");
  doc.setTextColor(0, 114, 188);
  doc.text("Real Estate", 14 + enablingWidth + aiWidth + forWidth, 9);
  const reWidth = doc.getTextWidth("Real Estate");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(" Business", 14 + enablingWidth + aiWidth + forWidth + reWidth, 9);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("www.", 148, 9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 114, 188);
  doc.text("buildesk", 148 + doc.getTextWidth("www."), 9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(".in", 148 + doc.getTextWidth("www.buildesk"), 9);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(14, 12, 204, 12);
}

function addRightAccentBar(doc: jsPDF): void {
  doc.setFillColor(0, 114, 188);
  doc.rect(205, 0, 5, 297, "F");
}

function addPageNumber(doc: jsPDF, num: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(String(num), 105, 290, { align: "center" });
}

function renderParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textMedium);
  doc.setFont("helvetica", "normal");
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], x, y + i * lineHeight);
  }
  return y + lines.length * lineHeight;
}

function renderBulletList(
  doc: jsPDF,
  items: string[],
  x: number,
  y: number,
  maxWidth: number
): number {
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.textMedium);
  doc.setFont("helvetica", "normal");
  let currentY = y;
  const bulletIndent = 5;
  for (const item of items) {
    doc.text("•", x, currentY);
    const lines = doc.splitTextToSize(item, maxWidth - bulletIndent);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], x + bulletIndent, currentY + i * LINE_HEIGHT);
    }
    currentY += Math.max(1, lines.length) * LINE_HEIGHT + 2;
  }
  return currentY;
}

function getLogoUrl(filename: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const base = window.location.origin;
    const path = base.endsWith("/") ? base + filename : base + "/" + filename;
    return path;
  }
  return "/" + filename;
}

function loadImageAsBase64(url: string): Promise<string | null> {
  const fullUrl = url.startsWith("http") ? url : getLogoUrl(url.replace(/^\//, ""));
  return fetch(fullUrl)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Not found"))))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readDataURL(blob);
        })
    )
    .catch(() => null);
}

function getImageFormat(dataUrl: string): "PNG" | "JPEG" {
  if (!dataUrl || !dataUrl.startsWith("data:")) return "PNG";
  return dataUrl.indexOf("image/jpeg") >= 0 || dataUrl.indexOf("image/jpg") >= 0 ? "JPEG" : "PNG";
}

function fillTriangle(
  doc: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  color: [number, number, number]
): void {
  const ys = [y1, y2, y3];
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const points: [number, number][] = [[x1, y1], [x2, y2], [x3, y3]];
  doc.setFillColor(...color);
  for (let y = yMin; y <= yMax; y += 0.8) {
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = points[i];
      const b = points[(i + 1) % 3];
      if (a[1] === b[1]) continue;
      const t = (y - a[1]) / (b[1] - a[1]);
      if (t >= 0 && t <= 1) xs.push(a[0] + t * (b[0] - a[0]));
    }
    if (xs.length >= 2) {
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      doc.rect(xMin, y, xMax - xMin, 0.8, "F");
    }
  }
}

function renderCoverPage(doc: jsPDF, proposal: Proposal, _logoBuildesk: string | null, _logoCraving: string | null): void {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;

  doc.setFillColor(61, 61, 61);
  doc.rect(0, 0, W, H, "F");

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0, 114, 188);
  doc.text("Buildesk", 18, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Real Estate CRM", 18, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("C  cravingcode", 120, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("T E C H N O L O G I E S   P V T .  L T D .", 120, 20);

  fillTriangle(doc, 0, 85, 0, 200, 80, 85, COLORS.buildeskBlue);
  fillTriangle(doc, 80, 85, 210, 85, 210, 200, [200, 200, 200] as [number, number, number]);

  doc.setDrawColor(30, 140, 220);
  doc.setLineWidth(0.3);
  for (let i = 0; i < 14; i++) {
    const y1 = 88 + i * 9;
    if (y1 < 200) {
      const xEnd = Math.min(80, (y1 - 85) * 0.7);
      doc.line(0, y1, xEnd, y1);
    }
  }

  doc.setDrawColor(180, 180, 180);
  for (let i = 0; i < 14; i++) {
    const y1 = 88 + i * 9;
    if (y1 < 200) doc.line(80, y1, 210, y1);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(proposal.title.toUpperCase(), 100);
  doc.text(titleLines, 14, 205);
  doc.setTextColor(0, 114, 188);
  doc.setFontSize(14);
  doc.text(`For ${proposal.customerName}`, 14, 205 + titleLines.length * 8);

  const rightX = 195;
  let contactY = 248;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  doc.text(proposal.assignedToName || "Sales Representative", rightX, contactY, { align: "right" });
  contactY += 6;

  const users = useAppStore.getState().users;
  const rep = users.find((u) => u.id === proposal.assignedTo);
  if (rep?.role) {
    doc.setFont("helvetica", "normal");
    doc.text(rep.role.replace(/_/g, " "), rightX, contactY, { align: "right" });
    contactY += 6;
  }
  const repWithPhone = rep as { phone?: string } | undefined;
  if (repWithPhone?.phone) {
    doc.text(repWithPhone.phone, rightX, contactY, { align: "right" });
    contactY += 6;
  }

  contactY += 4;
  doc.text("Cravingcode Technologies Pvt. Ltd.", rightX, contactY, { align: "right" });
  contactY += 6;
  doc.text(`Submitted on: ${formatProposalDate(proposal.createdAt)}`, rightX, contactY, { align: "right" });
}

function drawBuildeskTextLogo(doc: jsPDF, x: number, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.buildeskBlue);
  doc.text("Buildesk", x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textMedium);
  doc.text("Real Estate CRM", x, y + 6);
}

function drawCravingcodeTextLogo(doc: jsPDF, x: number, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textDark);
  doc.text("C cravingcode", x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("TECHNOLOGIES PVT. LTD.", x, y + 5);
}

function renderVersionPage(doc: jsPDF, proposal: Proposal, autoTable: (doc: jsPDF, options: object) => void): void {
  addRightAccentBar(doc);
  addPageHeader(doc);

  const photoX = MARGIN;
  const photoY = BODY_START_Y;
  const photoW = CONTENT_WIDTH;
  const photoH = 52;
  doc.setFillColor(...COLORS.photoGray);
  doc.rect(photoX, photoY, photoW, photoH, "F");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textMedium);
  doc.setFont("helvetica", "normal");
  const photoLabel = "[ Business Meeting Photo ]";
  doc.text(photoLabel, photoX + photoW / 2, photoY + photoH / 2 - 1, { align: "center" });
  fillTriangle(doc, photoX, photoY + photoH - 2, photoX + 35, photoY + photoH - 2, photoX, photoY + photoH - 2 + 20, COLORS.buildeskBlue);
  fillTriangle(doc, photoX + 35, photoY + photoH - 2, photoX + 55, photoY, photoX + 55, photoY + photoH - 2, COLORS.triangleGray);

  const tableStartY = photoY + photoH + 12;
  const versions = proposal.versionHistory || [];
  const users = useAppStore.getState().users;
  const versionData = versions.map((v: ProposalVersion) => {
    const versionUser = users.find((u) => u.id === v.createdBy);
    const versionUserName = versionUser ? `Mr. ${versionUser.name}` : v.createdBy;
    const comment =
      v.notes?.trim() ||
      "This is the First version of Proposal to be submitted for Buildesk Annual Licenses.";
    return [String(v.version), formatProposalDate(v.createdAt), versionUserName, comment];
  });

  const colWidths = [18, 32, 38, CONTENT_WIDTH - 18 - 32 - 38];
  autoTable(doc, {
    startY: tableStartY,
    head: [["Version", "Date", "Name", "Comments"]],
    body: versionData,
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: "center" },
      1: { cellWidth: colWidths[1] },
      2: { cellWidth: colWidths[2] },
      3: { cellWidth: colWidths[3] },
    },
    headStyles: {
      fillColor: COLORS.darkGray,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
    },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: COLORS.lightGrayAlt },
    margin: { left: MARGIN },
    tableWidth: CONTENT_WIDTH,
  });

  let yProprietary = tableStartY + 35;
  const tbl = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  if (tbl?.finalY) yProprietary = tbl.finalY + 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Proprietary Notice", MARGIN + CONTENT_WIDTH / 2, yProprietary, { align: "center" });
  yProprietary += 8;

  const noticeText =
    "This proposal contains information that is considered confidential by Cravingcode Technologies Pvt. Ltd. and is provided for the sole purpose of permitting the recipient to evaluate the proposal. In consideration of receipt of this document, the recipient agrees to maintain such information in confidence and not to reproduce or otherwise disclose this information to any person outside the group directly responsible for the evaluation of its contents.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textMedium);
  const noticeLines = doc.splitTextToSize(noticeText, CONTENT_WIDTH);
  for (let i = 0; i < noticeLines.length; i++) {
    doc.text(noticeLines[i], MARGIN, yProprietary + i * LINE_HEIGHT);
  }

  addPageNumber(doc, 1);
}

function renderCoverLetterPage(doc: jsPDF, proposal: Proposal): void {
  addRightAccentBar(doc);
  addPageHeader(doc);

  let y = BODY_START_Y;
  const dateStr = `Date: ${formatProposalDate(proposal.createdAt)}`;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textMedium);
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, MARGIN, y);
  y += 14;

  doc.text("To,", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textDark);
  doc.text(proposal.customerName, MARGIN, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textMedium);
  doc.text("Re: Enclosed Proposal for Buildesk Annual Sales Management License", MARGIN, y);
  y += 14;

  const p1 =
    "At Cravingcode Technologies we are aware that creating client-oriented software takes a mixture of technical excellence and clear communication and our firm hires only the very best to ensure you receive both. We know that every client is unique and we strive to deliver an individual, innovative and affordable proposal every time and to follow it through with an outstanding delivery which is both on time and within budget.";
  y = renderParagraph(doc, p1, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT) + PARA_SPACING;

  const p2 =
    "We have over 8 years of development in this area and our previous clients include Gurukrupa Builders & Developers, Balaji Developers, Baradiya Group, Haware, Realty Assistant, Globe Group, Antilla, Smile Homes, RC Group, Nakshatra Group, JMD infra, Akar Housing Developer, Balaji Group, Dayaar Group and many more. Please let us know if you would like to get in touch with our existing clients from whom you will receive nothing but positive endorsements.";
  y = renderParagraph(doc, p2, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT) + PARA_SPACING;

  const p3 =
    "We also pride ourselves on our after-sales client-care including our guarantees, staff-training, and onsite and offsite support.";
  y = renderParagraph(doc, p3, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT) + PARA_SPACING;

  const p4 =
    "Finally, we realize that you are very busy and wanted to thank you in advance for your time spent reviewing our proposal.";
  y = renderParagraph(doc, p4, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT) + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Yours Truly,", MARGIN, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textDark);
  doc.text(proposal.assignedToName || "Sales Representative", MARGIN, y);

  addPageNumber(doc, 2);
}

function getServiceLabel(_item: ProposalLineItem): string {
  return "12 Months";
}

function renderCommercialPage(doc: jsPDF, proposal: Proposal, autoTable: (doc: jsPDF, options: object) => void): void {
  addRightAccentBar(doc);
  addPageHeader(doc);

  let y = BODY_START_Y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Commercial", MARGIN, y);
  doc.setDrawColor(...COLORS.textDark);
  doc.line(MARGIN, y + 1.5, MARGIN + 40, y + 1.5);
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Module 1: ${proposal.title}`, MARGIN, y);
  y += 10;

  const computedTotal = proposal.lineItems.reduce((sum, item) => sum + (item.lineTotal + item.taxAmount), 0);
  const displayTotal = proposal.finalQuoteValue ?? computedTotal;

  const tableBody = proposal.lineItems.map((item: ProposalLineItem, idx: number) => [
    String(idx + 1),
    item.description ? `${item.name}\n${item.description}` : item.name,
    getServiceLabel(item),
    pdfRupee(item.unitPrice),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Sr. No.", "Description", "Service", "Annual License Cost (in INR)"]],
    body: tableBody,
    columnStyles: {
      0: { halign: "center", cellWidth: 15 },
      1: { halign: "left", cellWidth: 83 },
      2: { halign: "center", cellWidth: 30 },
      3: { halign: "right", cellWidth: 40 },
    },
    headStyles: {
      fillColor: [0, 114, 188],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: MARGIN },
    tableWidth: CONTENT_WIDTH,
  });

  const tbl = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  const finalY = tbl?.finalY ?? y;
  autoTable(doc, {
    startY: finalY + 2,
    body: [["Total", "", "", pdfRupeeTotal(Math.round(displayTotal))]],
    columnStyles: {
      0: { cellWidth: 130, halign: "right", fontStyle: "bold" },
      1: { cellWidth: 1 },
      2: { cellWidth: 1 },
      3: { cellWidth: 40, halign: "right", fontStyle: "bold", textColor: [0, 114, 188] },
    },
    bodyStyles: { fontSize: 10 },
    theme: "plain",
    margin: { left: MARGIN },
    tableWidth: CONTENT_WIDTH,
    didParseCell: (data) => {
      if (data.section === "body") {
        data.cell.styles.fillColor = [235, 244, 252];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      }
    },
  });

  const afterTableY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? finalY) + 14;
  if (proposal.customerNotes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.buildeskBlue);
    doc.text("NOTE:", MARGIN, afterTableY);
    let noteY = afterTableY + 6;
    const noteLines = proposal.customerNotes.split(/\n/).filter(Boolean);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textMedium);
    const roman = ["(I)", "(II)", "(III)", "(IV)", "(V)"];
    noteLines.forEach((line, i) => {
      doc.text(`${roman[i] ?? `(${i + 1})`} ${line}`, MARGIN, noteY);
      noteY += 5;
    });
  }

  addPageNumber(doc, 3);
}

const DEFAULT_TERMS = [
  "18% GST is applicable on the final total.",
  "100% payment has to be done in advance.",
  "Dedicated Delivery Manager to handle implementation and onboarding.",
  "Ticket-based support backed by WhatsApp, email and phone communication.",
  "Structured training sessions and periodic optimization reviews.",
  "Access to Help Center and Knowledge Base for self-service resolution.",
  "In an optional on-premises deployment training, the receiving party must bear the cost.",
  "Detailed NDA agreement (for data privacy) will be done after the payment if needed for the receiving party, this can be reviewed by the receiving party's legal team and will duly sign by the authorized signatories at the time of deployment.",
  "SMS, IVR and WhatsApp API Charges are extra as per the usage.",
  "The above-mentioned pricing includes the annual license cost, which is non-refundable.",
  "Buildesk will provide free technical support on the provided product and services during the subscription period.",
  "Buildesk personnel will be available to by phone and via email to answer questions regarding the supplied data and to help identify, verify, and resolve problems with the supplied data for a period of six months for product and services purchased as part of this proposal. Telephone/email Support will be made available on Monday through Saturday from 10.00 a.m. to 6:30 p.m., IST, Buildesk holidays excluded.",
  "If there is any change in scope other than agreed line items/content, then Buildesk shall be liable to charge extra for the efforts involved with due discussion with client.",
  "Billing will be done under the Cravingcode Technologies Pvt Ltd.",
];

function renderTermsPage(doc: jsPDF, proposal: Proposal): void {
  addRightAccentBar(doc);
  addPageHeader(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Terms & Conditions", MARGIN, BODY_START_Y);

  const terms = [...DEFAULT_TERMS];
  if (proposal.paymentTerms) {
    terms[1] = proposal.paymentTerms;
  }

  renderBulletList(doc, terms, MARGIN, BODY_START_Y + 10, CONTENT_WIDTH);

  addPageNumber(doc, 4);
}

const SLA_TEXT = {
  intro: `This document describes the services Buildesk has agreed to provide to LICENSEE and the corresponding individual roles and responsibilities. The roles and responsibilities are defined and apply to both parties. Periodic reviews will occur to ensure that roles and responsibilities remain well understood and communication lines remain open.

The following services have been identified as required by LICENSEE in its operation of the Buildesk supplied system. The services have been customized to the installation and the unique requirements of LICENSEE.

This SLA covers the following services provided within the Maintenance Fee:
- O&M Role: Offsite operation and maintenance of the system normal working hours and working days.
- Buildesk AMC Support: Email support and telephonic support during the hours specified later in this agreement for software deployed by Buildesk.`,

  tac: `Customer Service Requests (CSR's) can be delivered by e-mail or phone to Buildesk's customer support department. Buildesk will accept any reasonable request. The local support center will provide Tier 1, Tier 2 and Tier 3 support during the defined support hours.

The following will NOT be logged as software defects:
- Requests for additional functionality, or enhancements to existing functionality.
- Requests for quotations (e.g. for additional licenses, extra documentation, etc).
- UNIX/Windows NT/Database queries not related to the product's operation.`,

  supportRole1: `Provide technical support staff to man helpdesk and provide Tier 1 and 2 support via Buildesk systems and personnel during the agreed Support Hours Monday through Friday.

Cravingcode Technologies Pvt. Ltd. | nishant@cravingcode.in

Customer team will require to provide all details requested by Buildesk and will use all reasonable endeavours to provide full details of any problems found, including: Full error messages, Log files, Actions/events performed prior to the problem, Repeatability, Workaround found, System administrator activity, and other relevant information.`,

  technicalSupport: `Customers maintain their own systems and environment with assistance from Buildesk.

Buildesk Support Role:
- Diagnose issues related to the delivered product(s).
- Support escalation based on service level agreement.
- Ownership and responsibility of the Buildesk systems configuration management.
- Systems scripts and configurations are maintained and managed based on business requirements.
- Any updates to the configurations are provided by Buildesk as changes are made.
- Provide single point of contact for system administration and database administration.
- Ensure that sales team and marketing team receive training on the Buildesk systems.
- Complete the testing and release verification upon completion of installations.`,

  problemResolution: `Buildesk resolves the Buildesk product problems in concert with the customer.

Buildesk Support Role:
- Manage the identification and isolation of software problems as reported by customer.
- Receive, log and case assignment and tracking Buildesk software problems.
- Based on priority level, escalate and resolve software product issues using automated rules-based methodology.
- Provide prioritization based on criteria agreed to with the customer.
- Notification of other vendors required support managed by Buildesk with permission of the customer.
- Trend analysis and reporting on maintenance activity.`,

  patchManagement: `Buildesk Support team provides the installation and patch releases to customer for deployment. In case required, Buildesk provides remote installation assistance on customer provided server.

Buildesk Support Role:
- Provide software patches and workarounds.
- Provide product maintenance releases.
- Buildesk may choose to include minor enhancements in maintenance releases depending on scale and scope.
- Major features will be included in major releases and are not included in the service level agreement.
- Provide installation of maintenance support and patch releases.
- Provide change control requirements as required.
- Provide a point of coordination and approval for installation of test and production releases.`,
};

const FOOTER_Y = 270;

function renderSLAPages(doc: jsPDF): void {
  addRightAccentBar(doc);
  addPageHeader(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Annexure: Buildesk SLA", MARGIN, BODY_START_Y);

  const sections: { title?: string; body: string }[] = [
    { title: "Introduction", body: SLA_TEXT.intro },
    { title: "Technical Assistance Center (TAC)", body: SLA_TEXT.tac },
    { title: "Buildesk Support Role", body: SLA_TEXT.supportRole1 },
    { title: "Technical Support", body: SLA_TEXT.technicalSupport },
    { title: "Software Problem Resolution", body: SLA_TEXT.problemResolution },
    { body: SLA_TEXT.patchManagement },
  ];

  let pageNum = 5;
  let y = BODY_START_Y + 10;
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textMedium);
  doc.setFont("helvetica", "normal");

  for (const section of sections) {
    if (y > FOOTER_Y) {
      addPageNumber(doc, pageNum);
      doc.addPage();
      pageNum += 1;
      addRightAccentBar(doc);
      addPageHeader(doc);
      y = BODY_START_Y;
    }
    if (section.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.textDark);
      doc.text(section.title, MARGIN, y);
      doc.setDrawColor(...COLORS.textDark);
      doc.line(MARGIN, y + 1, MARGIN + doc.getTextWidth(section.title), y + 1);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textMedium);
    }
    y = renderParagraph(doc, section.body, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT) + 5;
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textMedium);
  }

  addPageNumber(doc, pageNum);
}

export async function generateProposalPdf(proposal: Proposal): Promise<void> {
  const [jsPDFModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = jsPDFModule.default;
  const autoTable = autoTableModule.default;

  const logoBuildesk = await loadImageAsBase64("buildesk.png");
  const logoCraving = await loadImageAsBase64("craving_code.png");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  renderCoverPage(doc, proposal, logoBuildesk, logoCraving);

  doc.addPage();
  renderVersionPage(doc, proposal, autoTable);

  doc.addPage();
  renderCoverLetterPage(doc, proposal);

  doc.addPage();
  renderCommercialPage(doc, proposal, autoTable);

  doc.addPage();
  renderTermsPage(doc, proposal);

  doc.addPage();
  renderSLAPages(doc);

  doc.save(`Proposal-${proposal.proposalNumber}.pdf`);
}
