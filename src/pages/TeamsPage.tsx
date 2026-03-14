import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert } from 'lucide-react';

export default function TeamsPage() {
  const me = useAppStore(s => s.me);
  const teams = useAppStore(s => s.teams);
  const regions = useAppStore(s => s.regions);

  if (me.role !== 'super_admin') {
    return (
      <>
        <Topbar title="Teams" />
        <div className="p-6">
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
      <div className="p-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Team Name</TableHead>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Region</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono-id">{t.id}</TableCell>
                    <TableCell className="text-sm">{regions.find(r => r.id === t.regionId)?.name}</TableCell>
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
