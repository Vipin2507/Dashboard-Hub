import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { getScope, visibleWithScope, formatINR } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Users, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export default function DashboardPage() {
  const me = useAppStore(s => s.me);
  const proposals = useAppStore(s => s.proposals);
  const deals = useAppStore(s => s.deals);
  const notifications = useAppStore(s => s.notifications);
  const navigate = useNavigate();

  const apiBase = (import.meta as any).env.VITE_API_BASE_URL ?? 'http://localhost:4000';

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/customers`);
      if (!res.ok) throw new Error('Failed to load customers');
      return res.json() as Promise<import('@/types').Customer[]>;
    },
  });
  const customers = customersQuery.data ?? [];

  const proposalScope = getScope(me.role, 'proposals');
  const dealScope = getScope(me.role, 'deals');

  const visibleDeals = visibleWithScope(dealScope, me, deals);
  const visibleProposals = visibleWithScope(proposalScope, me, proposals);

  const totalDealValue = visibleDeals.reduce((s, d) => s + d.value, 0);

  const stats = [
    { label: 'Total Leads', value: String(customers.length), sub: 'Active lead accounts', icon: Users, color: 'text-primary' },
    { label: 'Proposals Sent', value: String(visibleProposals.filter(p => p.status === 'sent' || p.status === 'approved').length), sub: 'Sent to clients', icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Revenue', value: formatINR(totalDealValue), sub: `${visibleDeals.length} deals`, icon: DollarSign, color: 'text-success' },
    { label: 'Pending Approvals', value: String(visibleProposals.filter(p => p.status === 'approval_pending').length), sub: 'Need review', icon: Clock, color: 'text-warning' },
    { label: 'Active Deals', value: String(visibleDeals.length), sub: 'In pipeline', icon: CheckCircle, color: 'text-success' },
  ];

  const recentEmails = notifications.slice(0, 6);

  return (
    <>
      <Topbar title="Buildesk License Management" subtitle="Welcome back! Here's what's happening with your license management workflows." />
      <div className="p-6 space-y-6">
        {/* Stat cards row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.map(s => (
            <Card key={s.label} className="bg-card border border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-success mt-1">↑ {s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Two column: Recent Deals + Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-card border border-border">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Recent Deals</h3>
                <button onClick={() => navigate('/deals')} className="text-xs text-primary font-medium hover:underline">View all</button>
              </div>
              {visibleDeals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Deal</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Stage</TableHead>
                      <TableHead className="text-xs text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDeals.slice(0, 5).map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm font-medium">{d.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{customers.find(c => c.id === d.customerId)?.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{d.stage}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">{formatINR(d.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <p className="font-medium text-foreground">No deals yet</p>
                  <p className="text-sm mt-1">Create your first deal to get started</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-foreground">Quick Actions</h3>
              <div className="p-3 rounded-lg bg-accent border border-primary/10">
                <p className="text-xs text-primary font-medium mb-1">💡 RBAC Demo</p>
                <p className="text-[11px] text-muted-foreground">
                  Switch roles using the sidebar dropdown to see how permissions change across the app.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-border">
                  <span className="text-muted-foreground">Your Role</span>
                  <span className="font-medium text-foreground">{me.role.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border">
                  <span className="text-muted-foreground">Proposals visible</span>
                  <span className="font-medium text-foreground">{visibleProposals.length}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Deals visible</span>
                  <span className="font-medium text-foreground">{visibleDeals.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Email Log */}
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Recent Email Log</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">When</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEmails.map(n => (
                  <TableRow key={n.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(n.at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${
                        n.type === 'CUSTOMER_EMAIL' ? 'border-primary/40 text-primary' :
                        n.type === 'AUDIT_EMAIL' ? 'border-warning/40 text-warning' :
                        'border-muted-foreground/40 text-muted-foreground'
                      }`}>
                        {n.type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{n.subject}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
