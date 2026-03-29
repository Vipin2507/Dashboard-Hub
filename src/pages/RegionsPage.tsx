import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export default function RegionsPage() {
  const me = useAppStore(s => s.me);
  const regions = useAppStore(s => s.regions);
  const setRegions = useAppStore(s => s.setRegions);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const regionsQuery = useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/regions'));
      if (!res.ok) throw new Error('Failed to load regions');
      return res.json() as Promise<import('@/types').Region[]>;
    },
  });

  useEffect(() => {
    if (!regionsQuery.data) return;
    setRegions(regionsQuery.data);
  }, [regionsQuery.data, setRegions]);

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const res = await fetch(apiUrl('/api/regions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create region');
    },
    onSuccess: () => regionsQuery.refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string }) => {
      const res = await fetch(apiUrl(`/api/regions/${payload.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update region');
    },
    onSuccess: () => regionsQuery.refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/regions/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete region');
    },
    onSuccess: () => regionsQuery.refetch(),
  });

  if (me.role !== 'super_admin') {
    return (
      <>
        <Topbar title="Regions" />
        <div className="space-y-4">
          <Card className="bg-card border border-border">
            <CardContent className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
              <ShieldAlert className="w-5 h-5" />
              <p className="text-sm">Access denied. Only Super Admin can manage regions.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Regions" subtitle="Geographic regions" />
      <div className="space-y-4">
        <Card className="bg-card border border-border">
          <CardContent className="p-4 flex items-end gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Region name</p>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Region name" />
            </div>
            <Button onClick={() => {
              if (!name.trim()) return;
              if (editingId) {
                updateMutation.mutate({ id: editingId, name: name.trim() });
                toast({ title: 'Region updated' });
              } else {
                createMutation.mutate({ name: name.trim() });
                toast({ title: 'Region created' });
              }
              setName('');
              setEditingId(null);
            }}>{editingId ? 'Save' : 'Add Region'}</Button>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-5 flex flex-wrap gap-3">
            {regions.map(r => (
              <Badge key={r.id} variant="outline" className="text-sm px-3 py-2 flex items-center gap-2">
                <span>{r.name}</span>
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">{r.id}</span>
                <button type="button" className="text-[10px] underline" onClick={() => { setEditingId(r.id); setName(r.name); }}>Edit</button>
                <button type="button" className="text-[10px] underline text-destructive" onClick={() => { deleteMutation.mutate(r.id); toast({ title: 'Region deleted' }); }}>Delete</button>
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
