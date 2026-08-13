import { BrandMark } from "@/components/BrandMark";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { useSidebarNav } from "@/contexts/SidebarNavContext";
import { Menu } from "lucide-react";

export function MobileShellHeader() {
  const { sidebarOpen, openSidebar } = useSidebarNav();

  return (
    <header
      className="sticky top-0 z-[35] flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur sm:px-3 lg:h-16 lg:px-4"
      role="banner"
    >
      <button
        type="button"
        onClick={openSidebar}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md hover:bg-muted lg:hidden"
        aria-label="Open menu"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>
      <BrandMark className="h-7 w-7 text-xs lg:hidden" />
      <span className="flex-shrink-0 text-sm font-semibold tracking-tight lg:hidden">Buildesk</span>
      <GlobalSearch className="hidden min-w-0 flex-1 lg:block lg:max-w-md" />
      <div className="min-w-0 flex-1 lg:hidden" aria-hidden />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <ThemeToggle />
        <NotificationBell />
        <UserMenu compact />
      </div>
    </header>
  );
}
