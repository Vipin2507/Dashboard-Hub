import { useAppStore } from '@/store/useAppStore';
import { ROLE_LABELS } from '@/types';
import { LogOut, Menu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { useSidebarNav } from '@/contexts/SidebarNavContext';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Optional override (defaults to shell context openSidebar) */
  onMenuClick?: () => void;
}

export function Topbar({ title, subtitle, actions, onMenuClick }: TopbarProps) {
  const me = useAppStore((s) => s.me);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();
  const { isLgUp, sidebarOpen, openSidebar } = useSidebarNav();
  const handleMenu = onMenuClick ?? openSidebar;

  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2 sm:gap-3 sm:px-4 lg:px-6">
      {!isLgUp && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 lg:hidden"
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          onClick={handleMenu}
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      <span className="shrink-0 text-lg font-bold text-primary lg:hidden">Buildesk</span>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg lg:text-xl">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 hidden text-sm leading-snug text-muted-foreground sm:line-clamp-2 sm:block">{subtitle}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        <NotificationBell />
        <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
          <span className="max-w-[7rem] truncate font-medium text-foreground lg:max-w-[12rem]">{me.name}</span>
          <Badge variant="outline" className="hidden shrink-0 text-xs font-normal lg:inline-flex">
            {ROLE_LABELS[me.role]}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-muted-foreground sm:h-9 sm:w-9"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
