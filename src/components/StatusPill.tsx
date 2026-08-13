import { cn } from "@/lib/utils";

const TONE = {
  muted: "border-border bg-muted/40 text-muted-foreground",
  info: "border-primary/30 bg-primary/15 text-primary",
  success: "border-success/30 bg-success/15 text-success",
  warning: "border-warning/30 bg-warning/15 text-warning-foreground",
  danger: "border-destructive/30 bg-destructive/15 text-destructive",
} as const;

const DOT = {
  muted: "bg-muted-foreground",
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
} as const;

export type StatusTone = keyof typeof TONE;

export function StatusPill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
