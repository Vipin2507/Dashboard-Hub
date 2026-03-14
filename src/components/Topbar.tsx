import { useAppStore } from '@/store/useAppStore';
import { ROLE_LABELS } from '@/types';
import { Bell, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  const me = useAppStore(s => s.me);
  const notifications = useAppStore(s => s.notifications);
  const logout = useAppStore(s => s.logout);
  const navigate = useNavigate();

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        {actions}
        <div className="relative">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {notifications.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
              {notifications.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{me.name}</span>
            <Badge variant="outline" className="text-[10px] font-normal">{ROLE_LABELS[me.role]}</Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
