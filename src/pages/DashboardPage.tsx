import { useEffect, useMemo, useState, type ElementType } from 'react';
import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { formatINR } from '@/lib/rbac';
import { runAutomationRules } from '@/lib/automationService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  FileText,
  AlertCircle,
  CalendarClock,
  Ticket,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import type { ProposalStatus } from '@/types';
import { normalizeDealStatus } from '@/lib/dealStatus';
import { cn } from '@/lib/utils';
import { useSmUp } from '@/hooks/useSmUp';

const BUILDESK_BLUE = '#0072BC';

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
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10',
            iconBg,
          )}
        >
          <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', iconColor)} />
        </div>
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-[10px]',
              badge === 'amber' && 'border-amber-500/50 text-amber-700',
              badge === 'red' && 'border-red-500/50 text-red-700',
              badge === 'orange' && 'border-orange-500/50 text-orange-700',
            )}
          >
            {value}
          </Badge>
        )}
      </div>
      <div className="mt-3 sm:mt-4">
        <p className="truncate text-xl font-bold leading-none tracking-tight text-foreground sm:text-2xl">{value}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{label}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <Card
        className="cursor-pointer border border-border bg-card transition-colors hover:bg-muted/30"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <CardContent className="p-4 sm:p-5">{inner}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-none">
      <CardContent className="p-4 sm:p-5">{inner}</CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const me = useAppStore((s) => s.me);
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
    isLoading: dashboardLoading,
    refetchAll,
    proposalsQuery,
    dealsQuery,
    customersQuery,
  } = useDashboardData();
  const navigate = useNavigate();
  const smUp = useSmUp();
  const revenueBarSize = smUp ? 32 : 20;
  const axisTickX = smUp ? 12 : 10;
  const yAxisWidth = smUp ? 56 : 40;
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [proposalStatusFilter, setProposalStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailRows, setDetailRows] = useState<Array<{ key: string; label: string; value: string }>>([]);
  const [detailLink, setDetailLink] = useState('');

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
      if (proposalStatusFilter !== 'all' && p.status !== proposalStatusFilter) return false;
      if (!inDateRange(p.createdAt)) return false;
      if (ownerFilter !== 'all' && p.assignedTo !== ownerFilter) return false;
      const meta = ownerMeta.get(p.assignedTo);
      if (teamFilter !== 'all' && meta?.teamId !== teamFilter) return false;
      if (regionFilter !== 'all' && meta?.regionId !== regionFilter) return false;
      return true;
    });
  }, [scopedProposals, proposalStatusFilter, dateFrom, dateTo, ownerFilter, teamFilter, regionFilter, ownerMeta]);

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
      if (!inDateRange(c.createdAt)) return false;
      if (ownerFilter !== 'all' && c.assignedTo && c.assignedTo !== ownerFilter) return false;
      if (teamFilter !== 'all' && c.teamId && c.teamId !== teamFilter) return false;
      if (regionFilter !== 'all' && c.regionId !== regionFilter) return false;
      return true;
    });
  }, [scopedCustomers, dateFrom, dateTo, ownerFilter, teamFilter, regionFilter]);

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
      .reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
  }, [filteredCustomers, paymentHistory]);

  const activeProposalsCount = useMemo(
    () =>
      filteredProposals.filter(
        (p) => p.status === "sent" || p.status === "approval_pending" || p.status === "approved" || p.status === "negotiation" || p.status === "won",
      ).length,
    [filteredProposals],
  );

  const dealsClosedThisMonth = useMemo(() => {
    const m = now.getMonth();
    const y = now.getFullYear();
    return filteredDeals.filter((d) => {
      if (normalizeDealStatus(d.dealStatus) !== "Closed/Won") return false;
      const ts = d.updatedAt ?? d.lastActivityAt ?? "";
      if (!ts) return false;
      const dt = new Date(ts);
      return dt.getMonth() === m && dt.getFullYear() === y;
    }).length;
  }, [filteredDeals, now]);

  const newCustomersThisMonth = useMemo(() => {
    return filteredCustomers.filter((c) => {
      const d = new Date(c.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [filteredCustomers, now]);

  const pendingApprovals = useMemo(
    () => filteredProposals.filter((p) => p.status === "approval_pending").length,
    [filteredProposals],
  );

  const overdueInvoices = kpis.overduePayments;

  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringSubscriptions = useMemo(() => {
    return filteredCustomers.reduce((sum, c) => {
      return (
        sum +
        (c.productLines?.filter((pl) => {
          const exp = pl.expiryDate ? new Date(pl.expiryDate) : null;
          return exp && exp >= now && exp <= thirtyDaysFromNow;
        }).length ?? 0)
      );
    }, 0);
  }, [filteredCustomers, now, thirtyDaysFromNow]);

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
    { label: 'Total Revenue', value: formatINR(totalRevenue), sub: 'From paid payments', icon: DollarSign, color: 'text-green-600' },
    { label: 'Active Proposals', value: String(activeProposalsCount), sub: 'Sent / Pending / Approved / Negotiation / Won', icon: TrendingUp, color: 'text-primary' },
    { label: 'Deals Closed (This Month)', value: String(dealsClosedThisMonth), sub: 'Won this month', icon: CheckCircle, color: 'text-success' },
    { label: 'New Customers (This Month)', value: String(newCustomersThisMonth), sub: 'Added this month', icon: Users, color: 'text-primary' },
  ];

  // KPI Row 2 — Secondary 4 cards
  const kpiRow2 = [
    { label: 'Pending Approvals', value: String(pendingApprovals), sub: 'Proposals', icon: Clock, color: 'text-amber-600', badge: 'amber' as const },
    { label: 'Overdue Invoices', value: String(overdueInvoices), sub: 'Unpaid', icon: AlertCircle, color: 'text-red-600', badge: 'red' as const },
    { label: 'Expiring Subscriptions (30 days)', value: String(expiringSubscriptions), sub: 'Product lines', icon: CalendarClock, color: 'text-orange-600', badge: 'orange' as const },
    { label: 'Open Support Tickets', value: String(openSupportTickets), sub: 'Open + In progress', icon: Ticket, color: 'text-muted-foreground' },
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
    return months.map((m) => ({ month: m.month, full: m.full, revenueLakhs: Math.round((m.revenue / 100_000) * 100) / 100 }));
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
    'deal_created',
  ];
  const pipelineData = useMemo(
    () =>
      pipelineStatuses.map((status) => ({
        status: status.replace(/_/g, ' '),
        count: filteredProposals.filter((p) => p.status === status).length,
        statusKey: status,
      })),
    [filteredProposals]
  );

  const pipelineColors: Record<string, string> = {
    draft: 'hsl(var(--muted-foreground))',
    sent: '#0072BC',
    'approval_pending': '#f59e0b',
    approved: '#22c55e',
    negotiation: '#6366f1',
    won: '#10b981',
    cold: '#64748b',
    rejected: '#ef4444',
    deal_created: '#a855f7',
  };

  // Customer Status Donut
  const customerStatusData = useMemo(() => {
    const statuses = ['active', 'lead', 'inactive', 'churned', 'blacklisted'] as const;
    return statuses.map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: filteredCustomers.filter((c) => c.status === status).length,
    }));
  }, [filteredCustomers]);

  const donutColors = ['#22c55e', '#0072BC', '#94a3b8', '#f97316', '#ef4444'];

  // Recent Activity — requires rich customer records; API-only customers have no activityLog
  const recentActivity = useMemo(() => {
    const all: { id: string; text: string; timestamp: string; action: string }[] = [];
    for (const c of filteredCustomers) {
      for (const log of c.activityLog ?? []) {
        all.push({
          id: log.id,
          text: log.description || log.action,
          timestamp: log.timestamp,
          action: log.action,
        });
      }
    }
    all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return all.slice(0, 10);
  }, [filteredCustomers]);

  // Recent Proposals — last 5 by updatedAt desc
  const recentProposals = useMemo(
    () => [...filteredProposals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [filteredProposals]
  );

  const isAdminView = me.role === "super_admin" || me.role === "sales_manager";
  const teamPerformance = useMemo(() => {
    if (!isAdminView) return [];
    const reps = users.filter((u) => u.role === "sales_rep");
    const dealsWon = filteredDeals.filter((d) => normalizeDealStatus(d.dealStatus) === "Closed/Won");
    return reps
      .map((u) => {
        const proposalCount = filteredProposals.filter((p) => p.assignedTo === u.id).length;
        const approvalPending = filteredProposals.filter((p) => p.assignedTo === u.id && p.status === "approval_pending").length;
        const approved = filteredProposals.filter((p) => p.assignedTo === u.id && (p.status === "approved" || p.status === "won" || p.status === "deal_created")).length;
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

  const applyQuery = (path: string, extra: Record<string, string>) => {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('from', dateFrom);
    if (dateTo) qs.set('to', dateTo);
    if (ownerFilter !== 'all') qs.set('owner', ownerFilter);
    if (teamFilter !== 'all') qs.set('team', teamFilter);
    if (regionFilter !== 'all') qs.set('region', regionFilter);
    Object.entries(extra).forEach(([key, value]) => {
      if (value && value !== 'all') qs.set(key, value);
    });
    return `${path}?${qs.toString()}`;
  };

  const openDetail = (title: string, rows: Array<{ key: string; label: string; value: string }>, link: string) => {
    setDetailTitle(title);
    setDetailRows(rows);
    setDetailLink(link);
    setDetailOpen(true);
  };

  const handlePipelineBarClick = (statusKey: string, count: number) => {
    openDetail(
      `Proposals — ${statusKey.replace(/_/g, ' ')}`,
      [{ key: statusKey, label: 'Count', value: String(count) }],
      applyQuery('/proposals', { status: statusKey }),
    );
  };

  return (
    <>
      <Topbar
        title="Buildesk License Management"
        subtitle="Welcome back! Here's what's happening with your license management workflows."
      />
      <div className="space-y-4 sm:space-y-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3 lg:col-span-9">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">From</p>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 min-w-0 w-full sm:w-[150px]"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">To</p>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 min-w-0 w-full sm:w-[150px]"
                  />
                </div>

                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="h-9 min-w-0 w-full sm:w-[170px]">
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

                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="h-9 min-w-0 w-full sm:w-[160px]">
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

                <Select value={regionFilter} onValueChange={setRegionFilter}>
                  <SelectTrigger className="h-9 min-w-0 w-full sm:w-[160px]">
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

                <Select value={proposalStatusFilter} onValueChange={(v) => setProposalStatusFilter(v as ProposalStatus | 'all')}>
                  <SelectTrigger className="h-9 min-w-0 w-full sm:w-[190px]">
                    <SelectValue placeholder="All proposal statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All proposal statuses</SelectItem>
                    {pipelineStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:col-span-3 lg:flex lg:justify-end">
                <Button
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setOwnerFilter('all');
                    setTeamFilter('all');
                    setRegionFilter('all');
                    setProposalStatusFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
                <Button
                  variant="secondary"
                  className="h-9 gap-2"
                  type="button"
                  disabled={dashboardLoading || proposalsQuery.isFetching || dealsQuery.isFetching || customersQuery.isFetching}
                  onClick={() => refetchAll()}
                >
                  {dashboardLoading || proposalsQuery.isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh data
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {dashboardLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading live metrics from API…
          </p>
        )}
        {/* KPI Row 1 — 2 col mobile → 4 col desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          {kpiRow1.map((s) => (
            <DashboardKpiCard
              key={s.label}
              label={s.label}
              value={s.value}
              sub={s.sub}
              icon={s.icon}
              iconColor={s.color}
              iconBg="bg-muted"
              onClick={() =>
                openDetail(
                  s.label,
                  [{ key: s.label, label: 'Value', value: s.value }],
                  applyQuery('/deals', {}),
                )
              }
            />
          ))}
        </div>

        {/* KPI Row 2 — same */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          {kpiRow2.map((s) => (
            <DashboardKpiCard
              key={s.label}
              label={s.label}
              value={s.value}
              sub={s.sub}
              icon={s.icon}
              iconColor={s.color}
              iconBg="bg-muted"
              badge={s.badge}
            />
          ))}
        </div>

        {/* Charts row — stack → side by side (2/3 + 1/3 at xl) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          <div className="xl:col-span-2 space-y-4 lg:space-y-6">
            <Card className="border border-border bg-card shadow-none">
              <CardHeader className="px-4 pb-2 pt-4 sm:px-6 sm:pb-3 sm:pt-5">
                <CardTitle className="text-sm font-semibold sm:text-base">Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4 sm:px-4">
                <div className="h-48 sm:h-64 lg:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyRevenueData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: axisTickX }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={yAxisWidth}
                        tickFormatter={(v) => `₹${v}L`}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value: number) => [formatINR((value as number) * 100_000), 'Revenue']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                      />
                      <Bar
                        dataKey="revenueLakhs"
                        fill={BUILDESK_BLUE}
                        name="Revenue"
                        barSize={revenueBarSize}
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(data: { full: string; revenueLakhs: number }) =>
                          openDetail(
                            `Revenue - ${data?.full ?? ''}`,
                            [{ key: data?.full ?? 'month', label: 'Revenue', value: formatINR(Math.round((data?.revenueLakhs ?? 0) * 100_000)) }],
                            applyQuery('/deals', {}),
                          )
                        }
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-none">
              <CardHeader className="px-4 pb-2 pt-4 sm:px-6 sm:pb-3 sm:pt-5">
                <CardTitle className="text-sm font-semibold sm:text-base">Proposals by status</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4 sm:px-4">
                <div className="h-48 sm:h-64 lg:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={pipelineData}
                      margin={{ top: 4, right: 8, left: smUp ? 56 : 48, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: smUp ? 11 : 10 }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="status"
                        width={smUp ? 54 : 46}
                        tick={{ fontSize: smUp ? 11 : 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar
                        dataKey="count"
                        name="Count"
                        barSize={smUp ? 28 : 20}
                        radius={[0, 4, 4, 0]}
                        onClick={(data: { statusKey: string; count: number }) => data && handlePipelineBarClick(data.statusKey, data.count)}
                        cursor="pointer"
                      >
                        {pipelineData.map((entry) => (
                          <Cell
                            key={entry.statusKey}
                            fill={pipelineColors[entry.statusKey] ?? BUILDESK_BLUE}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="xl:col-span-1 flex h-full min-h-[280px] flex-col border border-border bg-card">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Recent Activity</h3>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/customers')}>
                  View All
                </Button>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                ) : (
                  recentActivity.map((a) => (
                    <div key={a.id} className="flex gap-2 items-start text-sm">
                      <span
                        className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-primary"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-foreground truncate">{a.text}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom row — Customer status + Recent proposals */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          <Card className="border border-border bg-card shadow-none xl:col-span-1">
            <CardHeader className="px-4 pb-2 pt-4 sm:px-6 sm:pb-3 sm:pt-5">
              <CardTitle className="text-sm font-semibold sm:text-base">Customer Status</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4 sm:px-4">
              <div className="relative h-44 sm:h-52 lg:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={customerStatusData}
                      cx="50%"
                      cy="45%"
                      innerRadius="45%"
                      outerRadius="65%"
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => (value > 0 ? `${name}: ${value}` : '')}
                      onClick={(slice) => {
                        if (!slice?.name) return;
                        const status = String(slice.name).toLowerCase();
                        openDetail(
                          `Customer Status - ${slice.name}`,
                          [{ key: status, label: 'Count', value: String(slice.value ?? 0) }],
                          applyQuery('/customers', { status }),
                        );
                      }}
                    >
                      {customerStatusData.map((_, index) => (
                        <Cell key={index} fill={donutColors[index % donutColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2">
                  <span className="text-xl font-bold text-foreground">{filteredCustomers.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="xl:col-span-2">
          <Card className="border border-border bg-card">
            <CardContent className="p-0">
              <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                <h3 className="font-semibold text-foreground">Recent Proposals</h3>
                <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate('/proposals')}>
                  View All
                </Button>
              </div>
              {recentProposals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                      <TableHead className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3">
                        Proposal #
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3">
                        Customer
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3">
                        Value
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3">
                        Status
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3 md:table-cell">
                        Date
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {recentProposals.map((p) => (
                      <TableRow key={p.id} className="transition-colors hover:bg-muted/50">
                        <TableCell className="px-3 py-3 text-sm font-medium sm:px-4 sm:py-3.5">
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => navigate('/proposals', { state: { detailId: p.id } })}
                          >
                            {p.proposalNumber}
                          </button>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-sm text-muted-foreground sm:px-4 sm:py-3.5">{p.customerName}</TableCell>
                        <TableCell className="px-3 py-3 text-right font-mono text-sm sm:px-4 sm:py-3.5">
                          {formatINR(p.finalQuoteValue ?? p.grandTotal)}
                        </TableCell>
                        <TableCell className="px-3 py-3 sm:px-4 sm:py-3.5">
                          <Badge variant="outline" className="text-[10px]">
                            {p.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden px-3 py-3 text-xs text-muted-foreground sm:px-4 sm:py-3.5 md:table-cell">
                          {new Date(p.updatedAt).toLocaleDateString('en-IN')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">No proposals in scope</div>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        {isAdminView && (
          <Card className="border border-border bg-card">
            <CardContent className="p-0">
              <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                <div>
                  <h3 className="font-semibold text-foreground">Team performance</h3>
                  <p className="text-xs text-muted-foreground">
                    Least performing:{" "}
                    <span className="font-medium text-foreground">
                      {leastPerforming ? `${leastPerforming.name} (₹${Math.round(leastPerforming.dealsWonValue).toLocaleString("en-IN")})` : "—"}
                    </span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/deals")}>
                  View deals
                </Button>
              </div>
              {teamPerformance.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3">
                        Executive
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell sm:px-4 sm:py-3">
                        Proposals
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell sm:px-4 sm:py-3">
                        Pending
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell sm:px-4 sm:py-3">
                        Approved
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell sm:px-4 sm:py-3">
                        Negotiation
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell sm:px-4 sm:py-3">
                        Cold
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-4 sm:py-3">
                        Won (₹)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {teamPerformance.map((r) => (
                      <TableRow key={r.userId} className="transition-colors hover:bg-muted/50">
                        <TableCell className="px-3 py-3 text-sm font-medium sm:px-4 sm:py-3.5">
                          {r.name}
                          <div className="text-xs text-muted-foreground md:hidden">
                            {r.proposalCount} proposals · {r.dealsWonCount} won
                          </div>
                        </TableCell>
                        <TableCell className="hidden px-3 py-3 text-right font-mono text-sm md:table-cell sm:px-4 sm:py-3.5">{r.proposalCount}</TableCell>
                        <TableCell className="hidden px-3 py-3 text-right font-mono text-sm md:table-cell sm:px-4 sm:py-3.5">{r.approvalPending}</TableCell>
                        <TableCell className="hidden px-3 py-3 text-right font-mono text-sm md:table-cell sm:px-4 sm:py-3.5">{r.approved}</TableCell>
                        <TableCell className="hidden px-3 py-3 text-right font-mono text-sm lg:table-cell sm:px-4 sm:py-3.5">{r.negotiation}</TableCell>
                        <TableCell className="hidden px-3 py-3 text-right font-mono text-sm lg:table-cell sm:px-4 sm:py-3.5">{r.cold}</TableCell>
                        <TableCell className="px-3 py-3 text-right font-mono text-sm sm:px-4 sm:py-3.5">{formatINR(r.dealsWonValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">No sales reps in scope</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailTitle}</DialogTitle>
            <DialogDescription>Filtered analytics preview based on current dashboard filters.</DialogDescription>
          </DialogHeader>
          <DialogBody>
          {detailRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records found for this selection.</p>
          ) : (
            <Table responsiveShell={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right">{r.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            <Button onClick={() => { setDetailOpen(false); if (detailLink) navigate(detailLink); }}>Open Full Page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
