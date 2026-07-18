import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterPanelProps = {
  children: ReactNode;
  /** Optional short label next to the toggle (e.g. "Filters"). */
  title?: string;
  /** Start expanded. Default true. */
  defaultOpen?: boolean;
  /** Persist open/closed in localStorage under this key. */
  storageKey?: string;
  className?: string;
  /** Extra controls on the header row (right side), always visible. */
  headerActions?: ReactNode;
};

/**
 * Filter card with a toggle that collapses the body using a smooth height animation.
 */
export function FilterPanel({
  children,
  title = "Filters",
  defaultOpen = true,
  storageKey,
  className,
  headerActions,
}: FilterPanelProps) {
  const [open, setOpen] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw === "0") return false;
        if (raw === "1") return true;
      } catch {
        /* ignore */
      }
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-sm font-medium text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={storageKey ? `filter-panel-${storageKey}` : undefined}
        >
          <Filter className="h-4 w-4 text-muted-foreground" />
          {title}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300 ease-in-out",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="sr-only">{open ? "Hide filters" : "Show filters"}</span>
        </Button>
        {headerActions ? <div className="flex flex-shrink-0 items-center gap-2">{headerActions}</div> : null}
      </div>

      <div
        id={storageKey ? `filter-panel-${storageKey}` : undefined}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-gray-100 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 dark:border-gray-800">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
