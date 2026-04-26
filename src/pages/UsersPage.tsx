import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLE_LABELS, type Role } from '@/types';
import { ShieldAlert } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
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

export default function UsersPage() {
  const me = useAppStore(s => s.me);
  const users = useAppStore(s => s.users);
  const setUsers = useAppStore(s => s.setUsers);
  const teams = useAppStore(s => s.teams);
  const regions = useAppStore(s => s.regions);
  const updateUserRole = useAppStore(s => s.updateUserRole);
  const updateUserStatus = useAppStore(s => s.updateUserStatus);
  const updatePassword = useAppStore(s => s.updatePassword);

  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [disableTarget, setDisableTarget] = useState<import('@/types').User | null>(null);
  const [transferToUserId, setTransferToUserId] = useState<string>('');

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/users'));
      if (!res.ok) throw new Error('Failed to load users');
      return res.json() as Promise<import('@/types').User[]>;
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload: import('@/types').User) => {
      const res = await fetch(apiUrl(`/api/users/${payload.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update user');
      return res.json();
    },
    onSuccess: () => usersQuery.refetch(),
  });

  useEffect(() => {
    if (!usersQuery.data) return;
    setUsers(usersQuery.data);
  }, [usersQuery.data, setUsers]);

  if (me.role !== 'super_admin') {
    return (
      <>
        <Topbar title="Users" />
        <div className="space-y-4">
          <Card className="bg-card border border-border">
            <CardContent className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
              <ShieldAlert className="w-5 h-5" />
              <p className="text-sm">Access denied. Only Super Admin can manage users.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const handlePasswordChange = (userId: string) => {
    const newPassword = passwordEdits[userId];
    if (!newPassword || newPassword.length < 4) {
      setPasswordErrors(prev => ({ ...prev, [userId]: 'Password must be at least 4 characters' }));
      return;
    }
    try {
      updatePassword(userId, null, newPassword);
      const user = useAppStore.getState().users.find((u) => u.id === userId);
      if (user) updateUserMutation.mutate(user);
      setPasswordEdits(prev => ({ ...prev, [userId]: '' }));
      setPasswordErrors(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to update password';
      setPasswordErrors(prev => ({ ...prev, [userId]: message }));
    }
  };

  return (
    <>
      <Topbar title="Users" subtitle="Manage platform users" />
      <div className="space-y-4">
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Team</TableHead>
                  <TableHead className="text-xs">Region</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Security</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm font-medium">{u.name}</TableCell>
                    <TableCell className="font-mono-id">{u.id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {me.role === 'super_admin' ? (
                        <Select
                          value={u.role}
                          onValueChange={(value) => {
                            updateUserRole(u.id, value as Role);
                            const user = useAppStore.getState().users.find((x) => x.id === u.id);
                            if (user) updateUserMutation.mutate(user);
                          }}
                        >
                          <SelectTrigger className="h-8 text-[10px]">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_LABELS).map(([role, label]) => (
                              <SelectItem key={role} value={role} className="text-xs">
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{teams.find(t => t.id === u.teamId)?.name}</TableCell>
                    <TableCell className="text-xs">{regions.find(r => r.id === u.regionId)?.name}</TableCell>
                    <TableCell>
                      <span className={`flex items-center gap-1 text-xs ${u.status === 'active' ? 'text-success' : 'text-destructive'}`}>
                        <span className={`w-2 h-2 rounded-full ${u.status === 'active' ? 'bg-success' : 'bg-destructive'}`} />
                        {u.status === 'active' ? 'Active' : 'Disabled'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {me.role === 'super_admin' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={u.status === 'active'}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  updateUserStatus(u.id, 'active');
                                  const user = useAppStore.getState().users.find((x) => x.id === u.id);
                                  if (user) updateUserMutation.mutate(user);
                                  return;
                                }
                                setDisableTarget(u);
                                setTransferToUserId('');
                              }}
                            />
                            <span className="text-[11px] text-muted-foreground">
                              {u.status === 'active' ? 'Can sign in' : 'Sign in disabled'}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex gap-1">
                              <Input
                                type="password"
                                placeholder="New password"
                                className="h-8 text-xs"
                                value={passwordEdits[u.id] ?? ''}
                                onChange={e => setPasswordEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                type="button"
                                onClick={() => handlePasswordChange(u.id)}
                              >
                                Update
                              </Button>
                            </div>
                            {passwordErrors[u.id] && (
                              <p className="text-[11px] text-destructive">
                                {passwordErrors[u.id]}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">In V1, only Super Admin can manage users.</p>
      </div>

      <AlertDialog
        open={!!disableTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDisableTarget(null);
            setTransferToUserId('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user and transfer ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              Disabling an employee triggers a transfer workflow. Select the replacement user to receive this user’s active deals and proposals.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Transfer to</p>
            <Select value={transferToUserId} onValueChange={setTransferToUserId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a replacement user" />
              </SelectTrigger>
              <SelectContent>
                {users
                  .filter((x) => x.status === 'active' && x.id !== disableTarget?.id)
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id} className="text-xs">
                      {x.name} ({ROLE_LABELS[x.role]})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!disableTarget) return;
                if (!transferToUserId) return;
                updateUserStatus(disableTarget.id, 'disabled', { transferToUserId });
                const user = useAppStore.getState().users.find((x) => x.id === disableTarget.id);
                if (user) updateUserMutation.mutate(user);
                setDisableTarget(null);
                setTransferToUserId('');
              }}
              disabled={!transferToUserId}
            >
              Disable & Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
