import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { IndianRupee, Send, Target, Trophy } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/rbac";
import { EASE, staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { TargetAchievementMetric, TargetVsAchievement } from "@/types/executivePerformance";
import type { LucideIcon } from "lucide-react";

const METRIC_ICONS: Record<TargetAchievementMetric["key"], LucideIcon> = {
  proposalsSent: Send,
  proposalsWon: Trophy,
  revenueExclGst: IndianRupee,
};

const METRIC_COLORS: Record<TargetAchievementMetric["key"], { ring: string; icon: string; bg: string }> = {
  proposalsSent: { ring: "hsl(var(--info))", icon: "text-info", bg: "bg-info/15" },
  proposalsWon: { ring: "hsl(var(--success))", icon: "text-success", bg: "bg-success/15" },
  revenueExclGst: { ring: "hsl(var(--primary))", icon: "text-primary", bg: "bg-primary/15" },
};

function pctTone(pct: number, hasTarget: boolean) {
  if (!hasTarget) return "text-muted-foreground";
  if (pct >= 100) return "text-success";
  if (pct >= 70) return "text-primary";
  return "text-warning-foreground";
}

function ProgressRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative mx-auto h-[5.5rem] w-[5.5rem]">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden>
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="5"
          opacity={0.55}
        />
        <motion.circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.85, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-sm font-semibold tabular-nums", pctTone(pct, pct > 0))}>
          {pct > 0 ? `${pct}%` : "—"}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: TargetAchievementMetric }) {
  const Icon = METRIC_ICONS[metric.key];
  const colors = METRIC_COLORS[metric.key];
  const hasTarget = metric.target > 0;
  const achievedDisplay =
    metric.format === "inr" ? formatINR(metric.achieved) : metric.achieved.toLocaleString("en-IN");
  const targetDisplay =
    metric.format === "inr" ? formatINR(metric.target) : metric.target.toLocaleString("en-IN");

  return (
    <motion.div
      variants={staggerItem}
      className="card-soft flex flex-col gap-3 p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground sm:text-xl">
            {metric.format === "inr" ? (
              achievedDisplay
            ) : (
              <CountUp value={metric.achieved} />
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Target{" "}
            <span className="font-medium text-foreground/80">{hasTarget ? targetDisplay : "Not set"}</span>
          </p>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", colors.bg)}>
          <Icon className={cn("h-4 w-4", colors.icon)} />
        </div>
      </div>

      <ProgressRing pct={hasTarget ? metric.pct : 0} color={colors.ring} label="of target" />

      {hasTarget && metric.pct >= 100 ? (
        <p className="text-center text-[10px] font-medium text-success">Target achieved</p>
      ) : hasTarget ? (
        <p className="text-center text-[10px] text-muted-foreground">
          {metric.format === "inr"
            ? formatINR(Math.max(0, metric.target - metric.achieved))
            : Math.max(0, Math.round(metric.target - metric.achieved)).toLocaleString("en-IN")}{" "}
          to go
        </p>
      ) : (
        <p className="text-center text-[10px] text-muted-foreground">Set target in Masters</p>
      )}
    </motion.div>
  );
}

function TargetSkeleton() {
  return (
    <div className="card-soft space-y-3 p-4">
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
      </div>
    </div>
  );
}

export function ExecutiveTargetAchievement({
  data,
  isLoading,
}: {
  data?: TargetVsAchievement;
  isLoading?: boolean;
}) {
  if (isLoading) return <TargetSkeleton />;

  const hasRange = Boolean(data?.periodLabel);
  const showEmpty = !hasRange || !data?.hasTargets;

  return (
    <motion.section
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="card-soft overflow-hidden"
    >
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Target vs achievement</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {hasRange ? (
                <>
                  {data?.scopeLabel}
                  {data?.periodLabel ? ` · ${data.periodLabel}` : ""}
                  {data?.hasTargets ? " · prorated monthly targets" : ""}
                </>
              ) : (
                "Select a date range to compare against monthly targets"
              )}
            </p>
          </div>
        </div>
        {showEmpty ? (
          <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" asChild>
            <Link to="/masters">Configure targets</Link>
          </Button>
        ) : null}
      </div>

      {showEmpty ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {!hasRange
              ? "Monthly sales targets apply when you filter by week, month, or custom range."
              : "No targets configured for this period. Set organization or executive targets in Masters."}
          </p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4"
        >
          {(data?.metrics ?? []).map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </motion.div>
      )}
    </motion.section>
  );
}
