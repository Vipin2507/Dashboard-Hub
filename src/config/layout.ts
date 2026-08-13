/**
 * Shell layout tokens. Breakpoint must stay in sync with Tailwind `lg` (1024px).
 */
export const SIDEBAR_RAIL_BREAKPOINT_PX = 1024;

export const layoutTokens = {
  /** Expanded navy rail — Tailwind `w-52` */
  sidebarWidthPx: 208,
  /** Collapsed icon rail */
  sidebarRailWidthPx: 52,
  sidebarDrawerMaxPx: 208,
  topbarHeightRem: 3.5,
} as const;

export const SIDEBAR_COLLAPSED_KEY = "buildesk_sidebar_collapsed";
