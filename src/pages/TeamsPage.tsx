import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { apiUrl } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import { toast } from "@/components/ui/use-toast";
import { pageEnter, hoverLift, tapPress } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { SalesGroup } from "@/types";
import { ShieldAlert, Users, UsersRound, Crown, Plus } from "lucide-react";

export default function TeamsPage() {
  const me = useAppStore((s) => s.me);
  const teams = useAppStore((s) => s.teams);
  const setTeams = useAppStore((s) => s.setTeams);
  const groups = useAppStore((s) => s.groups);
  const setGroups = useAppStore((s) => s.setGroups);
  const regions = useAppStore((s) => s.regions);
  const users = useAppStore((s) => s.users);

  const [tab, setTab] = useState<"teams" | "groups">("teams");

  // Teams form
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Groups form
  const [groupName, setGroupName] = useState("");
  const [groupTeamId, setGroupTeamId] = useState(teams[0]?.id ?? "");
  const [groupAdminId, setGroupAdminId] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const teamsQuery = useQuery({
    queryKey: QK.teams(),
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/teams"));
      if (!res.ok) throw new Error("Failed to load teams");
      return res.json() as Promise<import("@/types").Team[]>;
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const groupsQuery = useQuery({
    queryKey: QK.groups(),
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/groups"));
      if (!res.ok) throw new Error("Failed to load groups");
      return res.json() as Promise<SalesGroup[]>;
    },
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (teamsQuery.data) setTeams(teamsQuery.data);
  }, [teamsQuery.data, setTeams]);

  useEffect(() => {
    if (groupsQuery.data) setGroups(groupsQuery.data);
  }, [groupsQuery.data, setGroups]);

  useEffect(() => {
    if (!regionId && regions[0]?.id) setRegionId(regions[0].id);
  }, [regions, regionId]);

  useEffect(() => {
    if (!groupTeamId && teams[0]?.id) setGroupTeamId(teams[0].id);
  }, [teams, groupTeamId]);

  const activeUsers = useMemo(
    () => users.filter((u) => u.status === "active"),
    [users],
  );

  const usersOnGroupTeam = useMemo(
    () => activeUsers.filter((u) => !groupTeamId || u.teamId === groupTeamId),
    [activeUsers, groupTeamId],
  );

  const createTeamMutation = useMutation({
    mutationFn: async (payload: { name: string; regionId: string }) => {
      const res = await fetch(apiUrl("/api/teams"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create team");
    },
    onSuccess: () => void teamsQuery.refetch(),
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; regionId: string }) => {
      const res = await fetch(apiUrl(`/api/teams/${payload.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update team");
    },
    onSuccess: () => void teamsQuery.refetch(),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/teams/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => void teamsQuery.refetch(),
  });

  const createGroupMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      teamId: string;
      adminUserId: string;
      memberUserIds: string[];
    }) => {
      const res = await fetch(apiUrl("/api/groups"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create group");
      }
    },
    onSuccess: () => void groupsQuery.refetch(),
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      teamId: string;
      adminUserId: string;
      memberUserIds: string[];
    }) => {
      const res = await fetch(apiUrl(`/api/groups/${payload.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update group");
      }
    },
    onSuccess: () => void groupsQuery.refetch(),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/groups/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete group");
    },
    onSuccess: () => void groupsQuery.refetch(),
  });

  const resetGroupForm = () => {
    setGroupName("");
    setGroupTeamId(teams[0]?.id ?? "");
    setGroupAdminId("");
    setGroupMemberIds([]);
    setEditingGroupId(null);
  };

  const toggleMember = (userId: string, checked: boolean) => {
    setGroupMemberIds((prev) => {
      if (checked) return prev.includes(userId) ? prev : [...prev, userId];
      return prev.filter((id) => id !== userId);
    });
  };

  if (me.role !== "super_admin") {
    return (
      <>
        <Topbar title="Teams" />
        <div className="space-y-4">
          <Card className="border border-border bg-card">
            <CardContent className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
              <ShieldAlert className="h-5 w-5" />
              <p className="text-sm">Access denied. Only Super Admin can manage teams and groups.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Teams" subtitle="Teams and sales groups" />
      <motion.div {...pageEnter} className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "teams" | "groups")}>
          <TabsList className="h-9">
            <TabsTrigger value="teams" className="gap-1.5 text-xs">
              <UsersRound className="h-3.5 w-3.5" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Groups
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="teams" className="mt-3 space-y-3 outline-none">
              <motion.div
                key="teams-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <Card className="border border-border bg-card">
                  <CardContent className="flex flex-wrap items-end gap-2 p-4">
                    <div className="min-w-[12rem] flex-1">
                      <p className="mb-1 text-xs text-muted-foreground">Team name</p>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
                    </div>
                    <div className="w-48">
                      <p className="mb-1 text-xs text-muted-foreground">Region</p>
                      <Select value={regionId} onValueChange={setRegionId}>
                        <SelectTrigger>
                          <SelectValue />
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
                    <motion.div whileHover={hoverLift} whileTap={tapPress}>
                      <Button
                        onClick={() => {
                          if (!name.trim() || !regionId) return;
                          if (editingId) {
                            updateTeamMutation.mutate({ id: editingId, name: name.trim(), regionId });
                            toast({ title: "Team updated" });
                          } else {
                            createTeamMutation.mutate({ name: name.trim(), regionId });
                            toast({ title: "Team created" });
                          }
                          setName("");
                          setEditingId(null);
                        }}
                      >
                        {editingId ? "Save" : "Add Team"}
                      </Button>
                    </motion.div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border border-border bg-card">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Team Name</TableHead>
                          <TableHead className="text-xs">ID</TableHead>
                          <TableHead className="text-xs">Region</TableHead>
                          <TableHead className="text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {teams.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="text-sm font-medium">{t.name}</TableCell>
                              <TableCell className="font-mono text-[11px] text-muted-foreground">{t.id}</TableCell>
                              <TableCell className="text-sm">{regions.find((r) => r.id === t.regionId)?.name}</TableCell>
                              <TableCell className="w-[140px]">
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setEditingId(t.id);
                                      setName(t.name);
                                      setRegionId(t.regionId);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => {
                                      deleteTeamMutation.mutate(t.id);
                                      toast({ title: "Team deleted" });
                                    }}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            <TabsContent value="groups" className="mt-3 space-y-3 outline-none">
              <motion.div
                key="groups-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <Card className="border border-border bg-card">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{editingGroupId ? "Edit group" : "Create group"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Group admins can view Executive Performance and scoped data for their members.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Group name</Label>
                        <Input
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="North sales pod"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Parent team</Label>
                        <Select
                          value={groupTeamId}
                          onValueChange={(v) => {
                            setGroupTeamId(v);
                            setGroupAdminId("");
                            setGroupMemberIds([]);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                        <Label className="text-xs">Group admin</Label>
                        <Select value={groupAdminId} onValueChange={setGroupAdminId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select admin" />
                          </SelectTrigger>
                          <SelectContent>
                            {usersOnGroupTeam.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name} · {u.role.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Members</Label>
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                        {usersOnGroupTeam.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-muted-foreground">No users on this team.</p>
                        ) : (
                          usersOnGroupTeam.map((u) => {
                            const checked = groupMemberIds.includes(u.id) || u.id === groupAdminId;
                            return (
                              <label
                                key={u.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/40",
                                  checked && "bg-primary/5",
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={u.id === groupAdminId}
                                  onCheckedChange={(v) => toggleMember(u.id, v === true)}
                                />
                                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                                {u.id === groupAdminId ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                                    <Crown className="h-3 w-3" /> Admin
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {u.role.replace(/_/g, " ")}
                                  </span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <motion.div whileHover={hoverLift} whileTap={tapPress}>
                        <Button
                          disabled={!groupName.trim() || !groupTeamId || !groupAdminId}
                          onClick={() => {
                            const members = Array.from(new Set([...groupMemberIds, groupAdminId]));
                            const payload = {
                              name: groupName.trim(),
                              teamId: groupTeamId,
                              adminUserId: groupAdminId,
                              memberUserIds: members,
                            };
                            if (editingGroupId) {
                              updateGroupMutation.mutate(
                                { id: editingGroupId, ...payload },
                                {
                                  onSuccess: () => {
                                    toast({ title: "Group updated" });
                                    resetGroupForm();
                                  },
                                  onError: (e) =>
                                    toast({
                                      title: "Update failed",
                                      description: e instanceof Error ? e.message : "Try again",
                                      variant: "destructive",
                                    }),
                                },
                              );
                            } else {
                              createGroupMutation.mutate(payload, {
                                onSuccess: () => {
                                  toast({ title: "Group created" });
                                  resetGroupForm();
                                },
                                onError: (e) =>
                                  toast({
                                    title: "Create failed",
                                    description: e instanceof Error ? e.message : "Try again",
                                    variant: "destructive",
                                  }),
                              });
                            }
                          }}
                        >
                          {editingGroupId ? "Save group" : "Create group"}
                        </Button>
                      </motion.div>
                      {editingGroupId ? (
                        <Button variant="outline" onClick={resetGroupForm}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border border-border bg-card">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Group</TableHead>
                          <TableHead className="text-xs">Team</TableHead>
                          <TableHead className="text-xs">Admin</TableHead>
                          <TableHead className="text-xs">Members</TableHead>
                          <TableHead className="text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                              No groups yet. Create one to assign a group admin.
                            </TableCell>
                          </TableRow>
                        ) : (
                          groups.map((g) => {
                            const admin = users.find((u) => u.id === g.adminUserId);
                            const team = teams.find((t) => t.id === g.teamId);
                            return (
                              <TableRow key={g.id}>
                                <TableCell className="text-sm font-medium">{g.name}</TableCell>
                                <TableCell className="text-sm">{team?.name ?? "—"}</TableCell>
                                <TableCell className="text-sm">
                                  <span className="inline-flex items-center gap-1">
                                    <Crown className="h-3 w-3 text-amber-600" />
                                    {admin?.name ?? "—"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm tabular-nums">{g.memberUserIds?.length ?? 0}</TableCell>
                                <TableCell className="w-[140px]">
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEditingGroupId(g.id);
                                        setGroupName(g.name);
                                        setGroupTeamId(g.teamId);
                                        setGroupAdminId(g.adminUserId);
                                        setGroupMemberIds(g.memberUserIds ?? []);
                                        setTab("groups");
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-destructive"
                                      onClick={() => {
                                        deleteGroupMutation.mutate(g.id, {
                                          onSuccess: () => toast({ title: "Group deleted" }),
                                        });
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </motion.div>
    </>
  );
}
