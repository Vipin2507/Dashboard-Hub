import type { Proposal } from "@/types";
import { preloadProposalImages } from "@/assets/proposal/images";
import { useAppStore } from "@/store/useAppStore";
import { composeProposalPdf } from "./proposalPdfCore";

export { composeProposalPdf } from "./proposalPdfCore";

export async function generateProposalPdf(proposal: Proposal): Promise<void> {
  const users = useAppStore.getState().users;
  const images = await preloadProposalImages();
  const doc = await composeProposalPdf(proposal, images, users);
  doc.save(`Proposal-${proposal.proposalNumber}.pdf`);
}
