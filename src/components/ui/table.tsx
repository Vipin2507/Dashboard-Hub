import * as React from "react";

import { cn } from "@/lib/utils";

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * Outer rounded border + inner horizontal scroll + `min-w-[600px]` on `<table>`.
   * Edge bleed (`-mx-4`) on small screens in padded layouts.
   * Set `false` inside dialogs and compact nested tables.
   */
  responsiveShell?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, responsiveShell = true, ...props }, ref) => (
    <div
      className={cn(
        "relative w-full",
        responsiveShell &&
          "overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 -mx-4 border-x-0 sm:mx-0 sm:border-x",
      )}
    >
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom border-collapse text-sm",
          responsiveShell && "min-w-[600px]",
          className,
        )}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-gray-100 transition-colors duration-100 hover:bg-gray-50/70 data-[state=selected]:bg-muted dark:border-gray-800 dark:hover:bg-gray-800/50",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "bg-gray-50 px-4 py-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap dark:bg-gray-900 dark:text-gray-400 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "px-4 py-3.5 align-middle text-sm text-gray-800 dark:text-gray-200 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
