/**
 * Shell layout tokens. Breakpoint must stay in sync with Tailwind `lg` (1024px).
 */
export const SIDEBAR_RAIL_BREAKPOINT_PX = 1024;

export const layoutTokens = {
  /** Matches Tailwind `w-64` / CloudPanel-style rail */
  sidebarWidthPx: 256,
  sidebarDrawerMaxPx: 288,
  topbarHeightRem: 3.5,
} as const;
