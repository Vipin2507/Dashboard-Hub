import type { Proposal } from "@/types";
import { formatINR } from "@/lib/rbac";

export function generateProposalPdf(proposal: Proposal): void {
  // Dynamic import so app doesn't break if jspdf not installed
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(({ default: autoTable }) => {
      const doc = new jsPDF();
      const pageW = doc.getPageWidth();
      let y = 20;

      // Header
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("Buildesk", 20, y);
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(128, 128, 128);
      doc.text("PROPOSAL", pageW - 20, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 14;

      doc.setFontSize(10);
      doc.text(`Proposal #: ${proposal.proposalNumber}`, 20, y);
      doc.text(`Date: ${new Date(proposal.createdAt).toLocaleDateString("en-IN")}`, 20, y + 6);
      doc.text(`Valid until: ${proposal.validUntil}`, 20, y + 12);
      y += 24;

      doc.setDrawColor(200, 200, 200);
      doc.line(20, y, pageW - 20, y);
      y += 14;

      // Prepared for
      doc.setFont("helvetica", "bold");
      doc.text("Prepared for:", 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(proposal.customerName, 20, y + 6);
      y += 20;

      // Line items table
      const tableData = proposal.lineItems.map((li, i) => [
        i + 1,
        li.name,
        li.sku,
        li.qty,
        formatINR(li.unitPrice),
        `${li.discount}%`,
        formatINR(li.lineTotal),
        `${li.taxRate}%`,
        formatINR(li.taxAmount),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["#", "Item", "SKU", "Qty", "Unit Price", "Disc%", "Line Total", "GST%", "GST Amt"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [60, 60, 60] },
        margin: { left: 20, right: 20 },
      });
      y = (doc as any).lastAutoTable.finalY + 14;

      // Totals (right-aligned)
      const right = pageW - 20;
      doc.setFont("helvetica", "normal");
      doc.text("Subtotal:", right - 50, y);
      doc.text(formatINR(proposal.subtotal), right, y, { align: "right" });
      y += 6;
      doc.text("Total Discount:", right - 50, y);
      doc.text(`-${formatINR(proposal.totalDiscount)}`, right, y, { align: "right" });
      y += 6;
      doc.text("Total GST:", right - 50, y);
      doc.text(formatINR(proposal.totalTax), right, y, { align: "right" });
      y += 8;
      doc.setDrawColor(180, 180, 180);
      doc.line(right - 60, y, right, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Grand Total:", right - 50, y);
      doc.text(formatINR(proposal.finalQuoteValue ?? proposal.grandTotal), right, y, { align: "right" });
      y += 20;

      // Customer notes
      if (proposal.customerNotes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Customer Notes:", 20, y);
        doc.text(proposal.customerNotes, 20, y + 6, { maxWidth: pageW - 40 });
        y += 20;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`This proposal is valid until ${proposal.validUntil}.`, 20, y);
      doc.text(`Page 1 of 1`, pageW / 2, y, { align: "center" });

      doc.save(`Proposal-${proposal.proposalNumber}.pdf`);
    });
  }).catch(() => {
    console.warn("jspdf or jspdf-autotable not installed. Run: npm install jspdf jspdf-autotable");
  });
}
