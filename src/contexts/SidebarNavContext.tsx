import { SIDEBAR_COLLAPSED_KEY } from "@/config/layout";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type SidebarNavContextValue = {
  isLgUp: boolean;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
};

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function SidebarNavProvider({ children }: { children: React.ReactNode }) {
  const { isLgUp } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    setCollapsedState(readCollapsed());
  }, []);

  useEffect(() => {
    if (isLgUp) setSidebarOpen(false);
  }, [isLgUp]);

  useEffect(() => {
    if (isLgUp || !sidebarOpen) {
      document.body.style.overflow = "";
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isLgUp, sidebarOpen]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  const value = useMemo(
    () => ({
      isLgUp,
      sidebarOpen,
      openSidebar,
      closeSidebar,
      toggleSidebar,
      collapsed,
      setCollapsed,
      toggleCollapsed,
    }),
    [isLgUp, sidebarOpen, openSidebar, closeSidebar, toggleSidebar, collapsed, setCollapsed, toggleCollapsed],
  );

  return <SidebarNavContext.Provider value={value}>{children}</SidebarNavContext.Provider>;
}

export function useSidebarNav() {
  const ctx = useContext(SidebarNavContext);
  if (!ctx) throw new Error("useSidebarNav must be used within SidebarNavProvider");
  return ctx;
}
