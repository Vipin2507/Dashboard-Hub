import { useNavigate } from 'react-router-dom';
import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { getScope, visibleWithScope, formatINR } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock, DollarSign, TrendingUp, CheckCircle } from 'lucide-react';

export default function DealsPage() {
  const navigate = useNavigate();
  const me = useAppStore(s => s.me);
  const deals = useAppStore(s => s.deals);
  const customers = useAppStore(s => s.customers);
  const users = useAppStore(s => s.users);
  const scope = getScope(me.role, 'deals');
  const visible = visibleWithScope(scope, me, deals);

  const totalValue = visible.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <Topbar title="Deals" subtitle="Track and manage all deals" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Total Deal Value</p>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{formatINR(totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Total Deals</p>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{visible.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Locked Deals</p>
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-success">{visible.filter(d => d.locked).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">All Deals</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Deal ID</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Stage</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs text-right">Value</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono-id">{d.id}</TableCell>
                    <TableCell className="text-sm font-medium">{d.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                        {customers.find(c => c.id === d.customerId) ? (
                          <button
                            type="button"
                            className="text-primary hover:underline text-left"
                            onClick={() => navigate(`/customers/${d.customerId}`)}
                          >
                            {customers.find(c => c.id === d.customerId)?.companyName}
                          </button>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{d.stage}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{users.find(u => u.id === d.ownerUserId)?.name}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatINR(d.value)}</TableCell>
                    <TableCell>
                      {d.locked ? (
                        <span className="flex items-center gap-1 text-xs text-success"><Lock className="w-3 h-3" /> Locked</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-warning"><span className="w-2 h-2 rounded-full bg-warning" /> Open</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">No deals in scope</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Before Deal:</strong> Proposal values can be updated by authorized roles.</p>
            <p><strong className="text-foreground">After Deal:</strong> Deal is locked. Only Super Admin can override final value (triggers audit).</p>
            <p><strong className="text-foreground">Enforcement:</strong> Lock state is checked on every action in the Proposals detail panel.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
