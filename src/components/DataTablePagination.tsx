import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSmUp } from "@/hooks/useSmUp";

export type PageItem = number | "...";

/**
 * Builds page number entries with ellipsis for large page counts.
 * @param maxNumericButtons — max consecutive page buttons in the sliding window (typically 3 mobile, 5 desktop)
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxNumericButtons: number,
): PageItem[] {
  if (totalPages < 1) return [];
  if (totalPages === 1) return [1];
  if (totalPages <= maxNumericButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const start = Math.max(
    1,
    Math.min(
      currentPage - Math.floor(maxNumericButtons / 2),
      totalPages - maxNumericButtons + 1,
    ),
  );
  const window: number[] = [];
  for (let i = 0; i < maxNumericButtons; i++) {
    const p = start + i;
    if (p <= totalPages) window.push(p);
  }

  const result: PageItem[] = [];
  const firstWin = window[0]!;
  const lastWin = window[window.length - 1]!;

  if (firstWin > 1) {
    result.push(1);
    if (firstWin > 2) result.push("...");
  }
  result.push(...window);
  if (lastWin < totalPages) {
    if (lastWin < totalPages - 1) result.push("...");
    result.push(totalPages);
  }
  return result;
}

export type DataTablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function DataTablePagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
  className,
}: DataTablePaginationProps) {
  const smUp = useSmUp();
  const maxButtons = smUp ? 5 : 3;
  const items = getPageNumbers(page, totalPages, maxButtons);

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  if (totalPages <= 1) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="hidden text-xs text-gray-500 dark:text-gray-400 sm:block">
        {total === 0 ? (
          <>Showing 0 of 0</>
        ) : (
          <>
            Showing {from}–{to} of {total}
          </>
        )}
      </p>

      <div className="mx-auto flex items-center gap-1 sm:mx-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Prev</span>
        </Button>

        <div className="flex items-center gap-1">
          {items.map((p, i) =>
            p === "..." ? (
              <span key={`e-${i}`} className="w-8 text-center text-xs text-gray-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  "h-8 w-8 rounded-md text-xs transition-colors",
                  p === page
                    ? "bg-blue-600 text-white dark:bg-blue-600"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="mr-1 hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
