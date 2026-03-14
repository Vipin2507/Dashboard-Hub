import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';

export default function RegionsPage() {
  const me = useAppStore(s => s.me);
  const regions = useAppStore(s => s.regions);

  if (me.role !== 'super_admin') {
    return (
      <>
        <Topbar title="Regions" />
        <div className="p-6">
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
      <div className="p-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-5 flex flex-wrap gap-3">
            {regions.map(r => (
              <Badge key={r.id} variant="outline" className="text-sm px-4 py-2">
                {r.name}
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">{r.id}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
