import { useEffect, useMemo, useState, type ElementType } from 'react';
import { Topbar } from '@/components/Topbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/store/useAppStore';
import { formatINR } from '@/lib/rbac';
import { runAutomationRules } from '@/lib/automationService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  CalendarClock,
  Ticket,
  RefreshCw,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { hydrateTimeRange, resolveTimeRangeYmd, timeRangeChip, type TimeRangePreset } from '@/lib/dateRange';
import {
  FILTER_SESSION_KEYS,
  clearSessionFilters,
  loadLocalFilters,
  loadSessionFilters,
  saveLocalFilters,
} from '@/lib/filterSessionPersistence';
import { FilterPanel } from '@/components/FilterPanel';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import type { ProposalStatus } from '@/types';
import { isProposalWon, proposalStatusLabel, proposalStatusMatches, normalizeProposalStatus } from '@/lib/proposalStatus';
import { resolveDealPipelineStatus } from '@/lib/dealStatus';
import { getDealDateForFilter } from '@/lib/dealDate';
import { cn } from '@/lib/utils';
import { useSmUp } from '@/hooks/useSmUp';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { toast } from '@/components/ui/use-toast';
import { CountUp } from '@/components/CountUp';
import { chartTooltipStyle, hoverLift, staggerContainer, staggerItem, tapPress } from '@/lib/motion';
import { motion } from 'framer-motion';
import { dialogSmMax2xl } from '@/lib/dialogLayout';
import { useMdUp } from '@/hooks/useSmUp';

const CHART_PRIMARY = 'var(--color-primary)';
const CHART_DEEP = 'var(--color-primary-deep)';
const CHART_SUCCESS = 'var(--color-success)';
const CHART_WARNING = 'var(--color-warning)';
const CHART_DANGER = 'var(--color-danger)';

type PersistedDashboardFilters = {
  dateFrom: string;
  dateTo: string;
  timeRangeFilter?: TimeRangePreset;
  customFrom?: string;
  customTo?: string;
  ownerFilter: string;
  teamFilter: string;
  regionFilter: string;
  proposalStatusFilter: ProposalStatus | 'all';
};

const EMPTY_DASHBOARD_FILTERS: PersistedDashboardFilters = {
  dateFrom: '',
  dateTo: '',
  timeRangeFilter: 'all',
  customFrom: '',
  customTo: '',
  ownerFilter: 'all',
  teamFilter: 'all',
  regionFilter: 'all',
  proposalStatusFilter: 'all',
};

const DASHBOARD_FILTER_KEY = FILTER_SESSION_KEYS.dashboard;

function persistDashboardFilters(value: PersistedDashboardFilters) {
  saveLocalFilters(DASHBOARD_FILTER_KEY, value);
}

function coerceDashboardFilters(saved: PersistedDashboardFilters): PersistedDashboardFilters {
  return {
    ...saved,
    proposalStatusFilter: saved.proposalStatusFilter === "deal_created" ? "won" : saved.proposalStatusFilter,
  };
}

function loadDashboardFilters(): PersistedDashboardFilters | null {
  const local = loadLocalFilters<PersistedDashboardFilters>(DASHBOARD_FILTER_KEY);
  if (local) return coerceDashboardFilters(local);
  const session = loadSessionFilters<PersistedDashboardFilters>(DASHBOARD_FILTER_KEY);
  if (session) {
    const coerced = coerceDashboardFilters(session);
    persistDashboardFilters(coerced);
    return coerced;
  }
  return null;
}

function dashboardTimeRangeFromSaved(saved: PersistedDashboardFilters | null): {
  preset: TimeRangePreset;
  customFrom: string;
  customTo: string;
} {
  if (!saved) return { preset: 'this_month', customFrom: '', customTo: '' };
  return hydrateTimeRange({
    timeRangeFilter: saved.timeRangeFilter,
    dateFrom: saved.customFrom || saved.dateFrom,
    dateTo: saved.customTo || saved.dateTo,
  });
}

type DashboardKpiCardProps = {
  label: string;
  value: string;
  sub: string;
  icon: ElementType;
  iconColor: string;
  iconBg?: string;
  badge?: 'amber' | 'red' | 'orange';
  onClick?: () => void;
};

function DashboardKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg = 'bg-primary/10',
  badge,
  onClick,
}: DashboardKpiCardProps) {
  const isPlainInt = /^\d+$/.test(String(value).trim());

  const inner = (
    <>
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
          {isPlainInt ? <CountUp value={Number(value)} /> : value}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
      {onClick && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />}
      {badge && (
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            badge === 'amber' && 'bg-warning',
            badge === 'red' && 'bg-destructive',
            badge === 'orange' && 'bg-warning',
          )}
        />
      )}
    </>
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        variants={staggerItem}
        whileHover={hoverLift}
        whileTap={tapPress}
        className="card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0"
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.div variants={staggerItem} className="card-kpi w-full">
      {inner}
    </motion.div>
  );
}

export default function DashboardPage() {
  const me = useAppStore((s) => s.me);
  const live = useRealtimeSync();
  const guidanceKey = `GuidanceMode:v1:${me.id || 'guest'}`;
  const [guidanceMode, setGuidanceMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(guidanceKey) === '1';
    } catch {
      return false;
    }
  });
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
  const dealsForAutomation = useAppStore((s) => s.deals);
  const {
    scopedProposals,
    scopedDeals,
    scopedCustomers,
    kpis,
    paymentHistory,
    paymentsRemaining,
    subscriptionTrackerQuery,
    notificationsQuery,
    isLoading: dashboardLoading,
    refetchAll,
    proposalsQuery,
    dealsQuery,
    customersQuery,
  } = useDashboardData();
  const navigate = useNavigate();
  const smUp = useSmUp();
  const mdUp = useMdUp();
  const revenueBarSize = smUp ? 22 : 16;
  const persistedDashboardFilters = useMemo(() => loadDashboardFilters(), []);
  const initialDashRange = dashboardTimeRangeFromSaved(persistedDashboardFilters);

  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangePreset>(() => initialDashRange.preset);
  const [customFrom, setCustomFrom] = useState(() => initialDashRange.customFrom);
  const [customTo, setCustomTo] = useState(() => initialDashRange.customTo);
  const [ownerFilter, setOwnerFilter] = useState(() => persistedDashboardFilters?.ownerFilter ?? 'all');
  const [teamFilter, setTeamFilter] = useState(() => persistedDashboardFilters?.teamFilter ?? 'all');
  const [regionFilter, setRegionFilter] = useState(() => persistedDashboardFilters?.regionFilter ?? 'all');
  const [proposalStatusFilter, setProposalStatusFilter] = useState<ProposalStatus | 'all'>(
    () => persistedDashboardFilters?.proposalStatusFilter ?? 'all',
  );

  const [draftTimeRangeFilter, setDraftTimeRangeFilter] = useState<TimeRangePreset>(() => initialDashRange.preset);
  const [draftCustomFrom, setDraftCustomFrom] = useState(() => initialDashRange.customFrom);
  const [draftCustomTo, setDraftCustomTo] = useState(() => initialDashRange.customTo);
  const [draftOwnerFilter, setDraftOwnerFilter] = useState(() => persistedDashboardFilters?.ownerFilter ?? 'all');
  const [draftTeamFilter, setDraftTeamFilter] = useState(() => persistedDashboardFilters?.teamFilter ?? 'all');
  const [draftRegionFilter, setDraftRegionFilter] = useState(() => persistedDashboardFilters?.regionFilter ?? 'all');
  const [draftProposalStatusFilter, setDraftProposalStatusFilter] = useState<ProposalStatus | 'all'>(
    () => persistedDashboardFilters?.proposalStatusFilter ?? 'all',
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailCols, setDetailCols] = useState<Array<{ id: string; header: string; align?: 'right' }>>([]);
  const [detailRows, setDetailRows] = useState<Array<{ key: string; cells: Record<string, string> }>>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLink, setDetailLink] = useState('');

  const { from: dateFrom, to: dateTo } = resolveTimeRangeYmd(timeRangeFilter, customFrom, customTo);

  const hasPendingFilterChanges =
    draftTimeRangeFilter !== timeRangeFilter ||
    draftCustomFrom !== customFrom ||
    draftCustomTo !== customTo ||
    draftOwnerFilter !== ownerFilter ||
    draftTeamFilter !== teamFilter ||
    draftRegionFilter !== regionFilter ||
    draftProposalStatusFilter !== proposalStatusFilter;

  const hasActiveAppliedFilters =
    ownerFilter !== 'all' ||
    teamFilter !== 'all' ||
    regionFilter !== 'all' ||
    proposalStatusFilter !== 'all' ||
    timeRangeFilter !== 'all';

  const hydrateFromPersisted = (saved: PersistedDashboardFilters | null) => {
    const range = dashboardTimeRangeFromSaved(saved);
    const owner = saved?.ownerFilter ?? 'all';
    const team = saved?.teamFilter ?? 'all';
    const region = saved?.regionFilter ?? 'all';
    const status = saved?.proposalStatusFilter === 'deal_created' ? 'won' : (saved?.proposalStatusFilter ?? 'all');
    setTimeRangeFilter(range.preset);
    setDraftTimeRangeFilter(range.preset);
    setCustomFrom(range.customFrom);
    setDraftCustomFrom(range.customFrom);
    setCustomTo(range.customTo);
    setDraftCustomTo(range.customTo);
    setOwnerFilter(owner);
    setDraftOwnerFilter(owner);
    setTeamFilter(team);
    setDraftTeamFilter(team);
    setRegionFilter(region);
    setDraftRegionFilter(region);
    setProposalStatusFilter(status);
    setDraftProposalStatusFilter(status);
  };

  const applyFilters = () => {
    const resolved = resolveTimeRangeYmd(draftTimeRangeFilter, draftCustomFrom, draftCustomTo);
    const next: PersistedDashboardFilters = {
      dateFrom: resolved.from,
      dateTo: resolved.to,
      timeRangeFilter: draftTimeRangeFilter,
      customFrom: draftCustomFrom,
      customTo: draftCustomTo,
      ownerFilter: draftOwnerFilter,
      teamFilter: draftTeamFilter,
      regionFilter: draftRegionFilter,
      proposalStatusFilter: draftProposalStatusFilter,
    };
    setTimeRangeFilter(draftTimeRangeFilter);
    setCustomFrom(draftCustomFrom);
    setCustomTo(draftCustomTo);
    setOwnerFilter(draftOwnerFilter);
    setTeamFilter(draftTeamFilter);
    setRegionFilter(draftRegionFilter);
    setProposalStatusFilter(draftProposalStatusFilter);
    persistDashboardFilters(next);
  };

  const clearFilters = () => {
    hydrateFromPersisted(EMPTY_DASHBOARD_FILTERS);
    persistDashboardFilters(EMPTY_DASHBOARD_FILTERS);
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DASHBOARD_FILTER_KEY) return;
      try {
        hydrateFromPersisted(
          e.newValue ? (JSON.parse(e.newValue) as PersistedDashboardFilters) : EMPTY_DASHBOARD_FILTERS,
        );
      } catch {
        hydrateFromPersisted(EMPTY_DASHBOARD_FILTERS);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const ownerMeta = useMemo(() => {
    const map = new Map<string, { teamId: string; regionId: string }>();
    users.forEach((u) => map.set(u.id, { teamId: u.teamId, regionId: u.regionId }));
    return map;
  }, [users]);

  const inDateRange = (iso: string): boolean => {
    if (!iso) return true;
    const d = iso.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const filteredProposals = useMemo(() => {
    return scopedProposals.filter((p) => {
      if (proposalStatusFilter !== 'all' && !proposalStatusMatches(p.status, proposalStatusFilter)) return false;
      if (ownerFilter !== 'all' && p.assignedTo !== ownerFilter) return false;
      const meta = ownerMeta.get(p.assignedTo);
      if (teamFilter !== 'all' && meta?.teamId !== teamFilter) return false;
      if (regionFilter !== 'all' && meta?.regionId !== regionFilter) return false;
      return true;
    });
  }, [scopedProposals, proposalStatusFilter, ownerFilter, teamFilter, regionFilter, ownerMeta]);

  const filteredDeals = useMemo(() => {
    return scopedDeals.filter((d) => {
      if (ownerFilter !== 'all' && d.ownerUserId !== ownerFilter) return false;
      if (teamFilter !== 'all' && d.teamId !== teamFilter) return false;
      if (regionFilter !== 'all' && d.regionId !== regionFilter) return false;
      return true;
    });
  }, [scopedDeals, ownerFilter, teamFilter, regionFilter]);

  const filteredCustomers = useMemo(() => {
    return scopedCustomers.filter((c) => {
      if (ownerFilter !== 'all' && c.assignedTo && c.assignedTo !== ownerFilter) return false;
      if (teamFilter !== 'all' && c.teamId && c.teamId !== teamFilter) return false;
      if (regionFilter !== 'all' && c.regionId !== regionFilter) return false;
      return true;
    });
  }, [scopedCustomers, ownerFilter, teamFilter, regionFilter]);

  useEffect(() => {
    runAutomationRules();
    const interval = setInterval(() => runAutomationRules(), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const totalRevenue = useMemo(() => {
    const ids = new Set(filteredCustomers.map((c) => c.id));
    return paymentHistory
      .filter((r) => ids.has(r.customerId) && (!r.paymentStatus || r.paymentStatus === "confirmed"))
      .filter((r) => inDateRange(r.paymentDate))
      .reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
  }, [filteredCustomers, paymentHistory, dateFrom, dateTo]);

  const activeProposalsCount = useMemo(
    () =>
      filteredProposals.filter(
        (p) => inDateRange(p.createdAt) && (p.status === "sent" || p.status === "approval_pending" || p.status === "approved" || p.status === "negotiation" || isProposalWon(p.status)),
      ).length,
    [filteredProposals, dateFrom, dateTo],
  );

  const dealsClosedCount = useMemo(() => {
    return filteredDeals.filter((d) => {
      if (resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus) !== "Closed/Won") return false;
      const ts = getDealDateForFilter(d) ?? "";
      return inDateRange(ts);
    }).length;
  }, [filteredDeals, dateFrom, dateTo]);

  const newCustomersCount = useMemo(() => {
    return filteredCustomers.filter((c) => inDateRange(c.createdAt)).length;
  }, [filteredCustomers, dateFrom, dateTo]);

  const pendingApprovals = useMemo(
    () => filteredProposals.filter((p) => inDateRange(p.createdAt) && p.status === "approval_pending").length,
    [filteredProposals, dateFrom, dateTo],
  );

  const overdueInvoices = kpis.overduePayments;

  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringSubscriptions = useMemo(() => {
    const tracker = subscriptionTrackerQuery.data;
    if (!tracker) return 0;
    // Filter subscription rows by the same Region/Owner/Team filters where possible.
    // The tracker rows include regionId but not teamId/ownerId, so we apply the reliable ones.
    const rows = tracker.rows ?? [];
    const regionFiltered = regionFilter !== "all" ? rows.filter((r) => r.customerRegionId === regionFilter) : rows;
    // Date range: expiryDate within [from, to]
    const dateFiltered = regionFiltered.filter((r) => {
      const d = String(r.expiryDate ?? "").slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    return dateFiltered.filter((r) => r.bucket === "expiring_30").length;
  }, [subscriptionTrackerQuery.data, regionFilter, dateFrom, dateTo]);

  const openSupportTickets = useMemo(() => {
    return filteredCustomers.reduce(
      (sum, c) =>
        sum +
        (c.supportTickets?.filter((t) => t.status === 'open' || t.status === 'in_progress').length ?? 0),
      0
    );
  }, [filteredCustomers]);

  // KPI Row 1 — Top 4 cards (large)
  const kpiRow1 = [
    { label: 'Revenue', value: formatINR(totalRevenue), sub: dateFrom ? 'In period' : 'Confirmed payments', icon: DollarSign, color: 'text-success', iconBg: 'bg-success/15', path: '/payments' as const, extra: {} },
    { label: 'Active proposals', value: String(activeProposalsCount), sub: dateFrom ? 'Created in period' : 'Open pipeline', icon: TrendingUp, color: 'text-primary', iconBg: 'bg-primary/10', path: '/proposals' as const, extra: {} },
    { label: 'Deals closed', value: String(dealsClosedCount), sub: dateFrom ? 'Won in period' : 'All time', icon: CheckCircle, color: 'text-success', iconBg: 'bg-success/15', path: '/deals' as const, extra: {} },
    { label: 'New customers', value: String(newCustomersCount), sub: dateFrom ? 'Added in period' : 'All time', icon: Users, color: 'text-info', iconBg: 'bg-info/15', path: '/customers' as const, extra: {} },
  ];

  const kpiRow2 = [
    { label: 'Pending approvals', value: String(pendingApprovals), sub: 'Proposals', icon: Clock, color: 'text-warning-foreground', iconBg: 'bg-warning/15', badge: 'amber' as const, path: '/proposals' as const, extra: { status: 'approval_pending' } },
    { label: 'Overdue invoices', value: String(overdueInvoices), sub: 'Unpaid', icon: AlertCircle, color: 'text-destructive', iconBg: 'bg-destructive/15', badge: 'red' as const, path: '/payments' as const, extra: {} },
    { label: 'Expiring in 30d', value: String(expiringSubscriptions), sub: 'Subscriptions', icon: CalendarClock, color: 'text-warning-foreground', iconBg: 'bg-warning/15', badge: 'orange' as const, path: '/customers' as const, extra: {} },
    { label: 'Open tickets', value: String(openSupportTickets), sub: 'Support', icon: Ticket, color: 'text-muted-foreground', iconBg: 'bg-muted', path: '/customers' as const, extra: {} },
  ];

  // Monthly Revenue — last 6 months from API payment history (confirmed), Y in lakhs
  const monthlyRevenueData = useMemo(() => {
    const months: { month: string; revenue: number; full: string; year: number; monthNum: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: d.toLocaleString('en-IN', { month: 'short' }),
        full: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
        revenue: 0,
        year: d.getFullYear(),
        monthNum: d.getMonth(),
      });
    }
    const ids = new Set(filteredCustomers.map((c) => c.id));
    for (const r of paymentHistory) {
      if (!ids.has(r.customerId)) continue;
      if (r.paymentStatus && r.paymentStatus !== "confirmed") continue;
      const paid = new Date(r.paymentDate);
      const m = months.find((x) => x.year === paid.getFullYear() && x.monthNum === paid.getMonth());
      if (m) m.revenue += Number(r.amountPaid ?? 0);
    }
    return months.map((m) => ({
      month: m.month,
      full: m.full,
      year: m.year,
      monthNum: m.monthNum,
      revenueLakhs: Math.round((m.revenue / 100_000) * 100) / 100,
    }));
  }, [filteredCustomers, paymentHistory, now]);

  // Proposals by status — count per status, horizontal bar
  const pipelineStatuses: ProposalStatus[] = [
    'draft',
    'sent',
    'approval_pending',
    'approved',
    'negotiation',
    'won',
    'cold',
    'rejected',
  ];
  const pipelineData = useMemo(
    () =>
      pipelineStatuses.map((status) => ({
        status: proposalStatusLabel(status),
        count: filteredProposals.filter((p) => inDateRange(p.createdAt) && normalizeProposalStatus(p.status) === status).length,
        statusKey: status,
      })),
    [filteredProposals, dateFrom, dateTo]
  );

  const pipelineColors: Record<string, string> = {
    draft: 'hsl(var(--muted-foreground))',
    sent: CHART_PRIMARY,
    approval_pending: CHART_WARNING,
    approved: CHART_SUCCESS,
    negotiation: CHART_DEEP,
    won: CHART_SUCCESS,
    cold: 'hsl(var(--muted-foreground))',
    rejected: CHART_DANGER,
  };

  // Customer Status Donut
  const customerStatusData = useMemo(() => {
    const statuses = ['active', 'lead', 'inactive', 'churned', 'blacklisted'] as const;
    return statuses.map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: filteredCustomers.filter((c) => inDateRange(c.createdAt) && c.status === status).length,
    }));
  }, [filteredCustomers, dateFrom, dateTo]);

  const donutColors = [CHART_SUCCESS, CHART_PRIMARY, 'hsl(var(--muted-foreground))', CHART_WARNING, CHART_DANGER];
  const customerStatusSlices = customerStatusData.filter((d) => d.value > 0);
  const pipelineChartData = pipelineData.filter((d) => d.count > 0);

  // Recent Activity — from notifications API (live, cross-module)
  const recentActivity = useMemo(() => {
    const rows = notificationsQuery.data ?? [];
    const items = rows
      .map((n) => ({
        id: n.id,
        text: n.subject,
        timestamp: n.at,
        action: n.type,
      }))
      .filter((x) => !!x.timestamp);
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    // Date range filter at minimum (per requirement)
    const inRange = (ts: string) => {
      const d = ts.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    };
    return items.filter((x) => inRange(x.timestamp)).slice(0, 10);
  }, [notificationsQuery.data, dateFrom, dateTo]);

  // Recent Proposals — last 5 by updatedAt desc
  const recentProposals = useMemo(
    () => [...filteredProposals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [filteredProposals]
  );

  const isAdminView = me.role === "super_admin" || me.role === "sales_manager";
  const teamPerformance = useMemo(() => {
    if (!isAdminView) return [];
    const reps = users.filter((u) => u.role === "sales_rep");
    const dealsWon = filteredDeals.filter((d) => resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus) === "Closed/Won");
    return reps
      .map((u) => {
        const proposalCount = filteredProposals.filter((p) => p.assignedTo === u.id).length;
        const approvalPending = filteredProposals.filter((p) => p.assignedTo === u.id && p.status === "approval_pending").length;
        const approved = filteredProposals.filter((p) => p.assignedTo === u.id && (p.status === "approved" || isProposalWon(p.status))).length;
        const negotiation = filteredProposals.filter((p) => p.assignedTo === u.id && p.status === "negotiation").length;
        const cold = filteredProposals.filter((p) => p.assignedTo === u.id && p.status === "cold").length;
        const dealsWonCount = dealsWon.filter((d) => d.ownerUserId === u.id).length;
        const dealsWonValue = dealsWon
          .filter((d) => d.ownerUserId === u.id)
          .reduce((s, d) => s + Number(d.value ?? 0), 0);
        return {
          userId: u.id,
          name: u.name,
          proposalCount,
          approvalPending,
          approved,
          negotiation,
          cold,
          dealsWonCount,
          dealsWonValue,
        };
      })
      .sort((a, b) => b.dealsWonValue - a.dealsWonValue);
  }, [isAdminView, users, filteredProposals, filteredDeals]);

  const leastPerforming = useMemo(() => {
    if (!teamPerformance.length) return null;
    // Least performing by won value; tie-breaker by won count.
    const sorted = [...teamPerformance].sort((a, b) => a.dealsWonValue - b.dealsWonValue || a.dealsWonCount - b.dealsWonCount);
    return sorted[0] ?? null;
  }, [teamPerformance]);

  const applyQuery = (path: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams();
    if (dateFrom && dateTo) {
      qs.set('from', dateFrom);
      qs.set('to', dateTo);
    } else {
      qs.set('range', 'all');
    }
    qs.set('owner', ownerFilter);
    qs.set('team', teamFilter);
    qs.set('region', regionFilter);
    Object.entries(extra).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });
    return `${path}?${qs.toString()}`;
  };

  const openRecords = (
    title: string,
    cols: Array<{ id: string; header: string; align?: 'right' }>,
    records: Array<{ key: string; cells: Record<string, string> }>,
    link: string,
  ) => {
    setDetailTitle(title);
    setDetailCols(cols);
    setDetailTotal(records.length);
    setDetailRows(records.slice(0, 40));
    setDetailLink(link);
    setDetailOpen(true);
  };

  const customerNameById = useMemo(() => {
    const m = new Map<string, string>();
    filteredCustomers.forEach((c) => m.set(c.id, c.companyName || c.customerNumber || c.id));
    scopedCustomers.forEach((c) => {
      if (!m.has(c.id)) m.set(c.id, c.companyName || c.customerNumber || c.id);
    });
    return m;
  }, [filteredCustomers, scopedCustomers]);

  const previewProposalCols = [
    { id: 'name', header: 'Proposal' },
    { id: 'customer', header: 'Customer' },
    { id: 'status', header: 'Status' },
    { id: 'value', header: 'Value', align: 'right' as const },
  ];
  const proposalPreviewRows = (list: typeof filteredProposals) =>
    list.map((p) => ({
      key: p.id,
      cells: {
        name: p.proposalNumber || p.title || p.id,
        customer: p.customerName || '—',
        status: proposalStatusLabel(p.status),
        value: formatINR(p.finalQuoteValue ?? p.grandTotal ?? 0),
      },
    }));

  const handlePipelineBarClick = (statusKey: string) => {
    const list = filteredProposals.filter((p) => inDateRange(p.createdAt) && p.status === statusKey);
    openRecords(
      `Proposals — ${statusKey.replace(/_/g, ' ')}`,
      previewProposalCols,
      proposalPreviewRows(list),
      applyQuery('/proposals', { status: statusKey }),
    );
  };

  const openCustomerStatusPreview = (statusName: string) => {
    const status = statusName.toLowerCase();
    const list = filteredCustomers.filter((c) => c.status === status && inDateRange(c.createdAt));
    openRecords(
      `Customers — ${statusName}`,
      [
        { id: 'name', header: 'Customer' },
        { id: 'status', header: 'Status' },
        { id: 'value', header: 'Added' },
      ],
      list.map((c) => ({
        key: c.id,
        cells: {
          name: c.companyName || c.customerNumber || c.id,
          status: c.status,
          value: String(c.createdAt ?? '').slice(0, 10),
        },
      })),
      applyQuery('/customers', { status }),
    );
  };

  const openRevenueMonth = (data: { full?: string; year?: number; monthNum?: number }) => {
    if (data.year == null || data.monthNum == null) return;
    const from = `${data.year}-${String(data.monthNum + 1).padStart(2, '0')}-01`;
    const last = new Date(data.year, data.monthNum + 1, 0).getDate();
    const to = `${data.year}-${String(data.monthNum + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const ids = new Set(filteredCustomers.map((c) => c.id));
    const rows = paymentHistory
      .filter((r) => ids.has(r.customerId) && (!r.paymentStatus || r.paymentStatus === 'confirmed'))
      .filter((r) => {
        const d = String(r.paymentDate ?? '').slice(0, 10);
        return d >= from && d <= to;
      })
      .map((r, i) => ({
        key: `${r.customerId}-${r.paymentDate}-${i}`,
        cells: {
          name: customerNameById.get(r.customerId) ?? r.customerId,
          status: String(r.paymentDate ?? '').slice(0, 10),
          value: formatINR(Number(r.amountPaid ?? 0)),
        },
      }));
    openRecords(
      `Revenue — ${data.full ?? `${from}–${to}`}`,
      [
        { id: 'name', header: 'Customer' },
        { id: 'status', header: 'Paid' },
        { id: 'value', header: 'Amount', align: 'right' },
      ],
      rows,
      applyQuery('/payments', { tab: 'history', from, to }),
    );
  };

  const openKpiPreview = (kind: string) => {
    switch (kind) {
      case 'Revenue': {
        const ids = new Set(filteredCustomers.map((c) => c.id));
        const rows = paymentHistory
          .filter((r) => ids.has(r.customerId) && (!r.paymentStatus || r.paymentStatus === 'confirmed'))
          .filter((r) => inDateRange(r.paymentDate))
          .map((r, i) => ({
            key: `${r.customerId}-${r.paymentDate}-${i}`,
            cells: {
              name: customerNameById.get(r.customerId) ?? r.customerId,
              status: String(r.paymentDate ?? '').slice(0, 10),
              value: formatINR(Number(r.amountPaid ?? 0)),
            },
          }));
        openRecords(
          'Revenue',
          [
            { id: 'name', header: 'Customer' },
            { id: 'status', header: 'Paid' },
            { id: 'value', header: 'Amount', align: 'right' },
          ],
          rows,
          applyQuery('/payments', { tab: 'history' }),
        );
        return;
      }
      case 'Active proposals': {
        const list = filteredProposals.filter(
          (p) =>
            inDateRange(p.createdAt) &&
            ['sent', 'approval_pending', 'approved', 'negotiation', 'won'].includes(p.status),
        );
        openRecords('Active proposals', previewProposalCols, proposalPreviewRows(list), applyQuery('/proposals', {}));
        return;
      }
      case 'Deals closed': {
        const list = filteredDeals.filter((d) => {
          if (resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus) !== 'Closed/Won') return false;
          return inDateRange(getDealDateForFilter(d) ?? '');
        });
        openRecords(
          'Deals closed',
          [
            { id: 'name', header: 'Deal' },
            { id: 'customer', header: 'Customer' },
            { id: 'value', header: 'Value', align: 'right' },
          ],
          list.map((d) => ({
            key: d.id,
            cells: {
              name: d.name || d.id,
              customer: customerNameById.get(d.customerId) ?? d.customerId,
              value: formatINR(Number(d.value ?? 0)),
            },
          })),
          applyQuery('/deals', { status: 'Closed/Won' }),
        );
        return;
      }
      case 'New customers': {
        const list = filteredCustomers.filter((c) => inDateRange(c.createdAt));
        openRecords(
          'New customers',
          [
            { id: 'name', header: 'Customer' },
            { id: 'status', header: 'Status' },
            { id: 'value', header: 'Added' },
          ],
          list.map((c) => ({
            key: c.id,
            cells: {
              name: c.companyName || c.customerNumber || c.id,
              status: c.status,
              value: String(c.createdAt ?? '').slice(0, 10),
            },
          })),
          applyQuery('/customers', {}),
        );
        return;
      }
      case 'Pending approvals': {
        const list = filteredProposals.filter((p) => inDateRange(p.createdAt) && p.status === 'approval_pending');
        openRecords(
          'Pending approvals',
          previewProposalCols,
          proposalPreviewRows(list),
          applyQuery('/proposals', { status: 'approval_pending' }),
        );
        return;
      }
      case 'Overdue invoices': {
        const rows = (paymentsRemaining ?? [])
          .filter((p) => p.category === 'overdue')
          .map((p, i) => ({
            key: `${p.customerId}-${i}`,
            cells: {
              name: customerNameById.get(p.customerId) ?? p.customerId,
              status: 'Overdue',
              value: formatINR(Number(p.totalRemaining ?? 0)),
            },
          }));
        openRecords(
          'Overdue invoices',
          [
            { id: 'name', header: 'Customer' },
            { id: 'status', header: 'Status' },
            { id: 'value', header: 'Remaining', align: 'right' },
          ],
          rows,
          applyQuery('/payments', { tab: 'overdue' }),
        );
        return;
      }
      case 'Expiring in 30d': {
        const tracker = subscriptionTrackerQuery.data;
        const rows = (tracker?.rows ?? [])
          .filter((r) => (regionFilter === 'all' || r.customerRegionId === regionFilter) && r.bucket === 'expiring_30')
          .filter((r) => {
            const d = String(r.expiryDate ?? '').slice(0, 10);
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
          })
          .map((r, i) => ({
            key: `${r.customerId ?? i}`,
            cells: {
              name: r.customerName || '—',
              status: r.planName || '—',
              value: String(r.expiryDate ?? '').slice(0, 10),
            },
          }));
        openRecords(
          'Expiring in 30 days',
          [
            { id: 'name', header: 'Customer' },
            { id: 'status', header: 'Plan' },
            { id: 'value', header: 'Expiry' },
          ],
          rows,
          applyQuery('/customers', { tab: 'renewals' }),
        );
        return;
      }
      case 'Open tickets': {
        const rows = filteredCustomers.flatMap((c) =>
          (c.supportTickets ?? [])
            .filter((t) => t.status === 'open' || t.status === 'in_progress')
            .map((t) => ({
              key: t.id,
              cells: {
                name: c.companyName || c.customerNumber || c.id,
                status: t.status.replace(/_/g, ' '),
                value: t.subject || t.id,
              },
            })),
        );
        openRecords(
          'Open tickets',
          [
            { id: 'name', header: 'Customer' },
            { id: 'status', header: 'Status' },
            { id: 'value', header: 'Ticket' },
          ],
          rows,
          applyQuery('/customers', {}),
        );
        return;
      }
      default:
        return;
    }
  };

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle={smUp ? "Pipeline, licenses, and revenue." : undefined}
        actions={
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", live.connected ? "bg-success" : "bg-muted-foreground/40")} />
              <span className="text-[11px] text-muted-foreground">{live.connected ? "Live" : "Off"}</span>
              {live.lastUpdatedAt && (
                <span className="hidden text-[11px] text-muted-foreground md:inline">
                  {formatDistanceToNow(new Date(live.lastUpdatedAt), { addSuffix: true })}
                </span>
              )}
            </div>
            <label className="flex items-center gap-1.5">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">Guidance</span>
              <Switch
                checked={guidanceMode}
                onCheckedChange={(v) => {
                  setGuidanceMode(v);
                  try {
                    localStorage.setItem(guidanceKey, v ? '1' : '0');
                  } catch {
                    /* ignore */
                  }
                }}
                aria-label="Guidance mode"
              />
            </label>
          </div>
        }
      />
      <div className="space-y-2.5">
        <FilterPanel
          title="Filters"
          storageKey="ui:dashboard:filtersOpen"
          defaultOpen={smUp}
          headerActions={
            hasActiveAppliedFilters ? (
              <div className="scrollbar-none flex min-w-0 flex-wrap items-center justify-end gap-1 overflow-x-auto">
                {timeRangeChip(timeRangeFilter, dateFrom, dateTo) ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {timeRangeChip(timeRangeFilter, dateFrom, dateTo)}
                  </span>
                ) : null}
                {ownerFilter !== 'all' ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {users.find((u) => u.id === ownerFilter)?.name ?? 'Owner'}
                  </span>
                ) : null}
                {teamFilter !== 'all' ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {teams.find((t) => t.id === teamFilter)?.name ?? 'Team'}
                  </span>
                ) : null}
                {regionFilter !== 'all' ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {regions.find((r) => r.id === regionFilter)?.name ?? 'Region'}
                  </span>
                ) : null}
                {proposalStatusFilter !== 'all' ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {proposalStatusLabel(proposalStatusFilter)}
                  </span>
                ) : null}
              </div>
            ) : null
          }
        >
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
              <div className="min-w-0 space-y-1 sm:col-span-2 xl:col-span-1">
                <p className="text-xs text-muted-foreground">Date range</p>
                <div className="grid min-w-0 grid-cols-1 gap-2">
                  <TimeRangeFilter
                    preset={draftTimeRangeFilter}
                    customFrom={draftCustomFrom}
                    customTo={draftCustomTo}
                    onPresetChange={setDraftTimeRangeFilter}
                    onCustomChange={(from, to) => {
                      setDraftCustomFrom(from);
                      setDraftCustomTo(to);
                    }}
                    customPlaceholder="Select dates…"
                  />
                </div>
              </div>

              <Select value={draftOwnerFilter} onValueChange={setDraftOwnerFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={draftTeamFilter} onValueChange={setDraftTeamFilter}>
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

              <Select value={draftRegionFilter} onValueChange={setDraftRegionFilter}>
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
                value={draftProposalStatusFilter}
                onValueChange={(v) => setDraftProposalStatusFilter(v as ProposalStatus | 'all')}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All proposal statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {pipelineStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {proposalStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                disabled={!hasActiveAppliedFilters && !hasPendingFilterChanges}
                onClick={clearFilters}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                type="button"
                disabled={!hasPendingFilterChanges}
                onClick={applyFilters}
              >
                Apply
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                type="button"
                disabled={dashboardLoading || proposalsQuery.isFetching || dealsQuery.isFetching || customersQuery.isFetching}
                onClick={() => {
                  refetchAll();
                  toast({ title: "Data refreshed" });
                }}
                title="Refresh data"
              >
                {dashboardLoading || proposalsQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </FilterPanel>
        {dashboardLoading && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Syncing metrics
          </p>
        )}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4"
        >
          {kpiRow1.map((s) => (
            <DashboardKpiCard
              key={s.label}
              label={s.label}
              value={s.value}
              sub={s.sub}
              icon={s.icon}
              iconColor={s.color}
              iconBg={s.iconBg}
              onClick={() => openKpiPreview(s.label)}
            />
          ))}
        </motion.div>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4"
        >
          {kpiRow2.map((s) => (
            <DashboardKpiCard
              key={s.label}
              label={s.label}
              value={s.value}
              sub={s.sub}
              icon={s.icon}
              iconColor={s.color}
              iconBg={s.iconBg}
              badge={s.badge}
              onClick={() => openKpiPreview(s.label)}
            />
          ))}
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          <motion.div variants={staggerItem} className="card-soft flex min-w-0 flex-col p-2.5">
            <p className="typo-section-title">Customer mix</p>
            <div className="relative mx-auto mt-1 h-[8.5rem] w-[8.5rem] sm:h-[7.25rem] sm:w-[7.25rem]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerStatusSlices.length ? customerStatusSlices : customerStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={smUp ? 34 : 40}
                    outerRadius={smUp ? 50 : 58}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    cursor="pointer"
                    onClick={(slice) => {
                      if (!slice?.name) return;
                      openCustomerStatusPreview(String(slice.name));
                    }}
                  >
                    {(customerStatusSlices.length ? customerStatusSlices : customerStatusData).map((entry) => {
                      const idx = customerStatusData.findIndex((d) => d.name === entry.name);
                      return <Cell key={entry.name} fill={donutColors[idx % donutColors.length]} />;
                    })}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-semibold tabular-nums leading-none">
                  <CountUp value={filteredCustomers.length} />
                </span>
                <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Total</span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap justify-center gap-1">
              {customerStatusData.map((d, i) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => openCustomerStatusPreview(d.name)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: donutColors[i] }} />
                  {d.name}
                  <span className="tabular-nums text-foreground">{d.value}</span>
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="card-soft flex min-w-0 flex-col p-2.5">
            <p className="typo-section-title">Revenue</p>
            <div className="mt-1 h-40 min-w-0 flex-1 sm:h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenueData} margin={{ top: 4, right: 2, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `₹${v}L`} />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.45)' }}
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number) => [formatINR((value as number) * 100_000), 'Revenue']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                  />
                  <Bar
                    dataKey="revenueLakhs"
                    fill={CHART_PRIMARY}
                    name="Revenue"
                    barSize={revenueBarSize}
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(data: { full: string; year: number; monthNum: number }) => data && openRevenueMonth(data)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="card-soft flex min-w-0 flex-col p-2.5">
            <p className="typo-section-title">Pipeline</p>
            <div className="mt-1 h-40 min-w-0 flex-1 sm:h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={pipelineChartData.length ? pipelineChartData : pipelineData}
                  margin={{ top: 0, right: 8, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={smUp ? 72 : 58}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ fill: 'hsl(var(--muted) / 0.45)' }} contentStyle={chartTooltipStyle} />
                  <Bar
                    dataKey="count"
                    name="Count"
                    barSize={10}
                    radius={[0, 3, 3, 0]}
                    cursor="pointer"
                    onClick={(data: { statusKey: string }) => data?.statusKey && handlePipelineBarClick(data.statusKey)}
                  >
                    {(pipelineChartData.length ? pipelineChartData : pipelineData).map((entry) => (
                      <Cell key={entry.statusKey} fill={pipelineColors[entry.statusKey] ?? CHART_PRIMARY} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="card-soft flex min-h-[12rem] min-w-0 flex-col p-0 sm:min-h-[13.5rem]">
            <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
              <p className="typo-section-title">Activity</p>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate('/customers')}>
                All
              </Button>
            </div>
            <div className="max-h-56 flex-1 space-y-1.5 overflow-y-auto p-2 sm:max-h-none">
              {recentActivity.length === 0 ? (
                <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">No activity in range</p>
              ) : (
                recentActivity.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-xs text-foreground">{a.text}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>

        <motion.div variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
            <p className="typo-section-title">Recent proposals</p>
            {guidanceMode ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate('/proposals')}>
                    View all
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create proposals, update status, and send follow-ups.</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate('/proposals')}>
                View all
              </Button>
            )}
          </div>
          {recentProposals.length > 0 ? (
            mdUp ? (
              <div className="scrollbar-soft overflow-x-auto">
                <Table responsiveShell={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proposal</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentProposals.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <button
                            type="button"
                            className="font-medium text-primary hover:underline"
                            onClick={() => navigate('/proposals', { state: { detailId: p.id } })}
                          >
                            {p.proposalNumber}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-muted-foreground">{p.customerName}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(p.finalQuoteValue ?? p.grandTotal)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {p.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {new Date(p.updatedAt).toLocaleDateString('en-IN')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentProposals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-2.5 py-2.5 text-left hover:bg-muted/30"
                    onClick={() => navigate('/proposals', { state: { detailId: p.id } })}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-primary">{p.proposalNumber}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.customerName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold tabular-nums">{formatINR(p.finalQuoteValue ?? p.grandTotal)}</p>
                      <Badge variant="outline" className="mt-0.5 text-[10px]">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">No proposals in scope</p>
          )}
        </motion.div>

        {isAdminView && (
          <motion.div variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
              <div>
                <p className="typo-section-title">Team performance</p>
                <p className="text-[11px] text-muted-foreground">
                  Least:{" "}
                  <span className="font-medium text-foreground">
                    {leastPerforming
                      ? `${leastPerforming.name} (${formatINR(leastPerforming.dealsWonValue)})`
                      : "—"}
                  </span>
                </p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate("/deals")}>
                Deals
              </Button>
            </div>
            {teamPerformance.length ? (
              <div className="scrollbar-soft overflow-x-auto">
                <Table responsiveShell={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Executive</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Proposals</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Pending</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Approved</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Negotiation</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Cold</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamPerformance.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell className="max-w-[10rem] sm:max-w-none">
                          <span className="block truncate">{r.name}</span>
                          <div className="text-[10px] text-muted-foreground sm:hidden">
                            {r.proposalCount} proposals · {r.dealsWonCount} won
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.proposalCount}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{r.approvalPending}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{r.approved}</TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{r.negotiation}</TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{r.cold}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatINR(r.dealsWonValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">No sales reps in scope</p>
            )}
          </motion.div>
        )}
      </div>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={dialogSmMax2xl}>
          <DialogHeader>
            <DialogTitle>{detailTitle}</DialogTitle>
            <DialogDescription>
              {detailTotal === 0
                ? 'No records match the current dashboard filters.'
                : `${detailTotal} record${detailTotal === 1 ? '' : 's'} matching current filters${detailTotal > detailRows.length ? ` · showing first ${detailRows.length}` : ''}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {detailRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records found for this selection.</p>
            ) : (
              <div className="scrollbar-soft -mx-4 overflow-x-auto sm:mx-0">
                <Table responsiveShell={false}>
                  <TableHeader>
                    <TableRow>
                      {detailCols.map((col) => (
                        <TableHead key={col.id} className={col.align === 'right' ? 'text-right' : undefined}>
                          {col.header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((r) => (
                      <TableRow key={r.key}>
                        {detailCols.map((col) => (
                          <TableCell
                            key={col.id}
                            className={cn(
                              col.align === 'right' ? 'text-right tabular-nums' : 'max-w-[14rem] truncate',
                            )}
                          >
                            {r.cells[col.id] ?? '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => {
                setDetailOpen(false);
                if (detailLink) navigate(detailLink);
              }}
            >
              Open full page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
