import { cn } from '@/lib/utils';

/** Narrow modal on desktop (simple inputs) */
export const dialogSmMaxMd = 'sm:max-w-md';

/** Overrides default `sm:max-w-lg` on DialogContent — wide forms */
export const dialogSmMax2xl = 'sm:max-w-2xl';

/** Extra-wide proposal / data-heavy dialogs */
export const dialogSmMax4xl = 'sm:max-w-4xl';

/** Side panels — merge onto SheetContent (widths come from `ui/sheet` right variant) */
export const sheetContentDetail = 'flex flex-col overflow-y-auto p-6 pt-14';

/** Dialog header padding — use on DialogHeader */
export const dialogHeaderLayout = cn(
  'flex-shrink-0 border-b px-4 pb-3 pt-4 sm:px-6 sm:pb-3 sm:pt-6',
);

/** Scrollable body */
export const dialogBodyLayout = cn('flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5');

/** Sticky footer — primary action on the right on desktop */
export const dialogFooterLayout = cn(
  'flex flex-shrink-0 flex-col gap-2 border-t bg-white px-4 py-3 dark:bg-gray-950 sm:flex-row sm:justify-end sm:px-6 sm:py-4',
);
