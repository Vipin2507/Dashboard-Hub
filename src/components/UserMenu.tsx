import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/store/useAppStore';
import { ROLE_LABELS } from '@/types';
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function UserMenu() {
  const me = useAppStore((s) => s.me);
  const authUserId = useAppStore((s) => s.authUserId);
  const logout = useAppStore((s) => s.logout);
  const updatePassword = useAppStore((s) => s.updatePassword);
  const navigate = useNavigate();

  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [nextPwd, setNextPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUserId) return;
    if (nextPwd !== confirmPwd) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (nextPwd.length < 4) {
      toast.error('New password must be at least 4 characters');
      return;
    }
    setPwdBusy(true);
    try {
      updatePassword(authUserId, currentPwd, nextPwd);
      toast.success('Password updated');
      setPwdOpen(false);
      setCurrentPwd('');
      setNextPwd('');
      setConfirmPwd('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <>
      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
        <span className="max-w-[12rem] truncate font-medium text-foreground lg:max-w-[18rem]">{me.name}</span>
        <Badge variant="outline" className="hidden shrink-0 text-xs font-normal lg:inline-flex">
          {ROLE_LABELS[me.role]}
        </Badge>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 gap-1 px-2 text-muted-foreground sm:h-9"
            aria-label="Account menu"
          >
            <User className="h-4 w-4 shrink-0" />
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setPwdOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur-pwd">Current password</Label>
              <Input
                id="cur-pwd"
                type="password"
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pwd">New password</Label>
              <Input
                id="new-pwd"
                type="password"
                autoComplete="new-password"
                value={nextPwd}
                onChange={(e) => setNextPwd(e.target.value)}
                required
                minLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-pwd">Confirm new password</Label>
              <Input
                id="cf-pwd"
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
                minLength={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwdOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pwdBusy}>
                {pwdBusy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
