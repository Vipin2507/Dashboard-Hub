import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/**
 * Page title row for `lg+` also shows notifications and account.
 * Below `lg`, {@link MobileShellHeader} in the app layout provides menu, notifications, and account.
 */
export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="sticky top-14 z-20 lg:top-0 lg:z-30">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:gap-3 sm:px-4 sm:py-0 lg:h-14 lg:py-0">
        <div className="min-w-0 flex-1 basis-[min(100%,12rem)] sm:basis-auto">
          <h1 className="truncate text-base font-semibold text-foreground sm:text-lg lg:text-xl">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 hidden text-sm leading-snug text-muted-foreground sm:line-clamp-2 sm:block">
              {subtitle}
            </p>
          )}
        </div>

        <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
          {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
          <div className="hidden items-center gap-1 sm:gap-2 lg:flex">
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </div>

      <div className="h-3 bg-transparent sm:h-4" />
    </header>
  );
}
