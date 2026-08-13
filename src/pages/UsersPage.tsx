import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { FilterPanel } from "@/components/FilterPanel";
import { StatusPill } from "@/components/StatusPill";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { apiUrl } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { hoverLift, pageEnter, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { useSmUp } from "@/hooks/useSmUp";
import { ROLE_LABELS, type Role, type User } from "@/types";
import {
  Eye,
  EyeOff,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";

function UserKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const isPlainInt = /^\d+$/.test(String(value).trim());
  const inner = (
    <>
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
          {isPlainInt ? <CountUp value={Number(value)} /> : value}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        variants={staggerItem}
        whileHover={hoverLift}
        whileTap={tapPress}
        className={cn(
          "card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0",
          active && "border-primary/40 bg-primary/5",
        )}
      >
        {inner}
      </motion.button>
    );
  }
  return (
    <motion.div variants={staggerItem} className="card-kpi min-h-[3.25rem] w-full sm:min-h-0">
      {inner}
    </motion.div>
  );
}

export default function UsersPage() {
  const smUp = useSmUp();
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const setUsers = useAppStore((s) => s.setUsers);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
  const updateUserRole = useAppStore((s) => s.updateUserRole);
  const updateUserStatus = useAppStore((s) => s.updateUserStatus);
  const updatePassword = useAppStore((s) => s.updatePassword);
  const updateUserAssignment = useAppStore((s) => s.updateUserAssignment);
  const updateUserContactInfo = useAppStore((s) => s.updateUserContactInfo);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [showPasswordFor, setShowPasswordFor] = useState<Record<string, boolean>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [disableTarget, setDisableTarget] = useState<User | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");
  const [contactDrafts, setContactDrafts] = useState<Record<string, { email: string; phone: string }>>({});

  useEffect(() => {
    setContactDrafts(Object.fromEntries(users.map((u) => [u.id, { email: u.email, phone: u.phone ?? "" }])));
  }, [users]);

  const usersQuery = useQuery({
    queryKey: QK.users(),
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/users"));
      if (!res.ok) throw new Error("Failed to load users");
      return res.json() as Promise<User[]>;
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload: User) => {
      const res = await fetch(apiUrl(`/api/users/${payload.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => usersQuery.refetch(),
  });

  useEffect(() => {
    if (!usersQuery.data) return;
    setUsers(usersQuery.data);
  }, [usersQuery.data, setUsers]);

  const persistUser = (userId: string) => {
    const user = useAppStore.getState().users.find((x) => x.id === userId);
    if (user) updateUserMutation.mutate(user);
  };

  const handlePasswordChange = (userId: string) => {
    const newPassword = passwordEdits[userId];
    if (!newPassword || newPassword.length < 4) {
      setPasswordErrors((prev) => ({ ...prev, [userId]: "Password must be at least 4 characters" }));
      return;
    }
    try {
      updatePassword(userId, null, newPassword);
      persistUser(userId);
      setPasswordEdits((prev) => ({ ...prev, [userId]: "" }));
      setPasswordErrors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to update password";
      setPasswordErrors((prev) => ({ ...prev, [userId]: message }));
    }
  };

  const handleSaveContact = (userId: string) => {
    const draft = contactDrafts[userId];
    if (!draft) return;
    if (!draft.email.trim()) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    try {
      updateUserContactInfo(userId, { email: draft.email.trim(), phone: draft.phone });
      persistUser(userId);
      toast({ title: "Contact updated" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to update contact";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    }
  };

  const handleRoleChange = (userId: string, role: Role) => {
    updateUserRole(userId, role);
    persistUser(userId);
  };

  const handleTeamChange = (user: User, teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    updateUserAssignment(user.id, { teamId, ...(team?.regionId ? { regionId: team.regionId } : {}) });
    persistUser(user.id);
  };

  const handleRegionChange = (user: User, regionId: string) => {
    const validTeams = teams.filter((t) => t.regionId === regionId);
    const nextTeamId = validTeams.some((t) => t.id === user.teamId) ? user.teamId : (validTeams[0]?.id ?? "");
    updateUserAssignment(user.id, { regionId, ...(nextTeamId ? { teamId: nextTeamId } : {}) });
    persistUser(user.id);
  };

  const handleStatusToggle = (user: User, checked: boolean) => {
    if (checked) {
      updateUserStatus(user.id, "active");
      persistUser(user.id);
      return;
    }
    setDisableTarget(user);
    setTransferToUserId("");
  };

  const activeCount = useMemo(() => users.filter((u) => u.status === "active").length, [users]);
  const disabledCount = useMemo(() => users.filter((u) => u.status === "disabled").length, [users]);
  const adminCount = useMemo(() => users.filter((u) => u.role === "super_admin").length, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (teamFilter !== "all" && u.teamId !== teamFilter) return false;
      if (regionFilter !== "all" && u.regionId !== regionFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, search, statusFilter, roleFilter, teamFilter, regionFilter]);

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "all" || roleFilter !== "all" || teamFilter !== "all" || regionFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
    setTeamFilter("all");
    setRegionFilter("all");
  };

  const renderContact = (u: User) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Input
        type="email"
        className="h-8 text-xs"
        placeholder="Sign-in email"
        value={contactDrafts[u.id]?.email ?? u.email}
        onChange={(e) =>
          setContactDrafts((prev) => ({
            ...prev,
            [u.id]: { email: e.target.value, phone: prev[u.id]?.phone ?? u.phone ?? "" },
          }))
        }
      />
      <div className="flex gap-1">
        <Input
          className="h-8 min-w-0 flex-1 text-xs"
          placeholder="Phone"
          value={contactDrafts[u.id]?.phone ?? u.phone ?? ""}
          onChange={(e) =>
            setContactDrafts((prev) => ({
              ...prev,
              [u.id]: { email: prev[u.id]?.email ?? u.email, phone: e.target.value },
            }))
          }
        />
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-xs"
          onClick={() => handleSaveContact(u.id)}
          disabled={updateUserMutation.isPending}
        >
          Save
        </Button>
      </div>
    </div>
  );

  const renderRole = (u: User) => (
    <Select value={u.role} onValueChange={(value) => handleRoleChange(u.id, value as Role)}>
      <SelectTrigger className="h-8 text-xs">
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
  );

  const renderTeam = (u: User) => (
    <Select value={u.teamId} onValueChange={(teamId) => handleTeamChange(u, teamId)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Team" />
      </SelectTrigger>
      <SelectContent>
        {teams
          .filter((t) => t.regionId === u.regionId)
          .map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );

  const renderRegion = (u: User) => (
    <Select value={u.regionId} onValueChange={(regionId) => handleRegionChange(u, regionId)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Region" />
      </SelectTrigger>
      <SelectContent>
        {regions.map((r) => (
          <SelectItem key={r.id} value={r.id} className="text-xs">
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderSecurity = (u: User) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Switch checked={u.status === "active"} onCheckedChange={(checked) => handleStatusToggle(u, checked)} />
        <span className="text-[11px] text-muted-foreground">{u.status === "active" ? "Can sign in" : "Sign in disabled"}</span>
      </div>
      <div className="space-y-1">
        <div className="flex gap-1">
          <div className="relative min-w-0 flex-1">
            <Input
              type={showPasswordFor[u.id] ? "text" : "password"}
              placeholder="New password"
              className="h-8 pr-9 text-xs"
              value={passwordEdits[u.id] ?? ""}
              onChange={(e) => setPasswordEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPasswordFor((prev) => ({ ...prev, [u.id]: !prev[u.id] }))}
              aria-label={showPasswordFor[u.id] ? "Hide password" : "Show password"}
            >
              {showPasswordFor[u.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button size="sm" className="h-8 shrink-0 px-2.5 text-xs" type="button" onClick={() => handlePasswordChange(u.id)}>
            Update
          </Button>
        </div>
        {passwordErrors[u.id] && <p className="text-[11px] text-destructive">{passwordErrors[u.id]}</p>}
      </div>
    </div>
  );

  if (me.role !== "super_admin") {
    return (
      <>
        <Topbar title="Users" />
        <div className="card-soft flex items-center justify-center gap-3 px-4 py-12 text-muted-foreground">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p className="text-sm">Access denied. Only Super Admin can manage users.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Users" subtitle={smUp ? `${users.length} accounts` : undefined} />
      <motion.div {...pageEnter} className="space-y-3">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2"
        >
          <UserKpiCard
            label="Total"
            value={String(users.length)}
            sub="All accounts"
            icon={Users}
            iconColor="text-primary"
            iconBg="bg-primary/15"
            active={!hasActiveFilters}
            onClick={clearFilters}
          />
          <UserKpiCard
            label="Active"
            value={String(activeCount)}
            sub="Can sign in"
            icon={UserCheck}
            iconColor="text-success"
            iconBg="bg-success/15"
            active={statusFilter === "active"}
            onClick={() => setStatusFilter((s) => (s === "active" ? "all" : "active"))}
          />
          <UserKpiCard
            label="Disabled"
            value={String(disabledCount)}
            sub="Sign-in blocked"
            icon={UserX}
            iconColor="text-destructive"
            iconBg="bg-destructive/15"
            active={statusFilter === "disabled"}
            onClick={() => setStatusFilter((s) => (s === "disabled" ? "all" : "disabled"))}
          />
          <UserKpiCard
            label="Admins"
            value={String(adminCount)}
            sub="Super Admin"
            icon={Shield}
            iconColor="text-info"
            iconBg="bg-info/15"
            active={roleFilter === "super_admin"}
            onClick={() => setRoleFilter((r) => (r === "super_admin" ? "all" : "super_admin"))}
          />
        </motion.div>

        <FilterPanel
          title="Filters"
          storageKey="ui:users:filtersOpen"
          defaultOpen={smUp}
          headerActions={
            hasActiveFilters ? (
              <div className="scrollbar-none flex min-w-0 flex-wrap items-center justify-end gap-1 overflow-x-auto">
                {search.trim() ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    “{search.trim()}”
                  </span>
                ) : null}
                {statusFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                    {statusFilter}
                  </span>
                ) : null}
                {roleFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ROLE_LABELS[roleFilter]}
                  </span>
                ) : null}
                {teamFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {teams.find((t) => t.id === teamFilter)?.name ?? "Team"}
                  </span>
                ) : null}
                {regionFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {regions.find((r) => r.id === regionFilter)?.name ?? "Region"}
                  </span>
                ) : null}
              </div>
            ) : null
          }
        >
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8 text-sm"
                  placeholder="Search name, email, phone, ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1">
                {(
                  [
                    { value: "all", label: "All" },
                    { value: "active", label: `Active (${activeCount})` },
                    { value: "disabled", label: `Disabled (${disabledCount})` },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatusFilter(s.value)}
                    className={cn(
                      "h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors",
                      statusFilter === s.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | "all")}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                Clear
              </Button>
            </div>
          </div>
        </FilterPanel>

        {!smUp ? (
          <div className="card-soft overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No users match your filters</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((u) => (
                  <div key={u.id} className="space-y-2.5 px-2.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{u.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{u.id}</p>
                      </div>
                      <StatusPill tone={u.status === "active" ? "success" : "danger"} className="shrink-0 capitalize">
                        {u.status === "active" ? "Active" : "Disabled"}
                      </StatusPill>
                    </div>
                    {renderContact(u)}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {renderRole(u)}
                      {renderTeam(u)}
                      {renderRegion(u)}
                    </div>
                    {renderSecurity(u)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card-soft overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No users match your filters</p>
            ) : (
              <div className="scrollbar-soft overflow-x-auto">
                <Table responsiveShell={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase tracking-wide">Name</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">ID</TableHead>
                      <TableHead className="min-w-[220px] text-[10px] uppercase tracking-wide">Email / phone</TableHead>
                      <TableHead className="min-w-[140px] text-[10px] uppercase tracking-wide">Role</TableHead>
                      <TableHead className="min-w-[140px] text-[10px] uppercase tracking-wide">Team</TableHead>
                      <TableHead className="min-w-[140px] text-[10px] uppercase tracking-wide">Region</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">Status</TableHead>
                      <TableHead className="min-w-[240px] text-[10px] uppercase tracking-wide">Security</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((u) => (
                      <TableRow key={u.id} className="align-top">
                        <TableCell className="text-sm font-medium">{u.name}</TableCell>
                        <TableCell className="font-mono-id text-[11px] text-muted-foreground">{u.id}</TableCell>
                        <TableCell>{renderContact(u)}</TableCell>
                        <TableCell>{renderRole(u)}</TableCell>
                        <TableCell>{renderTeam(u)}</TableCell>
                        <TableCell>{renderRegion(u)}</TableCell>
                        <TableCell>
                          <StatusPill tone={u.status === "active" ? "success" : "danger"} className="capitalize">
                            {u.status === "active" ? "Active" : "Disabled"}
                          </StatusPill>
                        </TableCell>
                        <TableCell>{renderSecurity(u)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <p className="hidden text-[11px] text-muted-foreground sm:block">Only Super Admin can manage users in V1.</p>
      </motion.div>

      <AlertDialog
        open={!!disableTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDisableTarget(null);
            setTransferToUserId("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user and transfer ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              Disabling an employee triggers a transfer workflow. Select the replacement user to receive this user’s active
              deals and proposals.
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
                  .filter((x) => x.status === "active" && x.id !== disableTarget?.id)
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
                updateUserStatus(disableTarget.id, "disabled", { transferToUserId });
                persistUser(disableTarget.id);
                setDisableTarget(null);
                setTransferToUserId("");
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
