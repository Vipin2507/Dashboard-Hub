import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

type SidebarNavContextValue = {
  isLgUp: boolean;
  /** Mobile/tablet drawer open state */
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

export function SidebarNavProvider({ children }: { children: React.ReactNode }) {
  const { isLgUp } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLgUp) setSidebarOpen(false);
  }, [isLgUp]);

  useEffect(() => {
    if (isLgUp || !sidebarOpen) {
      document.body.style.overflow = '';
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isLgUp, sidebarOpen]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  const value = useMemo(
    () => ({
      isLgUp,
      sidebarOpen,
      openSidebar,
      closeSidebar,
      toggleSidebar,
    }),
    [isLgUp, sidebarOpen, openSidebar, closeSidebar, toggleSidebar],
  );

  return <SidebarNavContext.Provider value={value}>{children}</SidebarNavContext.Provider>;
}

export function useSidebarNav() {
  const ctx = useContext(SidebarNavContext);
  if (!ctx) throw new Error('useSidebarNav must be used within SidebarNavProvider');
  return ctx;
}
