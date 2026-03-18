import { useEffect, useMemo } from 'react';
import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { getScope, visibleWithScope, formatINR } from '@/lib/rbac';
import { checkAndTriggerPaymentDue } from '@/lib/automationService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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

const BUILDESK_BLUE = '#0072BC';

export default function DashboardPage() {
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const proposals = useAppStore((s) => s.proposals);
  const deals = useAppStore((s) => s.deals);
  const navigate = useNavigate();

  const proposalScope = getScope(me.role, 'proposals');
  const dealScope = getScope(me.role, 'deals');
  const customerScope = getScope(me.role, 'customers');

  const visibleDeals = visibleWithScope(dealScope, me, deals);
  const visibleProposals = visibleWithScope(proposalScope, me, proposals);
  const visibleCustomers = visibleWithScope(customerScope, me, customers);

  useEffect(() => {
    checkAndTriggerPaymentDue();
    const interval = setInterval(() => checkAndTriggerPaymentDue(), 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // Total Revenue — sum of all paid customer payments
  const totalRevenue = useMemo(() => {
    return visibleCustomers.reduce((sum, c) => {
      return sum + (c.payments?.reduce((s, p) => s + p.amount, 0) ?? 0);
    }, 0);
  }, [visibleCustomers]);

  // Active Proposals — sent / approval_pending / approved
  const activeProposalsCount = useMemo(
    () =>
      visibleProposals.filter(
        (p) => p.status === 'sent' || p.status === 'approval_pending' || p.status === 'approved'
      ).length,
    [visibleProposals]
  );

  // Deals Closed This Month — from customer activityLog "Deal closed" in current month
  const dealsClosedThisMonth = useMemo(() => {
    let count = 0;
    for (const c of visibleCustomers) {
      for (const log of c.activityLog ?? []) {
        if (log.action === 'Deal closed' && log.timestamp >= startOfMonth) count++;
      }
    }
    return count;
  }, [visibleCustomers, startOfMonth]);

  // New Customers This Month
  const newCustomersThisMonth = useMemo(
    () => visibleCustomers.filter((c) => c.createdAt >= startOfMonth).length,
    [visibleCustomers, startOfMonth]
  );

  // Pending Approvals
  const pendingApprovals = useMemo(
    () => visibleProposals.filter((p) => p.status === 'approval_pending').length,
    [visibleProposals]
  );

  // Overdue Invoices — unpaid and dueDate < today
  const overdueInvoices = useMemo(() => {
    return visibleCustomers.reduce((sum, c) => {
      return (
        sum +
        (c.invoices?.filter((inv) => (inv.status === 'unpaid' || inv.status === 'overdue') && inv.dueDate < today).length ?? 0)
      );
    }, 0);
  }, [visibleCustomers, today]);

  // Expiring Subscriptions (30 days) — product lines expiring within 30 days
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringSubscriptions = useMemo(() => {
    return visibleCustomers.reduce((sum, c) => {
      return (
        sum +
        (c.productLines?.filter((pl) => {
          const exp = pl.expiryDate ? new Date(pl.expiryDate) : null;
          return exp && exp >= now && exp <= thirtyDaysFromNow;
        }).length ?? 0)
      );
    }, 0);
  }, [visibleCustomers, now, thirtyDaysFromNow]);

  // Open Support Tickets — open + in_progress
  const openSupportTickets = useMemo(() => {
    return visibleCustomers.reduce(
      (sum, c) =>
        sum +
        (c.supportTickets?.filter((t) => t.status === 'open' || t.status === 'in_progress').length ?? 0),
      0
    );
  }, [visibleCustomers]);

  // KPI Row 1 — Top 4 cards (large)
  const kpiRow1 = [
    { label: 'Total Revenue', value: formatINR(totalRevenue), sub: 'From paid payments', icon: DollarSign, color: 'text-green-600' },
    { label: 'Active Proposals', value: String(activeProposalsCount), sub: 'Sent / Pending / Approved', icon: TrendingUp, color: 'text-primary' },
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

  // Monthly Revenue — last 6 months, paid payments grouped by month, Y in lakhs
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
    for (const c of visibleCustomers) {
      for (const p of c.payments ?? []) {
        const paid = new Date(p.paidOn);
        const m = months.find((x) => x.year === paid.getFullYear() && x.monthNum === paid.getMonth());
        if (m) m.revenue += p.amount;
      }
    }
    return months.map((m) => ({ month: m.month, full: m.full, revenueLakhs: Math.round((m.revenue / 100_000) * 100) / 100 }));
  }, [visibleCustomers, now]);

  // Proposal Pipeline — count per status, horizontal bar
  const pipelineStatuses: ProposalStatus[] = [
    'draft',
    'sent',
    'approval_pending',
    'approved',
    'rejected',
    'deal_created',
  ];
  const pipelineData = useMemo(
    () =>
      pipelineStatuses.map((status) => ({
        status: status.replace(/_/g, ' '),
        count: visibleProposals.filter((p) => p.status === status).length,
        statusKey: status,
      })),
    [visibleProposals]
  );

  const pipelineColors: Record<string, string> = {
    draft: 'hsl(var(--muted-foreground))',
    sent: '#0072BC',
    'approval_pending': '#f59e0b',
    approved: '#22c55e',
    rejected: '#ef4444',
    deal_created: '#a855f7',
  };

  // Customer Status Donut
  const customerStatusData = useMemo(() => {
    const statuses = ['active', 'lead', 'inactive', 'churned', 'blacklisted'] as const;
    return statuses.map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: visibleCustomers.filter((c) => c.status === status).length,
    }));
  }, [visibleCustomers]);

  const donutColors = ['#22c55e', '#0072BC', '#94a3b8', '#f97316', '#ef4444'];

  // Recent Activity — last 10 across all customers
  const recentActivity = useMemo(() => {
    const all: { id: string; text: string; timestamp: string; action: string }[] = [];
    for (const c of visibleCustomers) {
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
  }, [visibleCustomers]);

  // Recent Proposals — last 5 by updatedAt desc
  const recentProposals = useMemo(
    () => [...visibleProposals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [visibleProposals]
  );

  const handlePipelineBarClick = (statusKey: string) => {
    navigate(`/proposals?status=${statusKey}`);
  };

  return (
    <>
      <Topbar
        title="Buildesk License Management"
        subtitle="Welcome back! Here's what's happening with your license management workflows."
      />
      <div className="p-6 space-y-6">
        {/* KPI Row 1 — Top 4 large cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiRow1.map((s) => (
            <Card key={s.label} className="bg-card border border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground font-medium">{s.label}</p>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* KPI Row 2 — Secondary 4 smaller cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiRow2.map((s) => (
            <Card key={s.label} className="bg-card border border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground font-medium truncate">{s.label}</p>
                  {s.badge && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        s.badge === 'amber'
                          ? 'border-amber-500/50 text-amber-700'
                          : s.badge === 'red'
                            ? 'border-red-500/50 text-red-700'
                            : 'border-orange-500/50 text-orange-700'
                      }`}
                    >
                      {s.value}
                    </Badge>
                  )}
                </div>
                <p className="text-xl font-bold text-foreground mt-1">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts + Activity — 2/3 width charts, 1/3 activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card border border-border">
              <CardContent className="p-6">
                <h3 className="font-semibold text-foreground mb-4">Revenue Overview</h3>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyRevenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `₹${v}L`}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatINR((value as number) * 100_000), 'Revenue']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                      />
                      <Bar dataKey="revenueLakhs" fill={BUILDESK_BLUE} name="Revenue" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border">
              <CardContent className="p-6">
                <h3 className="font-semibold text-foreground mb-4">Proposal Pipeline</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={pipelineData}
                      margin={{ top: 4, right: 8, left: 60, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="status" width={55} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name="Count"
                        radius={[0, 4, 4, 0]}
                        onClick={(data: { statusKey: string }) => data && handlePipelineBarClick(data.statusKey)}
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

            <Card className="bg-card border border-border">
              <CardContent className="p-6">
                <h3 className="font-semibold text-foreground mb-4">Customer Status</h3>
                <div className="relative h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={customerStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => (value > 0 ? `${name}: ${value}` : '')}
                      >
                        {customerStatusData.map((_, index) => (
                          <Cell key={index} fill={donutColors[index % donutColors.length]} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-foreground">{visibleCustomers.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border border-border">
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

        {/* Recent Proposals Table */}
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Recent Proposals</h3>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate('/proposals')}>
                View All
              </Button>
            </div>
            {recentProposals.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Proposal #</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentProposals.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => navigate('/proposals', { state: { detailId: p.id } })}
                        >
                          {p.proposalNumber}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.customerName}</TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {formatINR(p.finalQuoteValue ?? p.grandTotal)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {p.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
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
    </>
  );
}
