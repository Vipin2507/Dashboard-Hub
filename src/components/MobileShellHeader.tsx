import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';
import { useSidebarNav } from '@/contexts/SidebarNavContext';
import { Menu } from 'lucide-react';

/**
 * Sticky header for viewports below `lg`: menu, brand, notifications, account.
 * Ensures navigation is available on pages that do not render {@link Topbar}.
 */
export function MobileShellHeader() {
  const { sidebarOpen, openSidebar } = useSidebarNav();

  return (
    <header
      className="sticky top-0 z-[35] flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2 dark:border-gray-800 dark:bg-gray-900 sm:px-3 lg:hidden"
      role="banner"
    >
      <button
        type="button"
        onClick={openSidebar}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 sm:h-9 sm:w-9"
        aria-label="Open menu"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="flex-shrink-0 text-base font-bold text-blue-600">Buildesk</span>
      <div className="min-w-0 flex-1" aria-hidden />
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
