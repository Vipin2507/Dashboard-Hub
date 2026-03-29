import { useEffect, useState } from 'react';
import { SIDEBAR_RAIL_BREAKPOINT_PX } from '@/config/layout';

function getIsLgUp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(min-width: ${SIDEBAR_RAIL_BREAKPOINT_PX}px)`).matches;
}

/**
 * `isLgUp`: persistent sidebar rail (Tailwind `lg` and up).
 * `isMobileNav`: overlay / drawer navigation.
 */
export function useBreakpoint() {
  const [isLgUp, setIsLgUp] = useState(getIsLgUp);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SIDEBAR_RAIL_BREAKPOINT_PX}px)`);
    const onChange = () => setIsLgUp(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return { isLgUp, isMobileNav: !isLgUp };
}
