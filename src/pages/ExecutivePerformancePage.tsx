import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Building2,
  Clock,
  Download,
  FileText,
  Handshake,
  IndianRupee,
  Loader2,
  RefreshCw,
  Send,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { ExecutiveTargetAchievement } from "@/components/ExecutiveTargetAchievement";
import { FilterPanel } from "@/components/FilterPanel";
import { TimeRangeFilter } from "@/components/TimeRangeFilter";
import { StatusPill } from "@/components/StatusPill";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmUp } from "@/hooks/useSmUp";
import { hoverLift, pageEnter, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAppStore } from "@/store/useAppStore";
import { formatINR } from "@/lib/rbac";
import { WEEKDAY_LABELS } from "@/lib/executivePerformanceMetrics";
import { exportExecutivePerformanceXlsx } from "@/lib/executivePerformanceExport";
import {
  executiveFiltersToSearchParams,
  normalizeExecutiveFilters,
  readExecutiveFiltersFromParams,
  type ExecutiveUrlFilters,
} from "@/lib/executivePerformanceUrl";
import {
  FILTER_SESSION_KEYS,
  hasAnySearchParam,
  loadSessionFilters,
  saveSessionFilters,
} from "@/lib/filterSessionPersistence";
import { useExecutivePerformanceQuery } from "@/hooks/useExecutivePerformanceQuery";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { cn } from "@/lib/utils";
import { timeRangeChip, resolveTimeRangeYmd } from "@/lib/dateRange";
import type {
  ExecutiveDailyBreakdownRow,
  ExecutiveDetailRecord,
  ExecutiveDetailType,
  ExecutivePerformanceFilters,
} from "@/types/executivePerformance";
import { useToast } from "@/hooks/use-toast";

type AppliedFilters = ExecutiveUrlFilters;

type ComparisonMetricKey =
  | "wonValue"
  | "dealsWon"
  | "proposalsCreated"
  | "proposalsSent"
  | "proposalsPending"
  | "proposalsWon"
  | "revenueExclGst"
  | "proposalsApproved"
  | "customersNew"
  | "collectedRevenue"
  | "pipelineValue"
  | "dealsCreated";

const COMPARISON_METRICS: {
  key: ComparisonMetricKey;
  label: string;
  format: "inr" | "count";
  detailType?: ExecutiveDetailType;
}[] = [
  { key: "proposalsCreated", label: "Total proposals", format: "count", detailType: "proposals_created" },
  { key: "proposalsSent", label: "Sent proposals", format: "count", detailType: "proposals_sent" },
  { key: "proposalsPending", label: "Pending proposals", format: "count", detailType: "proposals_pending" },
  { key: "proposalsWon", label: "Won", format: "count", detailType: "proposals_won" },
  { key: "revenueExclGst", label: "Revenue without GST", format: "inr", detailType: "proposals_won" },
  { key: "wonValue", label: "Won deal value", format: "inr", detailType: "deals_won" },
  { key: "dealsWon", label: "Deals won", format: "count", detailType: "deals_won" },
  { key: "dealsCreated", label: "Deals", format: "count", detailType: "deals_created" },
  { key: "proposalsApproved", label: "Proposals approved", format: "count", detailType: "proposals_approved" },
  { key: "customersNew", label: "Customers", format: "count", detailType: "customers_new" },
  { key: "collectedRevenue", label: "Collected revenue", format: "inr", detailType: "payments_collected" },
  { key: "pipelineValue", label: "Pipeline value", format: "inr", detailType: "pipeline" },
];

function loadInitialExecutiveFilters(params: URLSearchParams): AppliedFilters {
  if (
    hasAnySearchParam(params, [
      "executive",
      "team",
      "region",
      "weekday",
      "reasonType",
      "reason",
      "from",
      "to",
      "range",
      "tab",
    ])
  ) {
    return readExecutiveFiltersFromParams(params);
  }
  const session = loadSessionFilters<AppliedFilters>(FILTER_SESSION_KEYS.executivePerformance);
  return session
    ? normalizeExecutiveFilters(session)
    : readExecutiveFiltersFromParams(params);
}

const CHART_PRIMARY = "var(--color-primary)";
const CHART_SUCCESS = "var(--color-success)";
const CHART_WARNING = "var(--color-warning)";
const CHART_DANGER = "var(--color-danger)";
const CHART_DEEP = "var(--color-primary-deep)";
const CHART_COLORS = [CHART_PRIMARY, CHART_SUCCESS, CHART_WARNING, CHART_DANGER, CHART_DEEP, CHART_PRIMARY];

const CHART_LABEL = { fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))" } as const;

function formatChartNumber(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function formatChartPercent(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n)}%`;
}

const TYPE_META: Record<
  ExecutiveDetailRecord["type"],
  { label: string; icon: React.ElementType; className: string }
> = {
  proposal: {
    label: "Proposal",
    icon: FileText,
    className: "bg-primary/15 text-primary",
  },
  deal: {
    label: "Deal",
    icon: Handshake,
    className: "bg-success/15 text-success",
  },
  customer: {
    label: "Customer",
    icon: Building2,
    className: "bg-info/15 text-info",
  },
  payment: {
    label: "Payment",
    icon: TrendingUp,
    className: "bg-warning/15 text-warning",
  },
};

function formatDisplayDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CountPill({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-[3.25rem] rounded-md border px-1.5 py-1 text-center",
        muted || value === 0
          ? "border-transparent bg-muted/40 text-muted-foreground"
          : "border-border bg-card text-foreground",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DailyActivityTable({
  rows,
  onOpenRecord,
}: {
  rows: ExecutiveDailyBreakdownRow[];
  onOpenRecord: (row: ExecutiveDetailRecord) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="card-soft overflow-hidden">
        <div className="border-b border-border px-3 py-2.5 sm:px-4">
          <h3 className="text-sm font-semibold text-foreground">Daily activity</h3>
          <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
            Row-level counts for each day. Expand a day for full records.
          </p>
        </div>
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No daily activity for this filter set.</p>
      </div>
    );
  }

  return (
    <div className="card-soft overflow-hidden">
      <div className="border-b border-border px-3 py-2.5 sm:px-4">
        <h3 className="text-sm font-semibold text-foreground">Daily activity</h3>
        <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
          {rows.length} day{rows.length === 1 ? "" : "s"} with activity · expand a row for records.
        </p>
      </div>
        <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(6,minmax(0,0.7fr))_auto] gap-2 border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:grid sm:px-4">
          <span>Date</span>
          <span className="text-center">Proposals</span>
          <span className="text-center">Deals</span>
          <span className="text-center">Won</span>
          <span className="text-center">Lost</span>
          <span className="text-center">Customers</span>
          <span className="text-center">Payments</span>
          <span className="w-8" />
        </div>

        <Accordion type="multiple" className="w-full">
          {rows.map((day) => {
            const totalEvents =
              day.proposalsCreated +
              day.dealsCreated +
              day.dealsWon +
              day.dealsLost +
              day.customersNew +
              day.paymentsCollected;
            return (
              <AccordionItem
                key={day.date}
                value={day.date}
                className="border-b border-border px-3 last:border-b-0 sm:px-4"
              >
                <AccordionTrigger
                  className={cn(
                    "py-3 hover:no-underline [&[data-state=open]]:bg-muted/30",
                    "transition-colors duration-200",
                  )}
                >
                  <div className="grid w-full grid-cols-1 items-center gap-3 pr-2 text-left md:grid-cols-[minmax(0,1.4fr)_repeat(6,minmax(0,0.7fr))]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {formatDisplayDate(day.date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day.weekdayLabel} · {totalEvents} event{totalEvents === 1 ? "" : "s"}
                        {day.wonValue > 0 ? ` · won ${formatINR(day.wonValue)}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                        <CountPill label="Prop" value={day.proposalsCreated} />
                        <CountPill label="Deals" value={day.dealsCreated} />
                        <CountPill label="Won" value={day.dealsWon} />
                        <CountPill label="Lost" value={day.dealsLost} />
                        <CountPill label="Cust" value={day.customersNew} />
                        <CountPill label="Pay" value={day.paymentsCollected} />
                      </div>
                    </div>
                    <p className="hidden text-center text-sm font-semibold tabular-nums md:block">
                      {day.proposalsCreated}
                    </p>
                    <p className="hidden text-center text-sm font-semibold tabular-nums md:block">
                      {day.dealsCreated}
                    </p>
                    <p className="hidden text-center text-sm font-semibold tabular-nums md:block">
                      {day.dealsWon}
                    </p>
                    <p className="hidden text-center text-sm font-semibold tabular-nums md:block">
                      {day.dealsLost}
                    </p>
                    <p className="hidden text-center text-sm font-semibold tabular-nums md:block">
                      {day.customersNew}
                    </p>
                    <p className="hidden text-center text-sm font-semibold tabular-nums md:block">
                      {day.paymentsCollected}
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-0">
                  <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 transition-all duration-300">
                    {(day.wonValue > 0 || day.collectedRevenue > 0) && (
                      <div className="mb-1 flex flex-wrap gap-1.5">
                        {day.wonValue > 0 ? (
                          <StatusPill tone="success">Won {formatINR(day.wonValue)}</StatusPill>
                        ) : null}
                        {day.collectedRevenue > 0 ? (
                          <StatusPill tone="info">Collected {formatINR(day.collectedRevenue)}</StatusPill>
                        ) : null}
                      </div>
                    )}
                    {day.items.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No detail records for this day.
                      </p>
                    ) : (
                      day.items.map((item) => {
                        const meta = TYPE_META[item.type];
                        const Icon = meta.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onOpenRecord(item)}
                            className={cn(
                              "flex w-full items-start gap-2.5 rounded-md border border-border bg-card px-2.5 py-2 text-left",
                              "hover:border-primary/30",
                              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            )}
                          >
                            <div
                              className={cn(
                                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                meta.className,
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium">{item.title}</span>
                                <StatusPill tone="muted" className="h-5 text-[10px]">
                                  {meta.label}
                                </StatusPill>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {item.executiveName || "—"}
                                {item.subtitle ? ` · ${item.subtitle}` : ""}
                                {item.reason ? ` · ${item.reason}` : item.status ? ` · ${item.status}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {item.amount != null && item.amount > 0 ? (
                                <p className="text-sm font-medium tabular-nums">
                                  {formatINR(item.amount)}
                                </p>
                              ) : null}
                              <p className="text-[11px] text-muted-foreground">
                                {String(item.at).slice(0, 10)}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  onClick?: () => void;
}) {
  const isPlainInt = /^\d+$/.test(String(value).trim());
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={staggerItem}
      whileHover={hoverLift}
      whileTap={tapPress}
      className="card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0"
    >
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
          {isPlainInt ? <CountUp value={Number(value)} /> : value}
        </p>
        {sub ? <p className="truncate text-[10px] text-muted-foreground">{sub}</p> : null}
      </div>
    </motion.button>
  );
}

function ChartCard({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("card-soft overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 hidden text-[11px] leading-relaxed text-muted-foreground sm:block">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">{children}</div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground sm:h-56">
      {message}
    </div>
  );
}

export default function ExecutivePerformancePage() {
  const smUp = useSmUp();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const authUserId = useAppStore((s) => s.authUserId);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);

  const loggedInUser = users.find((u) => u.id === authUserId);
  const isSuperAdmin = loggedInUser?.role === "super_admin";

  const [applied, setApplied] = useState<AppliedFilters>(() => loadInitialExecutiveFilters(searchParams));
  const [draft, setDraft] = useState<AppliedFilters>(() => loadInitialExecutiveFilters(searchParams));
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const [detailType, setDetailType] = useState<ExecutiveDetailType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetricKey>("proposalsCreated");

  useEffect(() => {
    const next = readExecutiveFiltersFromParams(searchParams);
    setApplied(next);
    setDraft(next);
    setTab(searchParams.get("tab") || "overview");
  }, [searchParams]);

  const queryFilters: ExecutivePerformanceFilters | null = useMemo(() => {
    if (!isSuperAdmin || !loggedInUser) return null;
    return {
      from: applied.from,
      to: applied.to,
      executiveId: applied.executiveId === "all" ? undefined : applied.executiveId,
      teamId: applied.teamId === "all" ? undefined : applied.teamId,
      regionId: applied.regionId === "all" ? undefined : applied.regionId,
      weekday: applied.weekday === "all" ? undefined : Number(applied.weekday),
      reasonType:
        applied.reasonType === "loss" || applied.reasonType === "rejection"
          ? applied.reasonType
          : undefined,
      reason: applied.reason === "all" ? undefined : applied.reason,
      detailType: detailType ?? undefined,
      detailPage,
      detailPageSize: 25,
      actorRole: "super_admin",
      actorUserId: loggedInUser.id,
      actorUserName: loggedInUser.name,
    };
  }, [applied, detailPage, detailType, isSuperAdmin, loggedInUser]);

  const query = useExecutivePerformanceQuery(queryFilters, Boolean(isSuperAdmin));

  const salesReps = useMemo(
    () => users.filter((u) => u.role === "sales_rep" && u.status !== "disabled"),
    [users],
  );

  const hasPending =
    draft.range !== applied.range ||
    draft.from !== applied.from ||
    draft.to !== applied.to ||
    draft.executiveId !== applied.executiveId ||
    draft.teamId !== applied.teamId ||
    draft.regionId !== applied.regionId ||
    draft.weekday !== applied.weekday ||
    draft.reasonType !== applied.reasonType ||
    draft.reason !== applied.reason;

  const applyFilters = () => {
    const resolved = resolveTimeRangeYmd(draft.range, draft.from, draft.to);
    const next = { ...draft, from: resolved.from, to: resolved.to };
    if (next.range === "custom" && ((next.from && !next.to) || (!next.from && next.to))) {
      toast({ title: "Select both from and to dates, or clear both for all time", variant: "destructive" });
      return;
    }
    setApplied(next);
    setDetailPage(1);
    saveSessionFilters(FILTER_SESSION_KEYS.executivePerformance, next);
    setSearchParams(executiveFiltersToSearchParams(next, tab), { replace: true });
  };

  const clearFilters = () => {
    const next: AppliedFilters = {
      range: "all",
      from: "",
      to: "",
      executiveId: "all",
      teamId: "all",
      regionId: "all",
      weekday: "all",
      reasonType: "all",
      reason: "all",
    };
    setDraft(next);
    setApplied(next);
    setDetailPage(1);
    // Persist all-time so refresh stays cleared (not reset to current month).
    saveSessionFilters(FILTER_SESSION_KEYS.executivePerformance, next);
    setSearchParams(executiveFiltersToSearchParams(next, tab), { replace: true });
  };

  const hasActiveAppliedFilters =
    applied.range !== "all" ||
    applied.executiveId !== "all" ||
    applied.teamId !== "all" ||
    applied.regionId !== "all" ||
    applied.weekday !== "all" ||
    applied.reasonType !== "all" ||
    applied.reason !== "all";

  const onTabChange = (value: string) => {
    setTab(value);
    setSearchParams(executiveFiltersToSearchParams(applied, value), { replace: true });
  };

  const openDetail = useCallback((type: ExecutiveDetailType) => {
    setDetailType(type);
    setDetailPage(1);
    setDetailOpen(true);
  }, []);

  const data = query.data;
  const summary = data?.summary;
  const selectedExec = applied.executiveId !== "all"
    ? data?.executives.find((e) => e.userId === applied.executiveId) ||
      salesReps.find((u) => u.id === applied.executiveId)
    : null;

  const trendConfig = {
    proposalsCreated: { label: "Proposals", color: CHART_COLORS[0] },
    dealsWon: { label: "Deals won", color: CHART_COLORS[1] },
    wonValue: { label: "Won value", color: CHART_COLORS[2] },
  } satisfies ChartConfig;

  const rankingConfig = {
    wonValue: { label: "Won value", color: CHART_COLORS[0] },
  } satisfies ChartConfig;

  const comparisonConfig = {
    metric: {
      label: COMPARISON_METRICS.find((m) => m.key === comparisonMetric)?.label ?? "Metric",
      color: CHART_COLORS[0],
    },
  } satisfies ChartConfig;

  const winRateConfig = {
    winRate: { label: "Win rate %", color: CHART_COLORS[1] },
  } satisfies ChartConfig;

  const funnelConfig = {
    count: { label: "Count", color: CHART_COLORS[0] },
  } satisfies ChartConfig;

  const weekdayConfig = {
    dealsWon: { label: "Won", color: CHART_COLORS[1] },
    dealsLost: { label: "Lost", color: CHART_COLORS[3] },
    proposalsCreated: { label: "Proposals", color: CHART_COLORS[0] },
  } satisfies ChartConfig;

  const reasonConfig = {
    count: { label: "Count", color: CHART_COLORS[3] },
  } satisfies ChartConfig;

  const comparisonMetricMeta =
    COMPARISON_METRICS.find((m) => m.key === comparisonMetric) ?? COMPARISON_METRICS[0];

  const wonRankingData = useMemo(() => {
    return [...(data?.executives ?? [])]
      .map((e) => ({
        name: e.name.length > 18 ? `${e.name.slice(0, 16)}…` : e.name,
        fullName: e.name,
        wonValue: e.wonValue,
        userId: e.userId,
      }))
      .filter((r) => r.wonValue > 0)
      .sort((a, b) => b.wonValue - a.wonValue)
      .slice(0, 12);
  }, [data?.executives]);

  const rankingData = useMemo(() => {
    return [...(data?.executives ?? [])]
      .map((e) => ({
        name: e.name.length > 18 ? `${e.name.slice(0, 16)}…` : e.name,
        fullName: e.name,
        metric: Number(e[comparisonMetric] ?? 0),
        userId: e.userId,
      }))
      .filter((r) => r.metric > 0)
      .sort((a, b) => b.metric - a.metric)
      .slice(0, 12);
  }, [comparisonMetric, data?.executives]);

  const winRateData = (data?.executives ?? []).slice(0, 12).map((e) => ({
    name: e.name.length > 18 ? `${e.name.slice(0, 16)}…` : e.name,
    fullName: e.name,
    winRate: e.winRate,
    userId: e.userId,
  }));

  const reasonOptions = useMemo(() => {
    const list =
      draft.reasonType === "rejection"
        ? data?.rejectionReasons ?? []
        : draft.reasonType === "loss"
          ? data?.lossReasons ?? []
          : [...(data?.lossReasons ?? []), ...(data?.rejectionReasons ?? [])];
    const seen = new Set<string>();
    return list.filter((r) => {
      if (seen.has(r.reason)) return false;
      seen.add(r.reason);
      return true;
    });
  }, [data?.lossReasons, data?.rejectionReasons, draft.reasonType]);

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Topbar
        title="Executive performance"
        subtitle={smUp ? "Sales analytics by person, team, region, and reason" : undefined}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={!data || query.isFetching}
              onClick={() => {
                if (!data) return;
                exportExecutivePerformanceXlsx(data);
                toast({ title: "Export downloaded" });
              }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
              title="Refresh"
            >
              {query.isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        }
      />

      <motion.div {...pageEnter} className="space-y-3">
        <FilterPanel
          title="Filters"
          storageKey="ui:executive-performance:filtersOpen"
          defaultOpen={smUp}
          headerActions={
            hasActiveAppliedFilters ? (
              <div className="scrollbar-none flex min-w-0 flex-wrap items-center justify-end gap-1 overflow-x-auto">
                {timeRangeChip(applied.range, applied.from, applied.to) ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {timeRangeChip(applied.range, applied.from, applied.to)}
                  </span>
                ) : (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    All time
                  </span>
                )}
                {applied.executiveId !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {salesReps.find((u) => u.id === applied.executiveId)?.name ?? "Executive"}
                  </span>
                ) : null}
                {applied.teamId !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {teams.find((t) => t.id === applied.teamId)?.name ?? "Team"}
                  </span>
                ) : null}
                {applied.regionId !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {regions.find((r) => r.id === applied.regionId)?.name ?? "Region"}
                  </span>
                ) : null}
              </div>
            ) : null
          }
        >
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <TimeRangeFilter
                preset={draft.range}
                customFrom={draft.from}
                customTo={draft.to}
                onPresetChange={(preset) => {
                  setDraft((prev) => {
                    if (preset === "custom") return { ...prev, range: preset };
                    const resolved = resolveTimeRangeYmd(preset, prev.from, prev.to);
                    return { ...prev, range: preset, from: resolved.from, to: resolved.to };
                  });
                }}
                onCustomChange={(from, to) => setDraft((prev) => ({ ...prev, range: "custom", from, to }))}
                customPlaceholder={!draft.from && !draft.to ? "All time" : "Date range"}
              />

              <Select
                value={draft.executiveId}
                onValueChange={(v) => setDraft((p) => ({ ...p, executiveId: v }))}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All executives" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All executives</SelectItem>
                  {salesReps.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={draft.teamId} onValueChange={(v) => setDraft((p) => ({ ...p, teamId: v }))}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={draft.regionId}
                onValueChange={(v) => setDraft((p) => ({ ...p, regionId: v }))}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={draft.weekday}
                onValueChange={(v) => setDraft((p) => ({ ...p, weekday: v }))}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All days</SelectItem>
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <SelectItem key={label} value={String(idx)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={draft.reasonType}
                onValueChange={(v) =>
                  setDraft((p) => ({
                    ...p,
                    reasonType: v,
                    reason: v === "all" ? "all" : p.reason,
                  }))
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Reason type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reason types</SelectItem>
                  <SelectItem value="loss">Deal loss</SelectItem>
                  <SelectItem value="rejection">Proposal rejection</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={draft.reason}
                onValueChange={(v) => setDraft((p) => ({ ...p, reason: v }))}
                disabled={draft.reasonType === "all"}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  {reasonOptions.map((r) => (
                    <SelectItem key={r.reason} value={r.reason}>
                      {r.reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                disabled={!hasActiveAppliedFilters && !hasPending}
                onClick={clearFilters}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                disabled={!hasPending}
                onClick={applyFilters}
              >
                Apply
              </Button>
            </div>
          </div>
        </FilterPanel>

        {data?.coverage?.notes?.length ? (
          <div className="card-soft flex items-start gap-2 px-3 py-2.5 text-[11px] text-warning-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div className="min-w-0 space-y-0.5">
              {data.coverage.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[3.25rem] rounded-lg" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="card-soft flex flex-col items-start gap-2 px-4 py-8">
            <p className="text-sm text-destructive">
              {(query.error as Error)?.message || "Failed to load executive performance"}
            </p>
            <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {selectedExec && "name" in selectedExec ? (
              <div className="card-soft flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Selected executive</p>
                  <p className="truncate text-sm font-semibold">{selectedExec.name}</p>
                </div>
                {"winRate" in selectedExec ? (
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill tone="info">{selectedExec.proposalsCreated ?? 0} proposals</StatusPill>
                    <StatusPill tone="success">Won {selectedExec.proposalsWon ?? 0}</StatusPill>
                    <StatusPill tone="muted">{formatINR(selectedExec.revenueExclGst ?? 0)} excl. GST</StatusPill>
                  </div>
                ) : null}
              </div>
            ) : null}

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 sm:gap-2"
            >
              <KpiCard
                label="Total proposals"
                value={String(summary?.proposalsCreated ?? 0)}
                sub="Created in period"
                icon={FileText}
                iconColor="text-primary"
                iconBg="bg-primary/15"
                onClick={() => openDetail("proposals_created")}
              />
              <KpiCard
                label="Total sent"
                value={String(summary?.proposalsSent ?? 0)}
                sub="Sent or shared"
                icon={Send}
                iconColor="text-info"
                iconBg="bg-info/15"
                onClick={() => openDetail("proposals_sent")}
              />
              <KpiCard
                label="Pending proposals"
                value={String(summary?.proposalsPending ?? 0)}
                sub={summary?.proposalsPending ? "Awaiting approval" : "None waiting"}
                icon={Clock}
                iconColor="text-warning-foreground"
                iconBg="bg-warning/15"
                onClick={() => openDetail("proposals_pending")}
              />
              <KpiCard
                label="Won"
                value={String(summary?.proposalsWon ?? 0)}
                sub="In selected period"
                icon={Trophy}
                iconColor="text-success"
                iconBg="bg-success/15"
                onClick={() => openDetail("proposals_won")}
              />
              <KpiCard
                label="Revenue without GST"
                value={formatINR(summary?.revenueExclGst ?? 0)}
                sub="Won excl. GST"
                icon={IndianRupee}
                iconColor="text-success"
                iconBg="bg-success/15"
                onClick={() => openDetail("proposals_won")}
              />
            </motion.div>

            <ExecutiveTargetAchievement
              data={data?.targetVsAchievement}
              isLoading={query.isLoading && !data}
            />

            <Tabs value={tab} onValueChange={onTabChange} className="space-y-3">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="comparison">{smUp ? "Employee comparison" : "Compare"}</TabsTrigger>
                <TabsTrigger value="reasons">{smUp ? "Reasons & details" : "Reasons"}</TabsTrigger>
              </TabsList>

              <TabsContent
                value="overview"
                className="mt-0 space-y-4 duration-200 animate-in fade-in-0 data-[state=inactive]:hidden"
              >
                <ChartCard
                  title="Performance trend"
                  description="Daily proposals created, deals won, and won value in the selected range."
                >
                  {(data?.trend?.length ?? 0) === 0 ? (
                    <EmptyChart message="No trend data for this range." />
                  ) : (
                    <ChartContainer config={trendConfig} className="h-40 w-full sm:h-56 lg:h-72">
                      <LineChart data={data?.trend} margin={{ left: 8, right: 16, top: 18, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          minTickGap={28}
                          tickFormatter={(v) => String(v).slice(5)}
                        />
                        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={36} />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tickLine={false}
                          axisLine={false}
                          width={56}
                          tickFormatter={formatChartNumber}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="proposalsCreated"
                          stroke="var(--color-proposalsCreated)"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        >
                          <LabelList dataKey="proposalsCreated" position="top" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                        </Line>
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="dealsWon"
                          stroke="var(--color-dealsWon)"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        >
                          <LabelList dataKey="dealsWon" position="bottom" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                        </Line>
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="wonValue"
                          stroke="var(--color-wonValue)"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        >
                          <LabelList dataKey="wonValue" position="top" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                        </Line>
                      </LineChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <ChartCard
                    title={applied.executiveId === "all" ? "Top executives by won value" : "Won value"}
                    description="Horizontal ranking keeps labels readable — click a bar to open won deals."
                  >
                    {wonRankingData.length === 0 ? (
                      <EmptyChart message="No executive wins in this period." />
                    ) : (
                      <ChartContainer
                        config={rankingConfig}
                        className="h-48 w-full sm:h-64 lg:h-72"
                        style={{ height: Math.max(256, wonRankingData.length * 36) }}
                      >
                        <BarChart
                          data={wonRankingData}
                          layout="vertical"
                          margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatChartNumber}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tickLine={false}
                            axisLine={false}
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                labelFormatter={(_, payload) =>
                                  String(payload?.[0]?.payload?.fullName ?? "")
                                }
                              />
                            }
                          />
                          <Bar
                            dataKey="wonValue"
                            fill="var(--color-wonValue)"
                            radius={[0, 6, 6, 0]}
                            cursor="pointer"
                            onClick={() => openDetail("deals_won")}
                          >
                            <LabelList dataKey="wonValue" position="right" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>

                  <ChartCard
                    title="Conversion funnel"
                    description="Proposal stages for the filtered period — Won matches the summary KPI (proposals and closed deals, deduplicated)."
                  >
                    {(data?.funnel?.length ?? 0) === 0 ? (
                      <EmptyChart message="No funnel activity in this period." />
                    ) : (
                      <ChartContainer config={funnelConfig} className="h-48 w-full sm:h-64 lg:h-72">
                        <BarChart
                          data={data?.funnel}
                          margin={{ left: 8, right: 12, top: 22, bottom: 24 }}
                        >
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                            angle={-18}
                            textAnchor="end"
                            height={56}
                            tick={{ fontSize: 11 }}
                          />
                          <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="count"
                            radius={[6, 6, 0, 0]}
                            cursor="pointer"
                            onClick={(entry) => {
                              const key = (entry as { payload?: { key?: string } })?.payload
                                ?.key as ExecutiveDetailType | undefined;
                              if (key) openDetail(key);
                            }}
                          >
                            {(data?.funnel ?? []).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                            <LabelList dataKey="count" position="top" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>
                </div>
              </TabsContent>

              <TabsContent
                value="comparison"
                className="mt-0 space-y-4 duration-200 animate-in fade-in-0"
              >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <ChartCard
                    title={`${comparisonMetricMeta.label} by executive`}
                    description="Pick a metric to compare executives — one series keeps the chart readable."
                    action={
                      <Select
                        value={comparisonMetric}
                        onValueChange={(v) => setComparisonMetric(v as ComparisonMetricKey)}
                      >
                        <SelectTrigger className="h-8 w-full min-w-0 text-xs sm:w-[180px]">
                          <SelectValue placeholder="Metric" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPARISON_METRICS.map((m) => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  >
                    {rankingData.length === 0 ? (
                      <EmptyChart message="No comparison data for this metric." />
                    ) : (
                      <ChartContainer config={comparisonConfig} className="h-48 w-full sm:h-64 lg:h-72">
                        <BarChart data={rankingData} layout="vertical" margin={{ left: 8, right: 48 }}>
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatChartNumber}
                          />
                          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) =>
                                  comparisonMetricMeta.format === "inr"
                                    ? formatINR(Number(value) || 0)
                                    : String(value)
                                }
                              />
                            }
                          />
                          <Bar
                            dataKey="metric"
                            fill="var(--color-metric)"
                            radius={[0, 6, 6, 0]}
                            cursor={comparisonMetricMeta.detailType ? "pointer" : undefined}
                            onClick={() => {
                              if (comparisonMetricMeta.detailType) openDetail(comparisonMetricMeta.detailType);
                            }}
                          >
                            <LabelList dataKey="metric" position="right" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>

                  <ChartCard
                    title="Win rate by executive"
                    description="Closed-won ÷ (won + lost) for the selected period."
                  >
                    {winRateData.length === 0 ? (
                      <EmptyChart message="No closed deals to compare." />
                    ) : (
                      <ChartContainer config={winRateConfig} className="h-48 w-full sm:h-64 lg:h-72">
                        <BarChart data={winRateData} layout="vertical" margin={{ left: 8, right: 40 }}>
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="winRate" fill="var(--color-winRate)" radius={[0, 6, 6, 0]}>
                            <LabelList dataKey="winRate" position="right" offset={6} style={CHART_LABEL} formatter={formatChartPercent} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>
                </div>

                <ChartCard
                  title="Weekday performance"
                  description="When wins, losses, and proposal creation happen across the week."
                >
                  <ChartContainer config={weekdayConfig} className="h-48 w-full sm:h-64">
                    <BarChart
                      data={data?.weekdayPerformance}
                      margin={{ left: 8, right: 12, top: 22, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="proposalsCreated" fill="var(--color-proposalsCreated)" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="proposalsCreated" position="top" offset={4} style={CHART_LABEL} formatter={formatChartNumber} />
                      </Bar>
                      <Bar dataKey="dealsWon" fill="var(--color-dealsWon)" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="dealsWon" position="top" offset={4} style={CHART_LABEL} formatter={formatChartNumber} />
                      </Bar>
                      <Bar dataKey="dealsLost" fill="var(--color-dealsLost)" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="dealsLost" position="top" offset={4} style={CHART_LABEL} formatter={formatChartNumber} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </ChartCard>

                <div className="card-soft overflow-hidden">
                  <div className="border-b border-border px-3 py-2.5 sm:px-4">
                    <h3 className="text-sm font-semibold text-foreground">Executive comparison</h3>
                    <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                      Same filters as the charts. Tap a row to focus that executive.
                    </p>
                  </div>
                  {(data?.executives ?? []).length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">No executives match these filters.</p>
                  ) : !smUp ? (
                    <div className="divide-y divide-border">
                      {data?.executives.map((e) => (
                        <button
                          key={e.userId}
                          type="button"
                          className="flex w-full items-start justify-between gap-2 px-2.5 py-2.5 text-left"
                          onClick={() => {
                            const next = { ...applied, executiveId: e.userId };
                            setDraft(next);
                            setApplied(next);
                            setSearchParams(executiveFiltersToSearchParams(next, tab), { replace: true });
                          }}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{e.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{e.teamName || "—"}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold tabular-nums">{formatINR(e.wonValue)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {e.dealsWon} won · {e.winRate}%
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="scrollbar-soft overflow-x-auto">
                      <Table responsiveShell={false}>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase tracking-wide">Executive</TableHead>
                            <TableHead className="hidden text-[10px] uppercase tracking-wide md:table-cell">Team</TableHead>
                            <TableHead className="text-right text-[10px] uppercase tracking-wide">Won</TableHead>
                            <TableHead className="text-right text-[10px] uppercase tracking-wide">Lost</TableHead>
                            <TableHead className="text-right text-[10px] uppercase tracking-wide">Win %</TableHead>
                            <TableHead className="text-right text-[10px] uppercase tracking-wide">Won value</TableHead>
                            <TableHead className="hidden text-right text-[10px] uppercase tracking-wide lg:table-cell">Collected</TableHead>
                            <TableHead className="hidden text-right text-[10px] uppercase tracking-wide lg:table-cell">Pipeline</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data?.executives.map((e) => (
                            <TableRow
                              key={e.userId}
                              className="cursor-pointer"
                              onClick={() => {
                                const next = { ...applied, executiveId: e.userId };
                                setDraft(next);
                                setApplied(next);
                                setSearchParams(executiveFiltersToSearchParams(next, tab), {
                                  replace: true,
                                });
                              }}
                            >
                              <TableCell className="font-medium">{e.name}</TableCell>
                              <TableCell className="hidden md:table-cell">{e.teamName || "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{e.dealsWon}</TableCell>
                              <TableCell className="text-right tabular-nums">{e.dealsLost}</TableCell>
                              <TableCell className="text-right tabular-nums">{e.winRate}%</TableCell>
                              <TableCell className="text-right tabular-nums">{formatINR(e.wonValue)}</TableCell>
                              <TableCell className="hidden text-right tabular-nums lg:table-cell">
                                {formatINR(e.collectedRevenue)}
                              </TableCell>
                              <TableCell className="hidden text-right tabular-nums lg:table-cell">
                                {formatINR(e.pipelineValue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="reasons"
                className="mt-0 space-y-4 duration-200 animate-in fade-in-0"
              >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <ChartCard
                    title="Deal loss reasons"
                    description="Normalized labels; free-text originals remain in the detail list."
                  >
                    {(data?.lossReasons?.length ?? 0) === 0 ? (
                      <EmptyChart message="No lost deals with reasons in this period." />
                    ) : (
                      <ChartContainer config={reasonConfig} className="h-48 w-full sm:h-64 lg:h-72">
                        <BarChart
                          data={(data?.lossReasons ?? []).slice(0, 10)}
                          layout="vertical"
                          margin={{ left: 8, right: 36 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                          <YAxis
                            type="category"
                            dataKey="reason"
                            width={120}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="count"
                            fill="var(--color-count)"
                            radius={[0, 6, 6, 0]}
                            cursor="pointer"
                            onClick={() => openDetail("loss_reason")}
                          >
                            <LabelList dataKey="count" position="right" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>

                  <ChartCard
                    title="Proposal rejection reasons"
                    description="Rejected proposals in the selected range, grouped by reason."
                  >
                    {(data?.rejectionReasons?.length ?? 0) === 0 ? (
                      <EmptyChart message="No rejected proposals with reasons in this period." />
                    ) : (
                      <ChartContainer config={reasonConfig} className="h-48 w-full sm:h-64 lg:h-72">
                        <BarChart
                          data={(data?.rejectionReasons ?? []).slice(0, 10)}
                          layout="vertical"
                          margin={{ left: 8, right: 36 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                          <YAxis
                            type="category"
                            dataKey="reason"
                            width={120}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="count"
                            fill={CHART_COLORS[5]}
                            radius={[0, 6, 6, 0]}
                            cursor="pointer"
                            onClick={() => openDetail("rejection_reason")}
                          >
                            <LabelList dataKey="count" position="right" offset={6} style={CHART_LABEL} formatter={formatChartNumber} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>
                </div>

                <div className="card-soft overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">Event details</h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {data?.details.total ?? 0} matching · open a KPI to focus
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openDetail("proposals_created")}>
                        Proposals
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openDetail("proposals_sent")}>
                        Sent
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openDetail("proposals_pending")}>
                        Pending
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openDetail("proposals_won")}>
                        Won
                      </Button>
                    </div>
                  </div>
                  {(data?.details.rows ?? []).length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">No detail rows for the current filters.</p>
                  ) : !smUp ? (
                    <div className="divide-y divide-border">
                      {data?.details.rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="flex w-full items-start justify-between gap-2 px-2.5 py-2.5 text-left"
                          onClick={() => row.href && navigate(row.href)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {row.executiveName || "—"}
                              {row.reason ? ` · ${row.reason}` : row.status ? ` · ${row.status}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold tabular-nums">
                              {row.amount != null ? formatINR(row.amount) : "—"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{String(row.at).slice(0, 10)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="scrollbar-soft overflow-x-auto">
                      <Table responsiveShell={false}>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase tracking-wide">Record</TableHead>
                            <TableHead className="text-[10px] uppercase tracking-wide">Executive</TableHead>
                            <TableHead className="hidden text-[10px] uppercase tracking-wide md:table-cell">Status / reason</TableHead>
                            <TableHead className="text-right text-[10px] uppercase tracking-wide">Amount</TableHead>
                            <TableHead className="hidden text-right text-[10px] uppercase tracking-wide lg:table-cell">When</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data?.details.rows.map((row) => (
                            <TableRow
                              key={row.id}
                              className="cursor-pointer"
                              onClick={() => row.href && navigate(row.href)}
                            >
                              <TableCell>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{row.title}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {row.type}
                                    {row.subtitle ? ` · ${row.subtitle}` : ""}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>{row.executiveName || "—"}</TableCell>
                              <TableCell className="hidden max-w-[200px] truncate md:table-cell">
                                {row.reason || row.status || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.amount != null ? formatINR(row.amount) : "—"}
                              </TableCell>
                              <TableCell className="hidden text-right text-xs text-muted-foreground lg:table-cell">
                                {String(row.at).slice(0, 10)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                    {(data?.details.total ?? 0) > (data?.details.pageSize ?? 25) ? (
                      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 sm:px-4">
                        <p className="text-[11px] text-muted-foreground">
                          Page {data?.details.page} · {data?.details.total} total
                        </p>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={detailPage <= 1}
                            onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={
                              (data?.details.page ?? 1) * (data?.details.pageSize ?? 25) >=
                              (data?.details.total ?? 0)
                            }
                            onClick={() => setDetailPage((p) => p + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    ) : null}
                </div>
              </TabsContent>
            </Tabs>

            <DailyActivityTable
              rows={data?.dailyBreakdown ?? []}
              onOpenRecord={(row) => {
                if (row.href) navigate(row.href);
              }}
            />
          </>
        )}
      </motion.div>

      <Sheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailType(null);
        }}
      >
        <SheetContent side="right" className={cn(sheetContentDetail, "sm:max-w-lg")}>
          <SheetHeader>
            <SheetTitle>Drill-down</SheetTitle>
            <SheetDescription>
              {detailType ? detailType.replace(/_/g, " ") : "Records"} · {data?.details.total ?? 0}{" "}
              matching
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {query.isFetching ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (data?.details.rows ?? []).length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">No records for this drill-down.</p>
            ) : (
              data?.details.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-primary/30"
                  onClick={() => {
                    if (row.href) {
                      setDetailOpen(false);
                      navigate(row.href);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.executiveName || "—"}
                        {row.reason ? ` · ${row.reason}` : row.status ? ` · ${row.status}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">
                        {row.amount != null ? formatINR(row.amount) : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{String(row.at).slice(0, 10)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
