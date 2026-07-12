const ORDINAL_WORDS: Record<number, string> = {
  1: "First",
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Fifth",
  6: "Sixth",
  7: "Seventh",
  8: "Eighth",
  9: "Ninth",
  10: "Tenth",
  11: "Eleventh",
  12: "Twelfth",
  13: "Thirteenth",
  14: "Fourteenth",
  15: "Fifteenth",
  16: "Sixteenth",
  17: "Seventeenth",
  18: "Eighteenth",
  19: "Nineteenth",
  20: "Twentieth",
};

function numericOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
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

/** e.g. 1 → "First", 2 → "Second", 21 → "21st" */
export function versionOrdinalLabel(version: number): string {
  const v = Math.max(1, Math.floor(Number(version) || 1));
  return ORDINAL_WORDS[v] ?? `${v}${numericOrdinalSuffix(v)}`;
}

/** Comment shown in the proposal PDF version table (page 2). */
export function formatProposalVersionComment(version: number): string {
  const label = versionOrdinalLabel(version);
  return `This is the ${label} Version of Proposal to be submitted for Buildesk Annual Licenses`;
}
