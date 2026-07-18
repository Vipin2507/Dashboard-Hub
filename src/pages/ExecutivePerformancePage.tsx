import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Building2,
  Download,
  FileText,
  Handshake,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { FilterPanel } from "@/components/FilterPanel";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { currentMonthYmd } from "@/lib/dateRange";
import { WEEKDAY_LABELS } from "@/lib/executivePerformanceMetrics";
import { exportExecutivePerformanceXlsx } from "@/lib/executivePerformanceExport";
import {
  executiveFiltersToSearchParams,
  readExecutiveFiltersFromParams,
  type ExecutiveUrlFilters,
} from "@/lib/executivePerformanceUrl";
import { useExecutivePerformanceQuery } from "@/hooks/useExecutivePerformanceQuery";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { cn } from "@/lib/utils";
import type {
  ExecutiveDailyBreakdownRow,
  ExecutiveDetailRecord,
  ExecutiveDetailType,
  ExecutivePerformanceFilters,
} from "@/types/executivePerformance";
import { useToast } from "@/hooks/use-toast";

type AppliedFilters = ExecutiveUrlFilters;

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
];

const TYPE_META: Record<
  ExecutiveDetailRecord["type"],
  { label: string; icon: React.ElementType; className: string }
> = {
  proposal: {
    label: "Proposal",
    icon: FileText,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  deal: {
    label: "Deal",
    icon: Handshake,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  customer: {
    label: "Customer",
    icon: Building2,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  payment: {
    label: "Payment",
    icon: TrendingUp,
    className: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
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
        "min-w-[4.5rem] rounded-lg border px-2.5 py-1.5 text-center transition-colors duration-200",
        muted || value === 0
          ? "border-transparent bg-muted/40 text-muted-foreground"
          : "border-border bg-background text-foreground",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily activity</CardTitle>
          <CardDescription className="text-xs">
            Row-level counts for each day in the selected filters. Expand a day for full records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No daily activity for this filter set.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Daily activity</CardTitle>
        <CardDescription className="text-xs">
          {rows.length} day{rows.length === 1 ? "" : "s"} with activity · expand any row for proposals,
          deals, customers, and payments on that date.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0 sm:px-0">
        {/* Desktop / tablet header */}
        <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(6,minmax(0,0.7fr))_auto] gap-2 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid lg:px-6">
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
                className="border-b border-border px-4 last:border-b-0 lg:px-6"
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
                      <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {day.wonValue > 0 ? (
                          <Badge variant="secondary">Won value {formatINR(day.wonValue)}</Badge>
                        ) : null}
                        {day.collectedRevenue > 0 ? (
                          <Badge variant="outline">
                            Collected {formatINR(day.collectedRevenue)}
                          </Badge>
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
                              "flex w-full items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left",
                              "transition-all duration-200 hover:border-primary/30 hover:bg-accent/40 hover:shadow-sm",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  {meta.label}
                                </Badge>
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
      </CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-200",
        "hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary transition-colors duration-200 group-hover:bg-primary/15">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden transition-shadow duration-200 hover:shadow-md", className)}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="text-xs leading-relaxed">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground sm:h-64 lg:h-72">
      {message}
    </div>
  );
}

export default function ExecutivePerformancePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const authUserId = useAppStore((s) => s.authUserId);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);

  const loggedInUser = users.find((u) => u.id === authUserId);
  const isSuperAdmin = loggedInUser?.role === "super_admin";

  const [applied, setApplied] = useState<AppliedFilters>(() =>
    readExecutiveFiltersFromParams(searchParams),
  );
  const [draft, setDraft] = useState<AppliedFilters>(() =>
    readExecutiveFiltersFromParams(searchParams),
  );
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const [detailType, setDetailType] = useState<ExecutiveDetailType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPage, setDetailPage] = useState(1);

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
    draft.from !== applied.from ||
    draft.to !== applied.to ||
    draft.executiveId !== applied.executiveId ||
    draft.teamId !== applied.teamId ||
    draft.regionId !== applied.regionId ||
    draft.weekday !== applied.weekday ||
    draft.reasonType !== applied.reasonType ||
    draft.reason !== applied.reason;

  const applyFilters = () => {
    const next = { ...draft };
    if (!next.from || !next.to) {
      toast({ title: "Select a valid date range", variant: "destructive" });
      return;
    }
    setApplied(next);
    setDetailPage(1);
    setSearchParams(executiveFiltersToSearchParams(next, tab), { replace: true });
  };

  const clearFilters = () => {
    const month = currentMonthYmd();
    const next: AppliedFilters = {
      from: month.from,
      to: month.to,
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
    setSearchParams(executiveFiltersToSearchParams(next, tab), { replace: true });
  };

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

  const rankingData = (data?.executives ?? []).slice(0, 12).map((e) => ({
    name: e.name.length > 18 ? `${e.name.slice(0, 16)}…` : e.name,
    fullName: e.name,
    wonValue: e.wonValue,
    userId: e.userId,
  }));

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
        subtitle="Super Admin — sales executive analytics by person, team, region, day, and reason"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={!data || query.isFetching}
              onClick={() => {
                if (!data) return;
                exportExecutivePerformanceXlsx(data);
                toast({ title: "Export downloaded" });
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 w-9 p-0"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
              title="Refresh"
            >
              {query.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        }
      />

      <div className="space-y-4 sm:space-y-6">
        <FilterPanel title="Filters" storageKey="ui:executive-performance:filtersOpen">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">Date range</p>
                <Datepicker
                  controls={["calendar"]}
                  select="range"
                  touchUi={true}
                  inputComponent="input"
                  inputProps={{
                    placeholder: "Select range…",
                    className: "h-9 w-full",
                  }}
                  value={[ymdToDate(draft.from), ymdToDate(draft.to)]}
                  onChange={(ev) => {
                    const [f, t] = ev.value as [Date | null, Date | null];
                    setDraft((prev) => ({
                      ...prev,
                      from: f ? dateToYmd(f) : prev.from,
                      to: t ? dateToYmd(t) : prev.to,
                    }));
                  }}
                />
              </div>

              <Select
                value={draft.executiveId}
                onValueChange={(v) => setDraft((p) => ({ ...p, executiveId: v }))}
              >
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[180px]">
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
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[160px]">
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
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[160px]">
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
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[150px]">
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
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[170px]">
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
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[180px]">
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

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Button type="button" variant="outline" className="h-9" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" className="h-9" disabled={!hasPending} onClick={applyFilters}>
                Apply
              </Button>
            </div>
          </div>
        </FilterPanel>

        {data?.coverage?.notes?.length ? (
          <div className="flex flex-wrap items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 space-y-0.5">
              {data.coverage.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col items-start gap-3 py-8">
              <p className="text-sm text-destructive">
                {(query.error as Error)?.message || "Failed to load executive performance"}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {selectedExec && "name" in selectedExec ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3 transition-colors duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected executive</p>
                    <p className="text-lg font-semibold">{selectedExec.name}</p>
                  </div>
                  {"winRate" in selectedExec ? (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">Win rate {selectedExec.winRate}%</Badge>
                      <Badge variant="outline">Won {formatINR(selectedExec.wonValue)}</Badge>
                      <Badge variant="outline">Pipeline {formatINR(selectedExec.pipelineValue)}</Badge>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
              <KpiCard
                label="Won value"
                value={formatINR(summary?.wonValue ?? 0)}
                sub={`${summary?.dealsWon ?? 0} deals won · avg ${formatINR(summary?.avgWonDealSize ?? 0)}`}
                icon={TrendingUp}
                onClick={() => openDetail("deals_won")}
              />
              <KpiCard
                label="Win rate"
                value={`${summary?.winRate ?? 0}%`}
                sub={`${summary?.dealsWon ?? 0} won / ${summary?.dealsLost ?? 0} lost`}
                icon={Target}
                onClick={() => openDetail("deals_lost")}
              />
              <KpiCard
                label="Collected revenue"
                value={formatINR(summary?.collectedRevenue ?? 0)}
                sub={`${summary?.collectedPaymentCount ?? 0} payments`}
                icon={Handshake}
                onClick={() => openDetail("payments_collected")}
              />
              <KpiCard
                label="Pipeline"
                value={formatINR(summary?.pipelineValue ?? 0)}
                sub={`${summary?.pipelineCount ?? 0} open deals · ${summary?.customersNew ?? 0} new customers`}
                icon={Users}
                onClick={() => openDetail("pipeline")}
              />
            </div>

            <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
                <TabsTrigger value="overview" className="transition-all duration-200">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="comparison" className="transition-all duration-200">
                  Employee comparison
                </TabsTrigger>
                <TabsTrigger value="reasons" className="transition-all duration-200">
                  Reasons & details
                </TabsTrigger>
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
                    <ChartContainer config={trendConfig} className="h-56 w-full sm:h-72 lg:h-80">
                      <LineChart data={data?.trend} margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
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
                          tickFormatter={(v) =>
                            v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                          }
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="proposalsCreated"
                          stroke="var(--color-proposalsCreated)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="dealsWon"
                          stroke="var(--color-dealsWon)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="wonValue"
                          stroke="var(--color-wonValue)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <ChartCard
                    title={applied.executiveId === "all" ? "Top executives by won value" : "Won value"}
                    description="Horizontal ranking keeps labels readable — click a bar to open won deals."
                  >
                    {rankingData.length === 0 ? (
                      <EmptyChart message="No executive wins in this period." />
                    ) : (
                      <ChartContainer
                        config={rankingConfig}
                        className="h-64 w-full sm:h-72 lg:h-80"
                        style={{ height: Math.max(256, rankingData.length * 36) }}
                      >
                        <BarChart
                          data={rankingData}
                          layout="vertical"
                          margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) =>
                              v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                            }
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
                          />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>

                  <ChartCard
                    title="Conversion funnel"
                    description="Stage counts for the filtered period. Pipeline is current open book."
                  >
                    {(data?.funnel?.length ?? 0) === 0 ? (
                      <EmptyChart message="No funnel activity in this period." />
                    ) : (
                      <ChartContainer config={funnelConfig} className="h-64 w-full sm:h-72 lg:h-80">
                        <BarChart
                          data={data?.funnel}
                          margin={{ left: 8, right: 12, top: 8, bottom: 24 }}
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
                    title="Won value by executive"
                    description="Spacious horizontal bars — one metric per chart to avoid clutter."
                  >
                    {rankingData.length === 0 ? (
                      <EmptyChart message="No comparison data." />
                    ) : (
                      <ChartContainer config={rankingConfig} className="h-72 w-full lg:h-80">
                        <BarChart data={rankingData} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis type="number" tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="wonValue" fill="var(--color-wonValue)" radius={[0, 6, 6, 0]} />
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
                      <ChartContainer config={winRateConfig} className="h-72 w-full lg:h-80">
                        <BarChart data={winRateData} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="winRate" fill="var(--color-winRate)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>
                </div>

                <ChartCard
                  title="Weekday performance"
                  description="When wins, losses, and proposal creation happen across the week."
                >
                  <ChartContainer config={weekdayConfig} className="h-64 w-full sm:h-72">
                    <BarChart
                      data={data?.weekdayPerformance}
                      margin={{ left: 8, right: 12, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="proposalsCreated" fill="var(--color-proposalsCreated)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="dealsWon" fill="var(--color-dealsWon)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="dealsLost" fill="var(--color-dealsLost)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </ChartCard>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Executive comparison table</CardTitle>
                    <CardDescription className="text-xs">
                      Precise numbers for the same filters used in the charts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Executive</TableHead>
                          <TableHead className="hidden md:table-cell">Team</TableHead>
                          <TableHead className="text-right">Won</TableHead>
                          <TableHead className="text-right">Lost</TableHead>
                          <TableHead className="text-right">Win %</TableHead>
                          <TableHead className="text-right">Won value</TableHead>
                          <TableHead className="hidden text-right lg:table-cell">Collected</TableHead>
                          <TableHead className="hidden text-right lg:table-cell">Pipeline</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.executives ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                              No executives match these filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          data?.executives.map((e) => (
                            <TableRow
                              key={e.userId}
                              className="cursor-pointer transition-colors duration-150"
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
                              <TableCell className="text-right">{e.dealsWon}</TableCell>
                              <TableCell className="text-right">{e.dealsLost}</TableCell>
                              <TableCell className="text-right">{e.winRate}%</TableCell>
                              <TableCell className="text-right">{formatINR(e.wonValue)}</TableCell>
                              <TableCell className="hidden text-right lg:table-cell">
                                {formatINR(e.collectedRevenue)}
                              </TableCell>
                              <TableCell className="hidden text-right lg:table-cell">
                                {formatINR(e.pipelineValue)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
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
                      <ChartContainer config={reasonConfig} className="h-72 w-full lg:h-80">
                        <BarChart
                          data={(data?.lossReasons ?? []).slice(0, 10)}
                          layout="vertical"
                          margin={{ left: 8, right: 16 }}
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
                          />
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
                      <ChartContainer config={reasonConfig} className="h-72 w-full lg:h-80">
                        <BarChart
                          data={(data?.rejectionReasons ?? []).slice(0, 10)}
                          layout="vertical"
                          margin={{ left: 8, right: 16 }}
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
                          />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </ChartCard>
                </div>

                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                    <div>
                      <CardTitle className="text-base">Event details</CardTitle>
                      <CardDescription className="text-xs">
                        {data?.details.total ?? 0} matching records — open a KPI or chart to focus the list.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => openDetail("proposals_created")}>
                        Proposals
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => openDetail("deals_won")}>
                        Won deals
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => openDetail("deals_lost")}>
                        Lost deals
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Record</TableHead>
                          <TableHead className="hidden sm:table-cell">Executive</TableHead>
                          <TableHead className="hidden md:table-cell">Status / reason</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="hidden text-right lg:table-cell">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.details.rows ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                              No detail rows for the current filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          data?.details.rows.map((row) => (
                            <TableRow
                              key={row.id}
                              className="cursor-pointer transition-colors duration-150"
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
                              <TableCell className="hidden sm:table-cell">
                                {row.executiveName || "—"}
                              </TableCell>
                              <TableCell className="hidden max-w-[200px] truncate md:table-cell">
                                {row.reason || row.status || "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.amount != null ? formatINR(row.amount) : "—"}
                              </TableCell>
                              <TableCell className="hidden text-right text-xs text-muted-foreground lg:table-cell">
                                {String(row.at).slice(0, 10)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    {(data?.details.total ?? 0) > (data?.details.pageSize ?? 25) ? (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Page {data?.details.page} · {data?.details.total} total
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={detailPage <= 1}
                            onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
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
                  </CardContent>
                </Card>
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
      </div>

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
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50"
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
