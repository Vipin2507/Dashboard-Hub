import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProposalPdfImageSet } from "../src/types/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, "..", "src", "assets", "proposal");

async function toDataUrl(fileName: string, mime: string): Promise<string> {
  const buf = await readFile(join(ASSET_DIR, fileName));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Load template images from disk (Node / n8n PDF route). Unoptimized vs browser preload — larger PDFs. */
export async function loadProposalPdfAssets(): Promise<ProposalPdfImageSet> {
  const [coverBg, logoBuildesk, logoCravingcode, meetingPhoto, blueArrow] = await Promise.all([
    toDataUrl("cover_bg.png", "image/png"),
    toDataUrl("logo_buildesk.png", "image/png"),
    toDataUrl("logo_cravingcode.png", "image/png"),
    toDataUrl("meeting_photo.jpg", "image/jpeg"),
    toDataUrl("blue_arrow.png", "image/png"),
  ]);
  return { coverBg, logoBuildesk, logoCravingcode, meetingPhoto, blueArrow };
}
