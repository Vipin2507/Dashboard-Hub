import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { getScope } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function EmailLogPage() {
  const me = useAppStore(s => s.me);
  const notifications = useAppStore(s => s.notifications);
  const scope = getScope(me.role, 'email_log');
  const visible = scope === 'NONE' ? [] : notifications;

  return (
    <>
      <Topbar title="Email Log" subtitle="Track all email communications" />
      <div className="p-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">All Emails</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">When</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">To</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(n => (
                  <TableRow key={n.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(n.at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${
                        n.type === 'CUSTOMER_EMAIL' ? 'border-primary/40 text-primary' :
                        n.type === 'AUDIT_EMAIL' ? 'border-warning/40 text-warning' :
                        'border-muted-foreground/40 text-muted-foreground'
                      }`}>{n.type.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.to}</TableCell>
                    <TableCell className="text-xs">{n.subject}</TableCell>
                    <TableCell className="font-mono-id">{n.entityId}</TableCell>
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
