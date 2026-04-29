import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/store/useAppStore';
import { ROLE_LABELS } from '@/types';
import { ChevronDown, LogOut, User, UserPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { dialogSmMaxMd } from '@/lib/dialogLayout';
import { cn } from '@/lib/utils';

const GUEST_ID = '__guest__';

export function UserMenu() {
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
  const authUserId = useAppStore((s) => s.authUserId);
  const logout = useAppStore((s) => s.logout);
  const updatePassword = useAppStore((s) => s.updatePassword);
  const updateUserContactInfo = useAppStore((s) => s.updateUserContactInfo);
  const updateUserAssignment = useAppStore((s) => s.updateUserAssignment);
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regionId, setRegionId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [nextPwd, setNextPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [busy, setBusy] = useState(false);

  const profileUser = users.find((u) => u.id === me.id);
  const canEditProfile = Boolean(authUserId && me.id !== GUEST_ID && profileUser);

  useEffect(() => {
    if (!profileOpen) return;
    const u = useAppStore.getState().users.find((x) => x.id === me.id);
    if (!u) return;
    setName(u.name);
    setEmail(u.email);
    setPhone(u.phone ?? '');
    setRegionId(u.regionId);
    setTeamId(u.teamId);
    setCurrentPwd('');
    setNextPwd('');
    setConfirmPwd('');
  }, [profileOpen, me.id]);

  const teamsInRegion = teams.filter((t) => t.regionId === regionId);

  const handleRegionChange = (rid: string) => {
    setRegionId(rid);
    const valid = teams.filter((t) => t.regionId === rid);
    setTeamId((prev) => (valid.some((t) => t.id === prev) ? prev : (valid[0]?.id ?? '')));
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileUser) return;
    const uid = profileUser.id;

    const pwdAny = currentPwd.length > 0 || nextPwd.length > 0 || confirmPwd.length > 0;
    if (pwdAny) {
      if (!currentPwd || !nextPwd || !confirmPwd) {
        toast.error('To change password, fill current, new, and confirm');
        return;
      }
      if (nextPwd !== confirmPwd) {
        toast.error('New password and confirmation do not match');
        return;
      }
      if (nextPwd.length < 4) {
        toast.error('New password must be at least 4 characters');
        return;
      }
    }

    setBusy(true);
    try {
      updateUserContactInfo(uid, { name: name.trim(), email: email.trim(), phone });

      const teamChanged = teamId !== profileUser.teamId;
      const regionChanged = regionId !== profileUser.regionId;
      if (teamChanged || regionChanged) {
        updateUserAssignment(uid, { regionId, teamId });
      }

      if (pwdAny) {
        updatePassword(uid, currentPwd, nextPwd);
      }

      toast.success('Profile updated');
      setProfileOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setBusy(false);
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
          {canEditProfile && (
            <DropdownMenuItem
              onSelect={() => {
                setProfileOpen(true);
              }}
            >
              <UserPen className="mr-2 h-4 w-4" />
              Edit profile
            </DropdownMenuItem>
          )}
          {canEditProfile && <DropdownMenuSeparator />}
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

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className={cn(dialogSmMaxMd, 'flex max-h-[90vh] flex-col p-0 sm:max-h-[85vh]')}>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update your name, sign-in email, phone, team, and region. Optionally change your password below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Sign-in email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select value={regionId} onValueChange={handleRegionChange}>
                    <SelectTrigger id="profile-region">
                      <SelectValue placeholder="Region" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamId} onValueChange={setTeamId}>
                    <SelectTrigger id="profile-team">
                      <SelectValue placeholder="Team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamsInRegion.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">Change password (optional)</p>
                <div className="space-y-2">
                  <Label htmlFor="profile-cur-pwd" className="text-xs">
                    Current password
                  </Label>
                  <Input
                    id="profile-cur-pwd"
                    type="password"
                    autoComplete="current-password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-new-pwd" className="text-xs">
                    New password
                  </Label>
                  <Input
                    id="profile-new-pwd"
                    type="password"
                    autoComplete="new-password"
                    value={nextPwd}
                    onChange={(e) => setNextPwd(e.target.value)}
                    minLength={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-cf-pwd" className="text-xs">
                    Confirm new password
                  </Label>
                  <Input
                    id="profile-cf-pwd"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    minLength={4}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Role ({ROLE_LABELS[me.role]}) is set by an administrator and cannot be changed here.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
