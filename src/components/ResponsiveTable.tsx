import { cn } from '@/lib/utils';

/**
 * Optional wrapper when you cannot use {@link Table} from `@/components/ui/table`
 * (which applies the same scroll shell by default).
 */
export function ResponsiveTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-none border border-border border-x-0 sm:mx-0 sm:rounded-md sm:border-x',
        '-mx-4 sm:mx-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
