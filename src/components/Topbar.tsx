import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';
import { useSidebarNav } from '@/contexts/SidebarNavContext';
import { Menu } from 'lucide-react';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Optional override (defaults to shell context openSidebar) */
  onMenuClick?: () => void;
}

export function Topbar({ title, subtitle, actions, onMenuClick }: TopbarProps) {
  const { sidebarOpen, openSidebar } = useSidebarNav();
  const handleMenu = onMenuClick ?? openSidebar;

  return (
    <header
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900"
    >
      {/* Hamburger — mobile / tablet only */}
      <button
        type="button"
        onClick={handleMenu}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
        aria-label="Open menu"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Brand — mobile only (desktop lives in sidebar) */}
      <span className="flex-shrink-0 text-base font-bold text-blue-600 lg:hidden">Buildesk</span>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg lg:text-xl">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 hidden text-sm leading-snug text-muted-foreground sm:line-clamp-2 sm:block">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
