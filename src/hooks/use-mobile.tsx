import * as React from "react";

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
