import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { ROLE_LABELS } from '@/types';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
  const me = useAppStore((s) => s.me);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <>
      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
        <span className="max-w-[12rem] truncate font-medium text-foreground lg:max-w-[18rem]">{me.name}</span>
        <Badge variant="outline" className="hidden shrink-0 text-xs font-normal lg:inline-flex">
          {ROLE_LABELS[me.role]}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-muted-foreground sm:h-9 sm:w-9"
        onClick={() => {
          logout();
          navigate('/login');
        }}
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </>
  );
}
