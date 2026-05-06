function sanitizeCompanyName(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s
    .replaceAll("|", "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractSequence(proposalNumber: string): number | null {
  const s = (proposalNumber ?? "").trim();
  if (!s) return null;

  // New format: "PROP-0042 || Company"
  const m1 = /^PROP-(\d+)\s*\|\|/i.exec(s);
  if (m1?.[1]) {
    const n = Number.parseInt(m1[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  // Old formats: "PROP-2026-0042" or "PROP-0042"
  const m2 = /^PROP-(?:\d{4}-)?(\d+)\b/i.exec(s);
  if (m2?.[1]) {
    const n = Number.parseInt(m2[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

export function makeProposalNumber(existingProposalNumbers: string[]) {
  const max = existingProposalNumbers.reduce((m, p) => {
    const n = extractSequence(p);
    return n == null ? m : Math.max(m, n);
  }, 0);

  return (companyName?: string) => {
    const seq = String(max + 1).padStart(4, "0");
    const company = sanitizeCompanyName(companyName);
    return company ? `PROP-${seq} || ${company}` : `PROP-${seq}`;
  };
}

