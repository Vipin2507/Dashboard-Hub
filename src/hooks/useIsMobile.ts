import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * True below Tailwind `lg` (1024px) — phone + tablet in drawer/hamburger layout.
 * Matches spec: sidebar rail only at `lg+`.
 */
export function useIsMobile() {
  const { isMobileNav } = useBreakpoint();
  return isMobileNav;
}
