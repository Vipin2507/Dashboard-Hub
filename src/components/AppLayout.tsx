import { AppSidebar } from '@/components/AppSidebar';
import { SidebarNavProvider, useSidebarNav } from '@/contexts/SidebarNavContext';
import { cn } from '@/lib/utils';
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
      {/* Desktop sidebar — fixed rail, visible lg+ only */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col',
          'hidden lg:flex',
        )}
        aria-hidden={false}
      >
        <AppSidebar onClose={() => {}} />
      </aside>

      {/* Mobile / tablet overlay — only when drawer open */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Mobile / tablet drawer — always mounted; slide in/out below lg */}
      <aside
        id="app-sidebar"
        aria-hidden={!sidebarOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[min(18rem,100vw)] flex-col shadow-lg',
          'lg:hidden',
          'transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
      >
        <AppSidebar onClose={closeSidebar} />
      </aside>

      {/* Main column — offset by rail width on lg+ */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-5 lg:p-6">
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
