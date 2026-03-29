import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScope } from '@/lib/rbac';
import { apiUrl } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function EmailLogPage() {
  const me = useAppStore(s => s.me);
  const notifications = useAppStore(s => s.notifications);
  const setNotifications = useAppStore(s => s.setNotifications);
  const scope = getScope(me.role, 'email_log');
  const visible = scope === 'NONE' ? [] : notifications;

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/notifications'));
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json() as Promise<import('@/types').Notification[]>;
    },
  });

  useEffect(() => {
    if (!notificationsQuery.data) return;
    setNotifications(notificationsQuery.data);
  }, [notificationsQuery.data, setNotifications]);

  return (
    <>
      <Topbar title="Email Log" subtitle="Track all email communications" />
      <div className="space-y-4">
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">All Emails</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="whitespace-nowrap text-xs">When</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">To</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(n => (
                  <TableRow key={n.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(n.at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${
                        n.type === 'CUSTOMER_EMAIL' ? 'border-primary/40 text-primary' :
                        n.type === 'AUDIT_EMAIL' ? 'border-warning/40 text-warning' :
                        'border-muted-foreground/40 text-muted-foreground'
                      }`}>{n.type.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.to}</TableCell>
                    <TableCell className="text-xs">{n.subject}</TableCell>
                    <TableCell className="hidden font-mono-id md:table-cell">{n.entityId}</TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-12">No email logs in scope</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
