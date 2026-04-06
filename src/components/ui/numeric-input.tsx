import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function clamp(n: number, min?: number, max?: number): number {
  let x = n;
  if (min !== undefined && !Number.isNaN(x)) x = Math.max(min, x);
  if (max !== undefined && !Number.isNaN(x)) x = Math.min(max, x);
  return x;
}

/** Parse a complete-enough numeric string for committing to parent state. Returns null if empty or incomplete (e.g. trailing `.`). */
function parseNumericString(s: string, integer: boolean): number | null {
  if (s === "") return null;
  if (integer) {
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (s === "." || s === "-") return null;
  if (/^\d+\.$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function isValidPartial(s: string, integer: boolean): boolean {
  if (s === "") return true;
  if (integer) return /^\d*$/.test(s);
  return /^\d*\.?\d*$/.test(s);
}

export interface NumericInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
  /** Used when the field is empty or invalid on blur (default 0). */
  emptyOnBlur?: number;
  min?: number;
  max?: number;
  integer?: boolean;
}

/**
 * Number field that can be cleared while editing; commits defaults on blur.
 * Avoids `Number(x) || 0` patterns that fight empty input.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, emptyOnBlur = 0, min, max, integer = false, className, onBlur, ...props }, ref) => {
    const [draft, setDraft] = React.useState<string | null>(null);
    const lastProp = React.useRef(value);

    React.useEffect(() => {
      if (value !== lastProp.current) {
        lastProp.current = value;
        setDraft(null);
      }
    }, [value]);

    const display = draft !== null ? draft : String(value);

    const commitFromRaw = (raw: string) => {
      let n: number | null = parseNumericString(raw, integer);
      if (n === null && !integer && /^\d+\.$/.test(raw)) {
        n = parseFloat(raw.slice(0, -1));
      }
      if (n === null || Number.isNaN(n)) onValueChange(clamp(emptyOnBlur, min, max));
      else onValueChange(clamp(n, min, max));
      setDraft(null);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        className={cn(className)}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidPartial(raw, integer)) return;
          setDraft(raw);
          const n = parseNumericString(raw, integer);
          if (n !== null) {
            onValueChange(clamp(n, min, max));
            setDraft(null);
          }
        }}
        onBlur={(e) => {
          if (draft !== null) commitFromRaw(e.target.value);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";
