import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type RangeValue = [Date | null, Date | null];

export type DatepickerChangeEvent = {
  value: RangeValue;
};

export type DatepickerProps = {
  controls?: Array<"calendar">;
  select?: "range";
  touchUi?: boolean;
  display?: "inline";

  /**
   * Mobiscroll-compatible behaviors — supported subset.
   */
  showOnClick?: boolean;
  showOnFocus?: boolean;
  isOpen?: boolean;
  onClose?: () => void;

  value?: RangeValue;
  onChange?: (event: DatepickerChangeEvent) => void;

  inputComponent?: "input";
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
};

function toLabel(value: RangeValue | undefined): string {
  const [from, to] = value ?? [null, null];
  if (!from && !to) return "";
  if (from && !to) return format(from, "dd MMM yyyy");
  if (!from && to) return format(to, "dd MMM yyyy");
  return `${format(from as Date, "dd MMM yyyy")} - ${format(to as Date, "dd MMM yyyy")}`;
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function Datepicker({
  controls = ["calendar"],
  select = "range",
  touchUi = true,
  display,
  showOnClick = true,
  showOnFocus = true,
  isOpen,
  onClose,
  value,
  onChange,
  inputComponent = "input",
  inputProps,
}: DatepickerProps) {
  const enabled = controls.includes("calendar") && select === "range";

  const isControlledOpen = typeof isOpen === "boolean";
  const [openInternal, setOpenInternal] = React.useState(false);
  const open = isControlledOpen ? (isOpen as boolean) : openInternal;

  const close = React.useCallback(() => {
    if (!isControlledOpen) setOpenInternal(false);
    onClose?.();
  }, [isControlledOpen, onClose]);

  const [from, to] = value ?? [null, null];
  const range = React.useMemo(() => {
    return from || to ? { from: from ?? undefined, to: to ?? undefined } : undefined;
  }, [from, to]);

  if (!enabled) {
    // Safety fallback: render a plain input if unsupported props are used.
    return (
      <input
        {...inputProps}
        readOnly
        value={inputProps?.value ?? toLabel(value)}
        className={cn("h-9 w-full rounded-md border bg-background px-3 py-2 text-sm", inputProps?.className)}
      />
    );
  }

  const InputEl =
    inputComponent === "input" ? (
      <input
        {...inputProps}
        readOnly
        value={toLabel(value) || (inputProps?.value as string) || ""}
        onClick={(e) => {
          inputProps?.onClick?.(e);
          if (!showOnClick) return;
          if (!isControlledOpen) setOpenInternal(true);
        }}
        onFocus={(e) => {
          inputProps?.onFocus?.(e);
          if (!showOnFocus) return;
          if (!isControlledOpen) setOpenInternal(true);
        }}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          inputProps?.className,
        )}
      />
    ) : null;

  const CalendarEl = (
    <Calendar
      mode="range"
      selected={range}
      onSelect={(next) => {
        const nextFrom = next?.from ?? null;
        const nextTo = next?.to ?? null;
        onChange?.({ value: [nextFrom, nextTo] });

        // Auto-close when both dates selected (common mobile UX).
        if (nextFrom && nextTo) close();
      }}
      initialFocus
      defaultMonth={from ?? undefined}
      // Prevent selecting future dates? leave unconstrained (matches current behavior).
    />
  );

  // Inline display (always visible)
  if (display === "inline") {
    return <div className="w-full">{CalendarEl}</div>;
  }

  // Touch UI: use a dialog-like picker; Desktop: popover anchored to input.
  if (touchUi) {
    return (
      <>
        {InputEl}
        <Dialog open={open} onOpenChange={(next) => (next ? (!isControlledOpen ? setOpenInternal(true) : undefined) : close())}>
          <DialogContent
            className={cn(
              // Override default mobile full-screen dialog to a compact picker.
              "left-[50%] top-[50%] h-auto max-h-[90vh] w-fit max-w-[calc(100vw-1.5rem)] translate-x-[-50%] translate-y-[-50%] rounded-xl",
              "border-2 shadow-2xl",
              "p-0 overflow-hidden",
            )}
          >
            <div className="p-3 pt-12 sm:p-4 sm:pt-12">
              <div className="mx-auto w-fit">{CalendarEl}</div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Hidden inputs for compatibility with existing URL/filter logic (if needed by forms) */}
        <input type="hidden" value={from ? toYmd(from) : ""} readOnly />
        <input type="hidden" value={to ? toYmd(to) : ""} readOnly />
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? (!isControlledOpen ? setOpenInternal(true) : undefined) : close())}>
      <PopoverAnchor asChild>{InputEl}</PopoverAnchor>
      <PopoverContent className="w-auto p-0" align="start">
        {CalendarEl}
      </PopoverContent>
    </Popover>
  );
}

