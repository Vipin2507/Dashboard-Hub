import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { formatINR } from "@/lib/rbac";
import { EASE, hoverLift, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { ExecutiveDetailType, FunnelStep } from "@/types/executivePerformance";

const STEP_COLORS = [
  { bar: "bg-primary", track: "bg-primary/10", text: "text-primary", ring: "ring-primary/25" },
  { bar: "bg-info", track: "bg-info/10", text: "text-info", ring: "ring-info/25" },
  { bar: "bg-warning", track: "bg-warning/15", text: "text-warning-foreground", ring: "ring-warning/30" },
  { bar: "bg-success", track: "bg-success/10", text: "text-success", ring: "ring-success/25" },
];

function FunnelRow({
  step,
  index,
  maxCount,
  onStepClick,
}: {
  step: FunnelStep;
  index: number;
  maxCount: number;
  onStepClick?: (key: ExecutiveDetailType) => void;
}) {
  const colors = STEP_COLORS[index % STEP_COLORS.length];
  const widthPct = maxCount > 0 ? Math.max((step.count / maxCount) * 100, step.count > 0 ? 6 : 0) : 0;
  const detailKey = step.key as ExecutiveDetailType;

  return (
    <motion.button
      type="button"
      variants={staggerItem}
      whileHover={hoverLift}
      whileTap={tapPress}
      onClick={() => onStepClick?.(detailKey)}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors",
        "hover:border-border hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1",
            colors.track,
            colors.text,
            colors.ring,
          )}
        >
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p className="truncate text-xs font-medium text-foreground sm:text-sm">{step.label}</p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              <CountUp value={step.count} />
            </span>
          </div>
          {step.value > 0 ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{formatINR(step.value)} revenue excl. GST</p>
          ) : null}
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className={cn("relative h-2.5 overflow-hidden rounded-full sm:h-3", colors.track)}>
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", colors.bar)}
          initial={{ width: 0, opacity: 0.6 }}
          animate={{ width: `${widthPct}%`, opacity: 1 }}
          transition={{ duration: 0.75, ease: EASE, delay: index * 0.08 }}
        />
        <motion.div
          className="absolute inset-y-0 left-0 w-full rounded-full bg-gradient-to-r from-white/0 via-white/20 to-white/0"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.15 + index * 0.08 }}
          style={{ pointerEvents: "none" }}
        />
      </div>
    </motion.button>
  );
}

export function ConversionFunnelChart({
  steps,
  onStepClick,
  className,
}: {
  steps: FunnelStep[];
  onStepClick?: (key: ExecutiveDetailType) => void;
  className?: string;
}) {
  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={cn("space-y-1", className)}
    >
      {steps.map((step, index) => (
        <FunnelRow
          key={step.key}
          step={step}
          index={index}
          maxCount={maxCount}
          onStepClick={onStepClick}
        />
      ))}
    </motion.div>
  );
}
