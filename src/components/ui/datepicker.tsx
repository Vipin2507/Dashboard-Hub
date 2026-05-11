import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type RangeValue = [Date | null, Date | null];

export type DatepickerChangeEvent = { value: RangeValue };
export type SingleDatepickerChangeEvent = { value: Date | null };

type BaseDatepickerProps = {
  controls?: Array<"calendar">;
  touchUi?: boolean;
  display?: "inline";
  showOnClick?: boolean;
  showOnFocus?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  inputComponent?: "input";
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
};

export type RangeDatepickerProps = BaseDatepickerProps & {
  select?: "range";
  value?: RangeValue;
  onChange?: (event: DatepickerChangeEvent) => void;
};

export type SingleDatepickerProps = BaseDatepickerProps & {
  select: "single";
  value?: Date | null;
  onChange?: (event: SingleDatepickerChangeEvent) => void;
};

export type DatepickerProps = RangeDatepickerProps | SingleDatepickerProps;

/** Parse `yyyy-MM-dd` as a local calendar date (avoids UTC off-by-one). */
export function ymdToDate(s: string): Date | null {
  const t = s?.trim();
  if (!t) return null;
  const [y, m, d] = t.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function dateToYmd(d: Date | null | undefined): string {
  if (!d) return "";
  return format(d, "yyyy-MM-dd");
}

function toRangeLabel(value: RangeValue | undefined): string {
  const [from, to] = value ?? [null, null];
  if (!from && !to) return "";
  if (from && !to) return format(from, "dd MMM yyyy");
  if (!from && to) return format(to, "dd MMM yyyy");
  return `${format(from as Date, "dd MMM yyyy")} - ${format(to as Date, "dd MMM yyyy")}`;
}

function toSingleLabel(d: Date | null | undefined): string {
  if (!d) return "";
  return format(d, "dd MMM yyyy");
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function Datepicker(props: DatepickerProps) {
  const {
    controls = ["calendar"],
    touchUi = true,
    display,
    showOnClick = true,
    showOnFocus = true,
    isOpen,
    onClose,
    inputComponent = "input",
    inputProps,
  } = props;

  const isSingle = props.select === "single";
  const enabled = controls.includes("calendar") && (isSingle || props.select !== "single");

  const isControlledOpen = typeof isOpen === "boolean";
  const [openInternal, setOpenInternal] = React.useState(false);
  const open = isControlledOpen ? (isOpen as boolean) : openInternal;

  const close = React.useCallback(() => {
    if (!isControlledOpen) setOpenInternal(false);
    onClose?.();
  }, [isControlledOpen, onClose]);

  const rangeValue: RangeValue | undefined = isSingle ? undefined : (props as RangeDatepickerProps).value;
  const singleValue: Date | null | undefined = isSingle ? (props as SingleDatepickerProps).value : undefined;

  const [from, to] = rangeValue ?? [null, null];
  const range = React.useMemo(() => {
    return from || to ? { from: from ?? undefined, to: to ?? undefined } : undefined;
  }, [from, to]);

  const displayLabel = isSingle
    ? toSingleLabel(singleValue ?? null)
    : toRangeLabel(rangeValue);

  if (!enabled) {
    return (
      <input
        {...inputProps}
        readOnly
        value={inputProps?.value ?? displayLabel}
        className={cn("h-9 w-full rounded-md border bg-background px-3 py-2 text-sm", inputProps?.className)}
      />
    );
  }

  const InputEl =
    inputComponent === "input" ? (
      <input
        {...inputProps}
        readOnly
        value={displayLabel || (inputProps?.value as string) || ""}
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

  const CalendarEl = isSingle ? (
    <Calendar
      mode="single"
      selected={singleValue ?? undefined}
      onSelect={(next) => {
        (props as SingleDatepickerProps).onChange?.({ value: next ?? null });
        if (next) close();
      }}
      initialFocus
      defaultMonth={singleValue ?? undefined}
    />
  ) : (
    <Calendar
      mode="range"
      selected={range}
      onSelect={(next) => {
        const nextFrom = next?.from ?? null;
        const nextTo = next?.to ?? null;
        (props as RangeDatepickerProps).onChange?.({ value: [nextFrom, nextTo] });
        if (nextFrom && nextTo) close();
      }}
      initialFocus
      defaultMonth={from ?? undefined}
    />
  );

  if (display === "inline") {
    return <div className="w-full">{CalendarEl}</div>;
  }

  if (touchUi) {
    return (
      <>
        {InputEl}
        <Dialog
          open={open}
          onOpenChange={(next) => (next ? (!isControlledOpen ? setOpenInternal(true) : undefined) : close())}
        >
          <DialogContent
            className={cn(
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
        {isSingle ? (
          <input type="hidden" value={singleValue ? toYmd(singleValue) : ""} readOnly />
        ) : (
          <>
            <input type="hidden" value={from ? toYmd(from) : ""} readOnly />
            <input type="hidden" value={to ? toYmd(to) : ""} readOnly />
          </>
        )}
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
