import type { Proposal, ProposalLineItem } from "@/types";
import type { jsPDF } from "jspdf";
import { useAppStore } from "@/store/useAppStore";
import { imageDataFormat, preloadProposalImages } from "@/assets/proposal/images";

const BLUE = [23, 111, 241] as const;
const PAGE_W = 210;
const PAGE_H = 297;

/**
 * Layout — exact from BUILDESK_PROPOSAL_.docx (pgMar, EMU→mm, tables).
 * Use these everywhere — no stray magic numbers for margins/edges.
 */
const L = {
  marginLeft: 12.7,
  marginRight: 11.75,
  marginTop: 25.31,
  marginBottom: 16.77,
  /** 210 − 11.75 */
  rightEdge: 198.25,
  /** 210 − 12.7 − 11.75 */
  contentWidth: 185.5,
  /** After 16mm header + 6mm gap */
  contentStartY: 22,
  headerHeight: 16,
  headerTextY: 10,
  headerLineY: 15,
  /** Cover — title block uses ~14mm left (docx text box aligned to margin) */
  coverTitleX: 14,
  coverTitleY: 197,
  coverTitleSize: 20,
  coverTitleLineGap: 10,
  coverContactFont: 11,
  coverRepNameY: 246,
  coverRepRoleY: 253,
  coverRepPhoneY: 260,
  coverCompanyY: 270,
  coverSubmittedY: 277,
  /** Version table columns (mm) — gridCol DXA → mm */
  vColVersion: 19.93,
  vColDate: 39.99,
  vColName: 41.42,
  vColComments: 83.1,
  meetingPhotoX: 12.7,
  meetingPhotoY: 18,
  meetingPhotoW: 184.4,
  meetingPhotoH: 58,
  versionTableStartY: 82,
  /** Blue arrow + body (cover letter) */
  arrowX: 12.7,
  arrowY: 58,
  arrowW: 40,
  arrowH: 52,
  /** Page number pill */
  pageNumPillY: 280,
  pageNumPillW: 10,
  pageNumPillH: 8,
  pageNumTextY: 285,
  pageNumPillX: 198.25 - 10,
  /** Commercial table columns (mm) */
  comColSr: 15,
  comColDesc: 88,
  comColSvc: 30,
  comColCost: 52.5,
  footerBreakY: 272,
} as const;

const COVER_TITLE_LINES = ["BUILDESK ANNUAL END TO END SALES", "MANAGEMENT PROPOSAL"];

const FONT = {
  body: 10,
  bodySmall: 9.5,
  bullet: 9.5,
  tableBody: 9,
  tableHead: 9,
  sectionHdr: 10,
  pageTitle: 13,
  commercialTitle: 14,
  moduleTitle: 10,
  headerStrip: 8.5,
  pagePill: 9,
  termsTitle: 12,
} as const;

function cleanName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function toTitleCase(str: string): string {
  if (!str.trim()) return "";
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

function formatINR(amount: number): string {
  return "Rs. " + amount.toLocaleString("en-IN");
}

function formatINRTotal(amount: number): string {
  return "Rs. " + amount.toLocaleString("en-IN") + "/-";
}

function getOrdinalSuffix(day: number): string {
  const v = day % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatProposalDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  return `${day}${getOrdinalSuffix(day)} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

function getServiceLabel(_item: ProposalLineItem): string {
  return "12 Months";
}

function lineAmountExTax(item: ProposalLineItem): number {
  return item.unitPrice * item.qty;
}

function renderParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5.5,
  fontSize = FONT.body,
): number {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function renderBulletList(
  doc: jsPDF,
  items: string[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5.2,
  itemGap = 2.5,
  fontSize = FONT.bullet,
): number {
  doc.setFontSize(fontSize);
  let currentY = y;
  for (const item of items) {
    const firstLine = `• ${item}`;
    const lines = doc.splitTextToSize(firstLine, maxWidth - 4);
    if (lines.length === 0) continue;
    doc.text(lines[0], x, currentY);
    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        currentY += lineHeight;
        doc.text(lines[i], x + 3, currentY);
      }
    }
    currentY += lineHeight + itemGap;
  }
  return currentY;
}

/** Pages 2+ — gray strip #F2F2F2, divider, branded header */
function addPageHeader(doc: jsPDF): void {
  doc.setFillColor(242, 242, 242);
  doc.rect(0, 0, PAGE_W, L.headerHeight, "F");

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(L.marginLeft, L.headerLineY, L.rightEdge, L.headerLineY);

  doc.setFontSize(FONT.headerStrip);
  let x = L.marginLeft;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("Enabling ", x, L.headerTextY);
  x += doc.getTextWidth("Enabling ");
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text("AI", x, L.headerTextY);
  x += doc.getTextWidth("AI");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.text(" for your ", x, L.headerTextY);
  x += doc.getTextWidth(" for your ");
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text("Real Estate", x, L.headerTextY);
  x += doc.getTextWidth("Real Estate");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text(" Business", x, L.headerTextY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  const inW = doc.getTextWidth(".in");
  const bW = doc.getTextWidth("buildesk");
  const wW = doc.getTextWidth("www.");
  doc.text("www.", L.rightEdge - inW - bW - wW, L.headerTextY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text("buildesk", L.rightEdge - inW - bW, L.headerTextY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.text(".in", L.rightEdge - inW, L.headerTextY);
}

function addPageNumber(doc: jsPDF, num: number): void {
  doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.roundedRect(L.pageNumPillX, L.pageNumPillY, L.pageNumPillW, L.pageNumPillH, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.pagePill);
  doc.setTextColor(255, 255, 255);
  doc.text(String(num), L.rightEdge - 5, L.pageNumTextY, { align: "center" });
}

function renderCoverPage(doc: jsPDF, proposal: Proposal, images: Record<string, string>): void {
  doc.addImage(images.coverBg, imageDataFormat(images.coverBg), 0, 0, PAGE_W, PAGE_H);

  doc.addImage(images.logoBuildesk, imageDataFormat(images.logoBuildesk), L.coverTitleX, 10, 55, 20);
  doc.addImage(images.logoCravingcode, imageDataFormat(images.logoCravingcode), 118, 12, 74, 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(L.coverTitleSize);
  doc.setTextColor(255, 255, 255);

  let ty = L.coverTitleY;
  for (const line of COVER_TITLE_LINES) {
    doc.text(line, L.coverTitleX, ty);
    ty += L.coverTitleLineGap;
  }

  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.setFontSize(L.coverTitleSize);
  doc.text(`For ${proposal.customerName}`, L.coverTitleX, ty + 2);

  const users = useAppStore.getState().users;
  const rep = users.find((u) => u.id === proposal.assignedTo);
  const repPhone = (rep as { phone?: string } | undefined)?.phone ?? "";
  const roleDisplay = toTitleCase((rep?.role ?? "").replace(/_/g, " "));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(L.coverContactFont);
  doc.setTextColor(255, 255, 255);
  doc.text(cleanName(proposal.assignedToName), L.rightEdge, L.coverRepNameY, { align: "right" });

  doc.setFont("helvetica", "normal");
  if (roleDisplay) doc.text(roleDisplay, L.rightEdge, L.coverRepRoleY, { align: "right" });
  if (repPhone) doc.text(repPhone, L.rightEdge, L.coverRepPhoneY, { align: "right" });

  doc.text("Cravingcode Technologies Pvt. Ltd.", L.rightEdge, L.coverCompanyY, { align: "right" });
  doc.text(`Submitted on: ${formatProposalDate(proposal.createdAt)}`, L.rightEdge, L.coverSubmittedY, {
    align: "right",
  });
}

function renderVersionPage(
  doc: jsPDF,
  proposal: Proposal,
  images: Record<string, string>,
  autoTable: (doc: jsPDF, options: object) => void,
  pageNum: number,
): void {
  addPageHeader(doc);

  doc.addImage(
    images.meetingPhoto,
    imageDataFormat(images.meetingPhoto),
    L.meetingPhotoX,
    L.meetingPhotoY,
    L.meetingPhotoW,
    L.meetingPhotoH,
  );

  const users = useAppStore.getState().users;
  const versionData =
    proposal.versionHistory?.map((v) => {
      const user = users.find((u) => u.id === v.createdBy);
      const userName = user ? `Mr. ${user.name}` : v.createdBy;
      const comment =
        v.notes?.trim() ||
        "This is the First version of Proposal to be submitted for Buildesk Annual Licenses.";
      return [
        Number(v.version ?? 1).toFixed(1),
        formatProposalDate(v.createdAt ?? proposal.createdAt),
        userName,
        comment,
      ];
    }) ?? [
      [
        Number(proposal.currentVersion || 1).toFixed(1),
        formatProposalDate(proposal.createdAt),
        `Mr. ${proposal.assignedToName}`,
        "This is the First version of Proposal to be submitted for Buildesk Annual Licenses.",
      ],
    ];

  autoTable(doc, {
    startY: L.versionTableStartY,
    head: [["Version", "Date", "Name", "Comments"]],
    body: versionData,
    theme: "grid",
    headStyles: {
      fillColor: [217, 217, 217],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 10,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      cellPadding: 3,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [40, 40, 40],
      fontSize: 10,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      cellPadding: 3,
      minCellHeight: 16,
    },
    columnStyles: {
      0: { cellWidth: L.vColVersion, halign: "left" },
      1: { cellWidth: L.vColDate, halign: "left" },
      2: { cellWidth: L.vColName, halign: "left" },
      3: { cellWidth: L.vColComments, halign: "left" },
    },
    margin: { left: L.marginLeft, right: L.marginRight },
  });

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.sectionHdr);
  doc.setTextColor(0, 0, 0);
  doc.text("Proprietary Notice", PAGE_W / 2, afterTable, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT.body);
  doc.setTextColor(60, 60, 60);
  const notice =
    "This proposal contains information that is considered confidential by Cravingcode Technologies Pvt. Ltd. and is provided for the sole purpose of permitting the recipient to evaluate the proposal. In consideration of receipt of this document, the recipient agrees to maintain such information in confidence and not to reproduce or otherwise disclose this information to any person outside the group directly responsible for the evaluation of its contents.";
  renderParagraph(doc, notice, L.marginLeft, afterTable + 8, L.contentWidth, 5.5, FONT.body);

  addPageNumber(doc, pageNum);
}

function renderCoverLetterPage(
  doc: jsPDF,
  proposal: Proposal,
  images: Record<string, string>,
  pageNum: number,
): void {
  addPageHeader(doc);

  const bodyTextX = L.arrowX + L.arrowW + 5;
  const bodyTextWidth = L.rightEdge - bodyTextX;

  doc.addImage(images.blueArrow, imageDataFormat(images.blueArrow), L.arrowX, L.arrowY, L.arrowW, L.arrowH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT.body);
  doc.setTextColor(40, 40, 40);
  doc.text(`Date: ${formatProposalDate(proposal.createdAt)}`, L.marginLeft, L.contentStartY);

  doc.text("To,", L.marginLeft, 30);
  doc.setFont("helvetica", "bold");
  doc.text(proposal.customerName, L.marginLeft, 36);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.body);
  doc.text("Re: Enclosed Proposal for Buildesk Annual Sales Management License", L.marginLeft, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT.body);
  doc.setTextColor(50, 50, 50);

  let y = 58;

  y = renderParagraph(
    doc,
    "At Cravingcode Technologies we are aware that creating client-oriented software takes a mixture of technical excellence and clear communication and our firm hires only the very best to ensure you receive both. We know that every client is unique and we strive to deliver an individual, innovative and affordable proposal every time and to follow it through with an outstanding delivery which is both on time and within budget.",
    bodyTextX,
    y,
    bodyTextWidth,
    5.5,
    FONT.body,
  );
  y += 5;

  y = renderParagraph(
    doc,
    "We have over 8 years of development in this area and our previous clients include Gurukrupa Builders & Developers, Balaji Developers, Baradiya Group, Haware, Realty Assistant, Globe Group, Antilla, Smile Homes, RC Group, Nakshatra Group, JMD infra, Akar Housing Developer, Balaji Group, Dayaar Group and many more. Please let us know if you would like to get in touch with our existing clients from whom you will receive nothing but positive endorsements.",
    bodyTextX,
    y,
    bodyTextWidth,
    5.5,
    FONT.body,
  );
  y += 5;

  y = renderParagraph(
    doc,
    "We also pride ourselves on our after-sales client-care including our guarantees, staff-training, and onsite and offsite support.",
    bodyTextX,
    y,
    bodyTextWidth,
    5.5,
    FONT.body,
  );
  y += 5;

  y = renderParagraph(
    doc,
    "Finally, we realize that you are very busy and wanted to thank you in advance for your time spent reviewing our proposal.",
    bodyTextX,
    y,
    bodyTextWidth,
    5.5,
    FONT.body,
  );

  const arrowBottom = L.arrowY + L.arrowH;
  const signatureY = Math.max(arrowBottom, y) + 12;

  doc.setTextColor(40, 40, 40);
  doc.text("Yours Truly,", L.marginLeft, signatureY);
  doc.setFont("helvetica", "bold");
  doc.text(cleanName(proposal.assignedToName), L.marginLeft, signatureY + 10);

  addPageNumber(doc, pageNum);
}

const ROWS_PER_COMMERCIAL_PAGE = 10;

function chunkLineItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks.length ? chunks : [[]];
}

function renderCommercialSection(
  doc: jsPDF,
  proposal: Proposal,
  autoTable: (doc: jsPDF, options: object) => void,
  pageNum: number,
  chunk: ProposalLineItem[],
  chunkIndex: number,
  totalChunks: number,
  globalOffset: number,
  totalToShow: number,
): void {
  addPageHeader(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.commercialTitle);
  doc.setTextColor(0, 0, 0);
  doc.text("Commercial", L.marginLeft, L.contentStartY);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  const comW = doc.getTextWidth("Commercial");
  doc.line(L.marginLeft, L.contentStartY + 1.5, L.marginLeft + comW, L.contentStartY + 1.5);

  const moduleHeading = `Module 1: Buildesk Annual End to End Sales Management — ${proposal.title}`;
  doc.setFontSize(FONT.moduleTitle);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  const moduleLines = doc.splitTextToSize(moduleHeading, L.contentWidth);
  doc.text(moduleLines, L.marginLeft, 30);
  const tableStart = 30 + moduleLines.length * 6 + 4;

  const tableBody: unknown[] = chunk.map((item, idx) => [
    globalOffset + idx + 1,
    item.name + (item.description ? `\n${item.description}` : ""),
    getServiceLabel(item),
    formatINR(Math.round(lineAmountExTax(item))),
  ]);

  if (chunkIndex === totalChunks - 1) {
    tableBody.push([
      {
        content: "Total",
        colSpan: 3,
        styles: { halign: "right", fontStyle: "bold", fontSize: FONT.tableBody },
      },
      {
        content: formatINRTotal(Math.round(totalToShow)),
        styles: {
          halign: "right",
          fontStyle: "bold",
          textColor: [BLUE[0], BLUE[1], BLUE[2]],
          fontSize: 10,
        },
      },
    ]);
  }

  autoTable(doc, {
    startY: tableStart,
    head: [["Sr. No.", "Description", "Service", "Annual License Cost (in INR)"]],
    body: tableBody as never,
    theme: "grid",
    headStyles: {
      fillColor: [BLUE[0], BLUE[1], BLUE[2]],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      lineColor: [BLUE[0], BLUE[1], BLUE[2]],
      lineWidth: 0.3,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [40, 40, 40],
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center", cellWidth: L.comColSr },
      1: { halign: "left", cellWidth: L.comColDesc },
      2: { halign: "center", cellWidth: L.comColSvc },
      3: { halign: "right", cellWidth: L.comColCost },
    },
    margin: { left: L.marginLeft, right: L.marginRight },
    didParseCell: (data) => {
      const body = tableBody as { colSpan?: number }[][];
      const lastRow = body[body.length - 1];
      if (
        data.row.index === body.length - 1 &&
        Array.isArray(lastRow) &&
        lastRow[0] &&
        typeof lastRow[0] === "object" &&
        "colSpan" in (lastRow[0] as object)
      ) {
        data.cell.styles.fillColor = [235, 244, 252];
        data.cell.styles.fontStyle = "bold";
        if (data.column.index === 3) {
          data.cell.styles.textColor = [BLUE[0], BLUE[1], BLUE[2]];
          data.cell.styles.fontSize = 10;
        }
      }
    },
  });

  if (proposal.customerNotes && chunkIndex === totalChunks - 1) {
    const noteY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT.tableBody);
    doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
    doc.text("NOTE:", L.marginLeft, noteY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    renderParagraph(doc, proposal.customerNotes, L.marginLeft, noteY + 5, L.contentWidth, 5, FONT.bodySmall);
  }

  addPageNumber(doc, pageNum);
}

const DEFAULT_TERMS = [
  "18% GST is applicable on the final total.",
  "100% payment has to be done in advance.",
  "Post sales are offered as an individual service, and it will need to be renewed annually.",
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

function renderTermsPage(doc: jsPDF, proposal: Proposal, pageNum: number): void {
  addPageHeader(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.termsTitle);
  doc.setTextColor(0, 0, 0);
  doc.text("Terms & Conditions", L.marginLeft, L.contentStartY);

  const terms = [...DEFAULT_TERMS];
  if (proposal.paymentTerms) terms[1] = proposal.paymentTerms;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);
  const yStart = L.contentStartY + 10;
  renderBulletList(doc, terms, L.marginLeft, yStart, L.contentWidth, 5.2, 2.5, 9.5);

  addPageNumber(doc, pageNum);
}

type SlaSection = {
  title?: string;
  paragraphs: string[];
  bullets?: string[];
};

const SLA_SECTIONS: SlaSection[] = [
  {
    title: "Introduction",
    paragraphs: [
      "This document describes the services Buildesk has agreed to provide to LICENSEE and the corresponding individual roles and responsibilities. The roles and responsibilities are defined and apply to both parties. Periodic reviews will occur to ensure that roles and responsibilities remain well understood and communication lines remain open.",
      "The following services have been identified as required by LICENSEE in its operation of the Buildesk supplied system. The services have been customized to the installation and the unique requirements of LICENSEE.",
      "This SLA covers the following services provided within the Maintenance Fee:",
    ],
    bullets: [
      "O&M Role: Offsite operation and maintenance of the system normal working hours and working days.",
      "Buildesk AMC Support: Email support and telephonic support during the hours specified later in this agreement for software deployed by Buildesk.",
    ],
  },
  {
    title: "Technical Assistance Center (TAC)",
    paragraphs: [
      "Customer Service Requests (CSR's) can be delivered by e-mail or phone to Buildesk's customer support department. Buildesk will accept any reasonable request. The local support center will provide Tier 1, Tier 2 and Tier 3 support during the defined support hours.",
      "The following will NOT be logged as software defects:",
    ],
    bullets: [
      "Requests for additional functionality, or enhancements to existing functionality. These must be passed to Buildesk customer support as Enhancements.",
      "Requests for quotations (e.g. for additional licenses, extra documentation, etc). Such requests should be passed to the Buildesk sales account manager.",
      "UNIX/Windows NT/Database queries not related to the product's operation.",
    ],
  },
  {
    title: "Buildesk Support Role",
    paragraphs: [
      "Provide technical support staff to man helpdesk and provide Tier 1 and 2 support via Buildesk systems and personnel during the agreed Support Hours Monday through Friday.",
      "Cravingcode Technologies Pvt. Ltd. | nishant@cravingcode.in",
      "Customer team will require to provide all details requested by Buildesk and will use all reasonable endeavours to provide full details of any problems found, including: Full error messages, Log files, Actions/events performed prior to the problem, Repeatability, Workaround found, System administrator activity, and other relevant information.",
    ],
  },
  {
    title: "Technical Support",
    paragraphs: ["Customers maintain their own systems and environment with assistance from Buildesk.", "Buildesk Support Role:"],
    bullets: [
      "Diagnose issues related to the delivered product(s).",
      "Support escalation based on service level agreement.",
      "Ownership and responsibility of the Buildesk systems configuration management.",
      "Systems scripts and configurations are maintained and managed based on business requirements.",
      "Any updates to the configurations are provided by Buildesk as changes are made to ensure successful support.",
      "Provide single point of contact for system administration and database administration.",
      "Ensure that sales team and marketing team receive training on the Buildesk systems.",
      "Complete the testing and release verification upon completion of installations.",
    ],
  },
  {
    title: "Software Problem Resolution",
    paragraphs: ["Buildesk resolves the Buildesk product problems in concert with the customer.", "Buildesk Support Role:"],
    bullets: [
      "Manage the identification and isolation of software problems as reported by customer.",
      "Receive, log and case assignment and tracking Buildesk software problems.",
      "Based on priority level, escalate and resolve software product issues using automated rules-based methodology.",
      "Provide prioritization based on criteria agreed to with the customer.",
      "Trend analysis and reporting on maintenance activity.",
      "Provide single point of contact for system administration and database administration.",
      "Manage 3rd party software not supplied by Buildesk.",
    ],
  },
  {
    paragraphs: [
      "Buildesk Support team provides the installation and patch releases to customer for deployment. In case required, Buildesk provides remote installation assistance on customer provided server.",
      "Buildesk Support Role:",
    ],
    bullets: [
      "Provide software patches and workarounds.",
      "Provide product maintenance releases.",
      "Buildesk may choose to include minor enhancements in maintenance releases depending on scale and scope.",
      "Major features will be included in major releases and are not included in the service level agreement.",
      "Provide installation of maintenance support and patch releases.",
      "Provide change control requirements as required.",
      "Provide a point of coordination and approval for installation of test and production releases.",
    ],
  },
];

const LINE_HEIGHT = 5.2;

function renderParagraphBlock(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
): number {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function sectionHeading(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(title, L.marginLeft, y);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(L.marginLeft, y + 1.5, L.marginLeft + doc.getTextWidth(title), y + 1.5);
  return y + 7;
}

function renderSLAPages(doc: jsPDF, startPageNum: number): number {
  addPageHeader(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.pageTitle);
  doc.setTextColor(0, 0, 0);
  doc.text("Annexure: Buildesk SLA", L.marginLeft, L.contentStartY);

  let pageNum = startPageNum;
  let y = 32;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(50, 50, 50);

  const ensureSpace = (needed: number): void => {
    if (y + needed > L.footerBreakY) {
      addPageNumber(doc, pageNum);
      pageNum += 1;
      doc.addPage();
      addPageHeader(doc);
      y = 32;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(50, 50, 50);
    }
  };

  for (const section of SLA_SECTIONS) {
    if (section.title) {
      ensureSpace(16);
      y = sectionHeading(doc, section.title, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(50, 50, 50);
    }

    for (const para of section.paragraphs) {
      const lines = doc.splitTextToSize(para, L.contentWidth);
      const h = lines.length * LINE_HEIGHT + 4;
      ensureSpace(h);
      y = renderParagraphBlock(doc, para, L.marginLeft, y, L.contentWidth, LINE_HEIGHT, 9.5) + 4;
    }

    if (section.bullets?.length) {
      ensureSpace(20);
      y = renderBulletList(doc, section.bullets, L.marginLeft, y, L.contentWidth, 5.2, 2, 9.5);
      y += 2;
    }
  }

  addPageNumber(doc, pageNum);
  return pageNum;
}

export async function generateProposalPdf(proposal: Proposal): Promise<void> {
  const [jsPDFModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF = jsPDFModule.default;
  const autoTable = autoTableModule.default;

  const images = await preloadProposalImages();
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  renderCoverPage(doc, proposal, images);

  let pageNum = 1;

  doc.addPage();
  renderVersionPage(doc, proposal, images, autoTable, pageNum++);

  doc.addPage();
  renderCoverLetterPage(doc, proposal, images, pageNum++);

  doc.addPage();

  const chunks = chunkLineItems(proposal.lineItems, ROWS_PER_COMMERCIAL_PAGE);
  const displayTotal = proposal.lineItems.reduce((sum, item) => sum + lineAmountExTax(item), 0);
  const totalToShow = proposal.finalQuoteValue ?? displayTotal;

  chunks.forEach((chunk, idx) => {
    if (idx > 0) doc.addPage();
    renderCommercialSection(
      doc,
      proposal,
      autoTable,
      pageNum++,
      chunk,
      idx,
      chunks.length,
      idx * ROWS_PER_COMMERCIAL_PAGE,
      totalToShow,
    );
  });

  doc.addPage();
  renderTermsPage(doc, proposal, pageNum++);

  doc.addPage();
  renderSLAPages(doc, pageNum);

  doc.save(`Proposal-${proposal.proposalNumber}.pdf`);
}
