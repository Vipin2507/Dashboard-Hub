import { AppSidebar } from '@/components/AppSidebar';
import { SidebarNavProvider, useSidebarNav } from '@/contexts/SidebarNavContext';
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

function AppLayoutShell() {
  const { sidebarOpen, closeSidebar, isLgUp } = useSidebarNav();

  useEffect(() => {
    if (isLgUp || !sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLgUp, sidebarOpen, closeSidebar]);

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-background">
      {/* Desktop sidebar — fixed rail lg+ */}
      <aside
        className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
        aria-hidden={false}
      >
        <AppSidebar onClose={() => {}} />
      </aside>

      {/* Mobile / tablet drawer */}
      {sidebarOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={closeSidebar}
          />
          <aside
            id="app-sidebar"
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[min(18rem,100vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-lg lg:hidden"
          >
            <AppSidebar onClose={closeSidebar} />
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarNavProvider>
      <AppLayoutShell />
    </SidebarNavProvider>
  );
}
