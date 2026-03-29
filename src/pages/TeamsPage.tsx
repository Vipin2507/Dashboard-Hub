import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export default function TeamsPage() {
  const me = useAppStore(s => s.me);
  const teams = useAppStore(s => s.teams);
  const setTeams = useAppStore(s => s.setTeams);
  const regions = useAppStore(s => s.regions);
  const [name, setName] = useState('');
  const [regionId, setRegionId] = useState(regions[0]?.id ?? '');
  const [editingId, setEditingId] = useState<string | null>(null);

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/teams'));
      if (!res.ok) throw new Error('Failed to load teams');
      return res.json() as Promise<import('@/types').Team[]>;
    },
  });

  useEffect(() => {
    if (!teamsQuery.data) return;
    setTeams(teamsQuery.data);
  }, [teamsQuery.data, setTeams]);

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; regionId: string }) => {
      const res = await fetch(apiUrl('/api/teams'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create team');
    },
    onSuccess: () => teamsQuery.refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; regionId: string }) => {
      const res = await fetch(apiUrl(`/api/teams/${payload.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update team');
    },
    onSuccess: () => teamsQuery.refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/teams/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete team');
    },
    onSuccess: () => teamsQuery.refetch(),
  });

  if (me.role !== 'super_admin') {
    return (
      <>
        <Topbar title="Teams" />
        <div className="space-y-4">
          <Card className="bg-card border border-border">
            <CardContent className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
              <ShieldAlert className="w-5 h-5" />
              <p className="text-sm">Access denied. Only Super Admin can manage teams.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Teams" subtitle="Manage team structure" />
      <div className="space-y-4">
        <Card className="bg-card border border-border">
          <CardContent className="p-4 flex items-end gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Team name</p>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
            </div>
            <div className="w-48">
              <p className="text-xs text-muted-foreground mb-1">Region</p>
              <Select value={regionId} onValueChange={setRegionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                if (!name.trim() || !regionId) return;
                if (editingId) {
                  updateMutation.mutate({ id: editingId, name: name.trim(), regionId });
                  toast({ title: 'Team updated' });
                } else {
                  createMutation.mutate({ name: name.trim(), regionId });
                  toast({ title: 'Team created' });
                }
                setName('');
                setEditingId(null);
              }}
            >
              {editingId ? 'Save' : 'Add Team'}
            </Button>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Team Name</TableHead>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Region</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono-id">{t.id}</TableCell>
                    <TableCell className="text-sm">{regions.find(r => r.id === t.regionId)?.name}</TableCell>
                    <TableCell className="w-[140px]">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => {
                          setEditingId(t.id);
                          setName(t.name);
                          setRegionId(t.regionId);
                        }}>Edit</Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => {
                          deleteMutation.mutate(t.id);
                          toast({ title: 'Team deleted' });
                        }}>Delete</Button>
                      </div>
                    </TableCell>
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
