import { AIAssistantProvider } from "@/components/AIAssistantSidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileShellHeader } from "@/components/MobileShellHeader";
import { SidebarNavProvider, useSidebarNav } from "@/contexts/SidebarNavContext";
import { useCoreEntityQueries } from "@/hooks/useCoreEntityQueries";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { cn } from "@/lib/utils";
import { pageEnter } from "@/lib/motion";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

function AppLayoutShell() {
  useCoreEntityQueries();
  useRealtimeSync();
  const location = useLocation();
  const { sidebarOpen, closeSidebar, isLgUp, collapsed } = useSidebarNav();

  useEffect(() => {
    if (!isLgUp) closeSidebar();
  }, [location.pathname, isLgUp, closeSidebar]);

  useEffect(() => {
    if (isLgUp || !sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLgUp, sidebarOpen, closeSidebar]);

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-background">
      {isLgUp ? (
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-[width] duration-300 ease-out",
            collapsed ? "w-[52px]" : "w-52",
          )}
        >
          <AppSidebar onClose={() => undefined} collapsed={collapsed} />
        </aside>
      ) : (
        <>
          {sidebarOpen && (
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-black/50"
              onClick={closeSidebar}
            />
          )}
          <aside
            id="app-sidebar"
            aria-hidden={!sidebarOpen}
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-52 max-w-[min(13rem,100vw)] flex-col bg-sidebar shadow-elevated",
              "transition-transform duration-300 ease-out",
              sidebarOpen ? "translate-x-0" : "pointer-events-none -translate-x-full",
            )}
          >
            <AppSidebar onClose={closeSidebar} collapsed={false} />
          </aside>
        </>
      )}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-out",
          collapsed ? "lg:pl-[52px]" : "lg:pl-52",
        )}
      >
        <MobileShellHeader />
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <motion.div key={location.pathname} className="w-full p-3 sm:p-4 lg:p-5" {...pageEnter}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarNavProvider>
      <AIAssistantProvider>
        <AppLayoutShell />
      </AIAssistantProvider>
    </SidebarNavProvider>
  );
}
