import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { can, getScope, visibleWithScope, formatINR } from '@/lib/rbac';
import { apiUrl } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock, DollarSign, TrendingUp, CheckCircle, Plus, Pencil, Trash2, Search } from 'lucide-react';
import type { Deal } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';

export default function DealsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const me = useAppStore(s => s.me);
  const deals = useAppStore(s => s.deals);
  const setDeals = useAppStore(s => s.setDeals);
  const addDealWithId = useAppStore(s => s.addDealWithId);
  const updateDeal = useAppStore(s => s.updateDeal);
  const deleteDeal = useAppStore(s => s.deleteDeal);
  const customers = useAppStore(s => s.customers);
  const users = useAppStore(s => s.users);
  const scope = getScope(me.role, 'deals');
  const visibleDeals = visibleWithScope(scope, me, deals);
  const canCreate = can(me.role, 'deals', 'create');
  const canUpdate = can(me.role, 'deals', 'update');
  const canDelete = can(me.role, 'deals', 'delete');

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);

  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [stage, setStage] = useState('Qualified');
  const [value, setValue] = useState('');
  const [locked, setLocked] = useState(false);
  const [proposalId, setProposalId] = useState('');

  const dealsQuery = useQuery({
    queryKey: ['deals-sync'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/deals'));
      if (!res.ok) throw new Error('Failed to load deals');
      return (await res.json()) as Deal[];
    },
  });

  useEffect(() => {
    if (!dealsQuery.data) return;
    setDeals(dealsQuery.data);
  }, [dealsQuery.data]);

  useEffect(() => {
    if (!formOpen) return;
    if (editingDeal) {
      setName(editingDeal.name);
      setCustomerId(editingDeal.customerId);
      setOwnerUserId(editingDeal.ownerUserId);
      setStage(editingDeal.stage);
      setValue(String(editingDeal.value));
      setLocked(editingDeal.locked);
      setProposalId(editingDeal.proposalId ?? '');
      return;
    }
    setName('');
    setCustomerId(customers[0]?.id ?? '');
    setOwnerUserId(users[0]?.id ?? me.id);
    setStage('Qualified');
    setValue('');
    setLocked(false);
    setProposalId('');
  }, [formOpen, editingDeal?.id]);

  useEffect(() => {
    const q = searchParams.get('q');
    const stage = searchParams.get('stage');
    const owner = searchParams.get('owner');
    const team = searchParams.get('team');
    const region = searchParams.get('region');
    if (q) setSearch(q);
    if (stage) setStageFilter(stage);
    if (owner) setOwnerFilter(owner);
    if (team) setTeamFilter(team);
    if (region) setRegionFilter(region);
  }, [searchParams]);

  const createMutation = useMutation({
    mutationFn: async (deal: Deal) => {
      const res = await fetch(apiUrl('/api/deals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deal),
      });
      if (!res.ok) throw new Error('Failed to create deal');
      return (await res.json()) as Deal;
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: async (deal: Deal) => {
      const res = await fetch(apiUrl(`/api/deals/${deal.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deal),
      });
      if (!res.ok) throw new Error('Failed to update deal');
      return (await res.json()) as Deal;
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/deals/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete deal');
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleDeals.filter((d) => {
      if (q) {
        const customerName = customers.find((c) => c.id === d.customerId)?.companyName ?? '';
        if (
          !d.id.toLowerCase().includes(q) &&
          !d.name.toLowerCase().includes(q) &&
          !customerName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (stageFilter !== 'all' && d.stage !== stageFilter) return false;
      if (ownerFilter !== 'all' && d.ownerUserId !== ownerFilter) return false;
      if (teamFilter !== 'all' && d.teamId !== teamFilter) return false;
      if (regionFilter !== 'all' && d.regionId !== regionFilter) return false;
      return true;
    });
  }, [visibleDeals, search, stageFilter, ownerFilter, teamFilter, regionFilter, customers]);

  const totalValue = visible.reduce((s, d) => s + d.value, 0);

  const allStages = useMemo(() => {
    const set = new Set(visibleDeals.map((d) => d.stage));
    return Array.from(set);
  }, [visibleDeals]);

  const handleSaveDeal = async () => {
    const owner = users.find((u) => u.id === ownerUserId);
    const parsedValue = Number(value);
    if (!name.trim() || !customerId || !ownerUserId || !Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast({ title: 'Missing fields', description: 'Fill required fields correctly.', variant: 'destructive' });
      return;
    }
    const payload: Deal = {
      id: editingDeal?.id ?? `d${Math.random().toString(36).slice(2, 10)}`,
      name: name.trim(),
      customerId,
      ownerUserId,
      teamId: owner?.teamId ?? me.teamId,
      regionId: owner?.regionId ?? me.regionId,
      stage,
      value: parsedValue,
      locked,
      proposalId: proposalId.trim() ? proposalId.trim() : null,
    };

    if (editingDeal) {
      updateDeal(editingDeal.id, payload);
      try {
        await updateMutation.mutateAsync(payload);
        toast({ title: 'Deal updated', description: `${payload.name} updated successfully.` });
      } catch (e) {
        toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' });
      }
    } else {
      addDealWithId(payload);
      try {
        await createMutation.mutateAsync(payload);
        toast({ title: 'Deal created', description: `${payload.name} created successfully.` });
      } catch (e) {
        toast({ title: 'Create failed', description: (e as Error).message, variant: 'destructive' });
      }
    }
    setFormOpen(false);
    setEditingDeal(null);
  };

  const handleDeleteDeal = async () => {
    if (!deleteTarget) return;
    deleteDeal(deleteTarget.id);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: 'Deal deleted', description: `${deleteTarget.name} removed.` });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <Topbar title="Deals" subtitle="Track and manage all deals" />
      <div className="p-6 space-y-6">
        {dealsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading deals...</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search deal, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {allStages.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Button
              className="h-9"
              onClick={() => {
                setEditingDeal(null);
                setFormOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> New Deal
            </Button>
          )}
        </div>

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
                      <div className="flex items-center justify-between gap-2">
                        {d.locked ? (
                          <span className="flex items-center gap-1 text-xs text-success"><Lock className="w-3 h-3" /> Locked</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-warning"><span className="w-2 h-2 rounded-full bg-warning" /> Open</span>
                        )}
                        <div className="flex items-center gap-1">
                          {canUpdate && !d.locked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingDeal(d);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && !d.locked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteTarget(d)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDeal ? 'Edit Deal' : 'New Deal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Deal name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deal name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Owner *</Label>
                <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stage *</Label>
                <Input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Qualified" />
              </div>
              <div className="space-y-2">
                <Label>Value *</Label>
                <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Proposal ID (optional)</Label>
                <Input value={proposalId} onChange={(e) => setProposalId(e.target.value)} placeholder="p1234" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={locked ? 'locked' : 'open'} onValueChange={(v) => setLocked(v === 'locked')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="locked">Locked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDeal}>{editingDeal ? 'Save Changes' : 'Create Deal'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDeleteDeal}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
