import { useMemo, useState } from 'react';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Datepicker, dateToYmd, ymdToDate } from '@/components/ui/datepicker';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppStore } from '@/store/useAppStore';
import { can, formatINR } from '@/lib/rbac';
import { toast } from '@/components/ui/use-toast';
import {
  useDuePayments,
  useOverduePayments,
  usePaymentCatalog,
  usePaymentHistory,
  useRemainingBalances,
} from '@/hooks/usePayments';
import type { PaymentPlanCatalog, PaymentScheduleItem } from '@/types/payments';
import { apiUrl } from '@/lib/api';
import { triggerAutomation } from '@/lib/automationService';
import { AlertCircle, CheckCircle, Clock, FileText, Plus, Trash2 } from 'lucide-react';

function formatDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return s;
  }
}

function paymentStatusBadge(status?: string) {
  const s = String(status ?? 'pending');
  if (s === 'paid') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        Paid
      </span>
    );
  }
  if (s === 'overdue') {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
        Overdue
      </span>
    );
  }
  if (s === 'partial') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
      Due
    </span>
  );
}

function PaymentKpiCard(props: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  badge?: string | null;
  badgeColor?: string;
}) {
  const Icon = props.icon;
  return (
    <Card className="border border-border shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{props.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{props.value}</p>
            {props.badge ? (
              <p className="mt-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${props.badgeColor ?? ''}`}>
                  {props.badge}
                </span>
              </p>
            ) : null}
          </div>
          <div className={`rounded-lg p-2 ${props.iconBg}`}>
            <Icon className={`h-5 w-5 ${props.iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<PaymentPlanCatalog>;
  onSave: (payload: { name: string; description?: string | null; schedule: PaymentScheduleItem[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [schedule, setSchedule] = useState<PaymentScheduleItem[]>(
    Array.isArray(initial?.schedule) && initial!.schedule!.length
      ? (initial!.schedule as PaymentScheduleItem[])
      : [{ label: 'Advance', percentage: 30, due_days_after_start: 0 }],
  );

  const addRow = () => setSchedule((s) => [...s, { label: `Milestone ${s.length}`, percentage: 0, due_days_after_start: 0 }]);
  const removeRow = (idx: number) => setSchedule((s) => s.filter((_, i) => i !== idx));

  const updateRow = (idx: number, patch: Partial<PaymentScheduleItem>) => {
    setSchedule((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const totalPct = schedule.reduce((s, r) => s + Number(r.percentage || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Plan name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enterprise Annual" />
        </div>
        <div className="space-y-1.5">
          <Label>Description (optional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reusable template" />
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
          <div>
            <p className="text-sm font-medium">Schedule</p>
            <p className="text-xs text-muted-foreground">Total: {totalPct}% (should be 100%)</p>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={addRow}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Label</TableHead>
                <TableHead className="text-xs">%</TableHead>
                <TableHead className="text-xs">Due (days)</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      className="h-9"
                      value={row.label}
                      onChange={(e) => updateRow(idx, { label: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <Input
                      className="h-9"
                      type="number"
                      value={row.percentage}
                      onChange={(e) => updateRow(idx, { percentage: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <Input
                      className="h-9"
                      type="number"
                      value={row.due_days_after_start}
                      onChange={(e) => updateRow(idx, { due_days_after_start: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(idx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!name.trim()) {
              toast({ title: 'Name required', variant: 'destructive' });
              return;
            }
            if (Math.round(totalPct) !== 100) {
              toast({ title: 'Schedule must total 100%', description: `Currently ${totalPct}%`, variant: 'destructive' });
              return;
            }
            onSave({ name: name.trim(), description: description.trim() || null, schedule });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export default function Payments() {
  const me = useAppStore((s) => s.me);
  const canView = can(me.role, 'payments', 'view');
  const canCreate = can(me.role, 'payments', 'create');
  const canUpdate = can(me.role, 'payments', 'update');
  const canDelete = can(me.role, 'payments', 'delete');
  const canConfirm = me.role === 'finance' || me.role === 'super_admin';

  const remainingQ = useRemainingBalances();
  const overdueQ = useOverduePayments();
  const dueQ = useDuePayments();
  const historyQ = usePaymentHistory();
  const catalogQ = usePaymentCatalog();

  const [editing, setEditing] = useState<PaymentPlanCatalog | null>(null);
  const [creating, setCreating] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordRow, setRecordRow] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const kpis = useMemo(() => {
    const remainingRows = remainingQ.data ?? [];
    const totalPending = remainingRows.reduce((s, r: any) => s + Number(r.remaining_amount ?? 0), 0);
    const overdueAmount = (overdueQ.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const collectedMTD = (historyQ.data ?? [])
      .filter((h) => h.status === 'paid' && h.paid_date && new Date(h.paid_date).getMonth() === new Date().getMonth())
      .reduce((s, h) => s + Number(h.paid_amount ?? 0), 0);
    const dueAmount = (dueQ.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return {
      totalPending,
      overdueAmount,
      dueAmount,
      collectedMTD,
      activePlans: remainingRows.length,
      overdueCount: (overdueQ.data ?? []).length,
      dueCount: (dueQ.data ?? []).length,
    };
  }, [remainingQ.data, overdueQ.data, dueQ.data, historyQ.data]);

  if (!canView) {
    return (
      <>
        <Topbar title="Payments" subtitle="Track installments, collections and balances" />
        <div className="text-sm text-muted-foreground">You don&apos;t have access to Payments.</div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Payments" subtitle="Track installments, collections and balances" />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <PaymentKpiCard
            label="Total Pending"
            value={formatINR(kpis.totalPending)}
            icon={Clock}
            iconBg="bg-amber-50 dark:bg-amber-950"
            iconColor="text-amber-600"
          />
          <PaymentKpiCard
            label="Overdue"
            value={formatINR(kpis.overdueAmount)}
            icon={AlertCircle}
            iconBg="bg-red-50 dark:bg-red-950"
            iconColor="text-red-600"
            badge={kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : null}
            badgeColor="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          />
          <PaymentKpiCard
            label="Collected MTD"
            value={formatINR(kpis.collectedMTD)}
            icon={CheckCircle}
            iconBg="bg-emerald-50 dark:bg-emerald-950"
            iconColor="text-emerald-600"
          />
          <PaymentKpiCard
            label="Active Plans"
            value={String(kpis.activePlans)}
            icon={FileText}
            iconBg="bg-blue-50 dark:bg-blue-950"
            iconColor="text-blue-600"
          />
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="h-9 flex-wrap">
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="due" className="text-xs">
              Due ({kpis.dueCount})
            </TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs">
              Overdue ({kpis.overdueCount})
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              History
            </TabsTrigger>
            <TabsTrigger value="catalog" className="text-xs">
              Plan Catalog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-3">
            <Card className="border border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Remaining balances</CardTitle>
              </CardHeader>
              <CardContent>
                {remainingQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : remainingQ.isError ? (
                  <p className="text-sm text-destructive">
                    Could not load payment plans. Restart the API server (<code className="text-xs">npm run server</code>) and refresh.
                  </p>
                ) : (remainingQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active payment plans yet. Create a deal from a proposal with <strong>Payment plan</strong> enabled to see installments here.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs">Plan</TableHead>
                          <TableHead className="text-xs">Remaining</TableHead>
                          <TableHead className="text-xs">Next due</TableHead>
                          <TableHead className="text-xs">Overdue</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(remainingQ.data ?? []).map((r: any) => (
                          <TableRow key={r.plan_id}>
                            <TableCell className="text-sm font-medium">{r.company_name ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.deal_title ?? '—'}</TableCell>
                            <TableCell className="text-xs">{r.plan_name}</TableCell>
                            <TableCell className="text-sm font-semibold">{formatINR(Number(r.remaining_amount ?? 0))}</TableCell>
                            <TableCell className="text-xs">{formatDate(r.next_due_date)}</TableCell>
                            <TableCell className="text-xs">
                              {Number(r.overdue_count ?? 0) > 0 ? (
                                <span className="font-medium text-destructive">{r.overdue_count}</span>
                              ) : (
                                '0'
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.plan_source === 'deal' ? 'Deal + estimate' : 'Manual plan'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="due" className="mt-4">
            <Card className="border border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Upcoming due installments</CardTitle>
              </CardHeader>
              <CardContent>
                {dueQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (dueQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming installments due.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs">Installment</TableHead>
                          <TableHead className="text-xs">Estimate</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Due date</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dueQ.data ?? []).map((row: any) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">{row.company_name ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.deal_title ?? '—'}</TableCell>
                            <TableCell className="text-xs">{row.label}</TableCell>
                            <TableCell className="text-xs font-mono">{row.estimate_number ?? '—'}</TableCell>
                            <TableCell className="text-sm font-semibold">{formatINR(Number(row.amount ?? 0))}</TableCell>
                            <TableCell className="text-xs">{formatDate(row.due_date)}</TableCell>
                            <TableCell className="text-xs">{paymentStatusBadge(row.status)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => {
                                  setRecordRow(row);
                                  setPayAmount(String(row.amount ?? ''));
                                  setPayRef('');
                                  setPayMode('bank_transfer');
                                  setPayDate(new Date().toISOString().slice(0, 10));
                                  setRecordOpen(true);
                                }}
                              >
                                Record
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overdue" className="mt-4">
            <Card className="border border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Overdue installments</CardTitle>
              </CardHeader>
              <CardContent>
                {overdueQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs">Installment</TableHead>
                          <TableHead className="text-xs">Estimate</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Due date</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(overdueQ.data ?? []).map((row: any) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">{row.company_name ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.deal_title ?? '—'}</TableCell>
                            <TableCell className="text-xs">{row.label}</TableCell>
                            <TableCell className="text-xs font-mono">{row.estimate_number ?? '—'}</TableCell>
                            <TableCell className="text-sm font-semibold text-destructive">{formatINR(Number(row.amount ?? 0))}</TableCell>
                            <TableCell className="text-xs text-destructive">{formatDate(row.due_date)}</TableCell>
                            <TableCell className="text-xs">{paymentStatusBadge('overdue')}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs rounded-lg"
                                  onClick={async () => {
                                    await triggerAutomation('invoice_overdue', {
                                      customerId: row.customer_id,
                                      customerName: row.company_name,
                                      dealId: row.deal_id,
                                      dealTitle: row.deal_title,
                                      invoiceNumber: row.label,
                                      dueDate: row.due_date,
                                      amountDue: Number(row.amount ?? 0),
                                      daysOverdue: Math.max(
                                        1,
                                        Math.floor((Date.now() - new Date(row.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)),
                                      ),
                                      companyName: 'CRAVINGCODE TECHNOLOGIES PVT. LTD.',
                                    });
                                    toast({ title: 'Reminder triggered' });
                                  }}
                                >
                                  Remind
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => {
                                    setRecordRow(row);
                                    setPayAmount(String(row.amount ?? ''));
                                    setPayRef('');
                                    setPayMode('bank_transfer');
                                    setPayDate(new Date().toISOString().slice(0, 10));
                                    setRecordOpen(true);
                                  }}
                                >
                                  Record
                                </Button>
                                {canConfirm && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs rounded-lg"
                                    onClick={async () => {
                                      const res = await fetch(apiUrl(`/api/payments/installment/${row.id}/confirm`), {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: me.id, userName: me.name }),
                                      });
                                      if (!res.ok) {
                                        const e = await res.json().catch(() => ({}));
                                        toast({ title: 'Confirm failed', description: e.error || 'Failed', variant: 'destructive' });
                                        return;
                                      }
                                      toast({ title: 'Payment confirmed' });
                                      overdueQ.refetch();
                                      dueQ.refetch();
                                      historyQ.refetch();
                                      remainingQ.refetch();
                                    }}
                                  >
                                    Confirm
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="border border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Payment history</CardTitle>
              </CardHeader>
              <CardContent>
                {historyQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs">Label</TableHead>
                          <TableHead className="text-xs">Due</TableHead>
                          <TableHead className="text-xs">Paid</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(historyQ.data ?? []).map((row: any) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">{row.company_name ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.deal_title ?? '—'}</TableCell>
                            <TableCell className="text-xs">{row.label}</TableCell>
                            <TableCell className="text-xs">{formatDate(row.due_date)}</TableCell>
                            <TableCell className="text-xs">{formatINR(Number(row.paid_amount ?? 0))}</TableCell>
                            <TableCell className="text-xs">{row.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalog" className="mt-4 space-y-3">
            <Card className="border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Plan catalog</CardTitle>
                {canCreate && (
                  <Button size="sm" className="h-8" onClick={() => { setCreating(true); setEditing(null); }}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    New
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {(creating || editing) && (
                  <CatalogEditor
                    initial={editing ?? undefined}
                    onCancel={() => { setCreating(false); setEditing(null); }}
                    onSave={async (payload) => {
                      try {
                        const url = editing ? `/api/payment-plans/catalog/${editing.id}` : `/api/payment-plans/catalog`;
                        const method = editing ? 'PUT' : 'POST';
                        const res = await fetch(apiUrl(url), {
                          method,
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        });
                        if (!res.ok) {
                          const e = await res.json().catch(() => ({}));
                          throw new Error(e.error || 'Save failed');
                        }
                        toast({ title: editing ? 'Updated' : 'Created' });
                        setCreating(false);
                        setEditing(null);
                        await catalogQ.refetch();
                      } catch (e) {
                        toast({
                          title: 'Error',
                          description: e instanceof Error ? e.message : 'Save failed',
                          variant: 'destructive',
                        });
                      }
                    }}
                  />
                )}

                {!creating && !editing && (
                  <>
                    {catalogQ.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs">Installments</TableHead>
                              <TableHead className="text-xs">Active</TableHead>
                              <TableHead className="w-[140px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(catalogQ.data ?? []).map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="text-sm font-medium">{p.name}</TableCell>
                                <TableCell className="text-xs">{p.installments}</TableCell>
                                <TableCell className="text-xs">{p.isActive ? 'Yes' : 'No'}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    {canUpdate && (
                                      <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(p)}>
                                        Edit
                                      </Button>
                                    )}
                                    {canDelete && (
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-8"
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(apiUrl(`/api/payment-plans/catalog/${p.id}`), { method: 'DELETE' });
                                            if (!res.ok) {
                                              const e = await res.json().catch(() => ({}));
                                              throw new Error(e.error || 'Delete failed');
                                            }
                                            toast({ title: 'Deleted' });
                                            catalogQ.refetch();
                                          } catch (e) {
                                            toast({ title: 'Error', description: e instanceof Error ? e.message : 'Delete failed', variant: 'destructive' });
                                          }
                                        }}
                                      >
                                        Delete
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Paid amount</Label>
              <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} type="number" />
            </div>
            <div className="space-y-1.5">
              <Label>Paid date</Label>
              <Datepicker
                select="single"
                touchUi={false}
                inputComponent="input"
                inputProps={{ placeholder: 'Paid date…', className: 'h-9' }}
                value={ymdToDate(payDate)}
                onChange={(ev) => setPayDate(ev.value ? dateToYmd(ev.value) : '')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Input value={payMode} onChange={(e) => setPayMode(e.target.value)} placeholder="bank_transfer / cash / upi" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UTR / Txn id" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!recordRow) return;
                const res = await fetch(apiUrl(`/api/payments/installment/${recordRow.id}/pay`), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    paidAmount: Number(payAmount),
                    paidDate: payDate,
                    paymentMode: payMode,
                    transactionReference: payRef,
                    notes: '',
                    userId: me.id,
                    userName: me.name,
                  }),
                });
                if (!res.ok) {
                  const e = await res.json().catch(() => ({}));
                  toast({ title: 'Record failed', description: e.error || 'Failed', variant: 'destructive' });
                  return;
                }
                const out = await res.json().catch(() => null);
                toast({ title: 'Payment recorded', description: out?.receiptNumber ? `Receipt: ${out.receiptNumber}` : undefined });
                setRecordOpen(false);
                overdueQ.refetch();
                dueQ.refetch();
                historyQ.refetch();
                remainingQ.refetch();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

