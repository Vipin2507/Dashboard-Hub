import type { Express, Request, Response } from "express";
import { db } from "./db.js";
import type { Proposal } from "../src/types/index";
import { composeProposalPdf } from "../src/lib/proposalPdfCore";
import { loadProposalPdfAssets } from "./loadProposalPdfAssets";

function pdfExportAuthorized(req: Request): boolean {
  const key = process.env.PROPOSAL_PDF_EXPORT_KEY;
  if (!key || String(key).trim() === "") return true;
  const header = req.headers["x-proposal-pdf-key"];
  const fromHeader = typeof header === "string" ? header : Array.isArray(header) ? header[0] : "";
  const fromQuery = typeof req.query.token === "string" ? req.query.token : "";
  return fromHeader === key || fromQuery === key;
}

export function registerProposalPdfRoutes(app: Express): void {
  app.get("/api/proposals/:id/pdf", async (req: Request, res: Response) => {
    if (!pdfExportAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const row = db.prepare("SELECT data FROM proposals WHERE id = ?").get(req.params.id) as { data: string } | undefined;
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let proposal: unknown;
    try {
      proposal = JSON.parse(row.data);
    } catch {
      res.status(500).json({ error: "Invalid proposal data" });
      return;
    }

    const userRows = db
      .prepare("SELECT id, name, role, phone FROM users")
      .all() as { id: string; name: string; role: string; phone: string | null }[];

    try {
      const images = await loadProposalPdfAssets();
      const pdfDoc = await composeProposalPdf(proposal as Proposal, images, userRows);
      const out = pdfDoc.output("arraybuffer") as ArrayBuffer;
      const buf = Buffer.from(out);
      const num = (proposal as { proposalNumber?: string }).proposalNumber ?? req.params.id;
      const safeName = `Proposal-${String(num).replace(/[^\w.\-]+/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("Content-Length", String(buf.length));
      res.send(buf);
    } catch (e) {
      console.error("[proposal pdf]", e);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });
}
