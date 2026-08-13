interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** Compact page header. Shell chrome (search, theme, bell, account) lives in MobileShellHeader. */
export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="mb-2.5">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 sm:min-h-12 lg:min-h-0">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h1>
          {subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && (
          <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>
        )}
      </div>
    </header>
  );
}
