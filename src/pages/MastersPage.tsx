import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { apiUrl } from '@/lib/api';

type MasterItem = import('@/types').MasterItem;

function useMaster(endpoint: string) {
  const queryClient = useQueryClient();

  const query = useQuery<MasterItem[]>({
    queryKey: ['masters', endpoint],
    queryFn: async () => {
      const res = await fetch(apiUrl(endpoint));
      if (!res.ok) throw new Error('Failed to load master data');
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to create item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', endpoint] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`${endpoint}/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', endpoint] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(apiUrl(`${endpoint}/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to update item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', endpoint] });
    },
  });

  return { query, addMutation, deleteMutation, updateMutation };
}

export default function MastersPage() {
  const productMaster = useMaster('/api/masters/product-categories');
  const subscriptionMaster = useMaster('/api/masters/subscription-types');
  const formatMaster = useMaster('/api/masters/proposal-formats');

  return (
    <>
      <Topbar title="Masters" subtitle="Manage master data for proposals and deals" />
      <div className="space-y-4 sm:space-y-6">
        <MasterSection
          title="Product Categories"
          description="Used to classify proposals and deals."
          placeholder="e.g. CRM Suite"
          master={productMaster}
        />
        <MasterSection
          title="Subscription Types"
          description="Available billing/subscription models."
          placeholder="e.g. Annual"
          master={subscriptionMaster}
        />
        <MasterSection
          title="Proposal Formats"
          description="Document formats/layouts for proposals."
          placeholder="e.g. Enterprise"
          master={formatMaster}
        />
      </div>
    </>
  );
}

function MasterSection({
  title,
  description,
  placeholder,
  master,
}: {
  title: string;
  description: string;
  placeholder: string;
  master: ReturnType<typeof useMaster>;
}) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const { query, addMutation, deleteMutation, updateMutation } = master;

  const items = query.data ?? [];

  const handleAdd = () => {
    if (!name.trim()) return;
    addMutation.mutate(name.trim(), {
      onSuccess: () => {
        toast({ title: `${title} updated`, description: `"${name.trim()}" has been added.` });
        setName('');
      },
      onError: () => {
        toast({ title: 'Error', description: `Unable to add ${title.toLowerCase()}.`, variant: 'destructive' });
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: `${title} updated`, description: `Item has been removed.` });
      },
      onError: () => {
        toast({ title: 'Error', description: `Unable to delete item.`, variant: 'destructive' });
      },
    });
  };

  const handleEdit = (item: MasterItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) return;
    updateMutation.mutate(
      { id: editingId, name: editingName.trim() },
      {
        onSuccess: () => {
          toast({ title: `${title} updated`, description: `Item has been updated.` });
          setEditingId(null);
          setEditingName('');
        },
        onError: () => {
          toast({ title: 'Error', description: `Unable to update item.`, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px]">Add new</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={placeholder}
                className="h-8 text-xs"
              />
            </div>
            <Button
              className="mt-5 h-8 text-xs"
              size="sm"
              onClick={handleAdd}
              disabled={addMutation.isLoading}
            >
              Add
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={2} className="text-xs text-muted-foreground py-4 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && items.map(item => (
              <TableRow key={item.id}>
                <TableCell className="text-sm">
                  {editingId === item.id ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  ) : (
                    item.name
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {editingId === item.id ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={handleSaveEdit}
                          disabled={updateMutation.isLoading}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => {
                            setEditingId(null);
                            setEditingName('');
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => handleEdit(item)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleteMutation.isLoading}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!query.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-xs text-muted-foreground py-4 text-center">
                  No items configured yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

