import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Topbar } from "@/components/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { apiUrl } from "@/lib/api";
import { LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import { can } from "@/lib/rbac";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { ClipboardList, RefreshCw } from "lucide-react";

type DeliveryStatus = "not_started" | "in_progress" | "quality_check" | "final_approval" | "delivered";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  quality_check: "Quality check",
  final_approval: "Final approval",
  delivered: "Delivered",
};

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  not_started: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  quality_check: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  final_approval: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

type DealRow = {
  id: string;
  name: string;
  customerId: string;
  customerName?: string;
  ownerUserId: string;
  ownerName?: string;
  stage: string;
  dealStatus: string;
  deliveryStatus?: string | null;
  deliveryUpdatedAt?: string | null;
  deliveryAssigneeUserId?: string | null;
  deliveryAssigneeName?: string | null;
};

type DeliveryLogRow = {
  id: string;
  dealId: string;
  customerId: string;
  fromStatus?: string | null;
  toStatus: string;
  notes?: string | null;
  performedBy?: string | null;
  performedByName?: string | null;
  at: string;
};

async function fetchDealsForDelivery(me: { role: string; id: string; teamId: string; regionId: string }) {
  const qs = new URLSearchParams();
  qs.set("actorRole", me.role);
  qs.set("actorUserId", me.id);
  qs.set("actorTeamId", me.teamId);
  qs.set("actorRegionId", me.regionId);
  const res = await fetch(apiUrl(`/api/deals?${qs.toString()}`));
  if (!res.ok) throw new Error("Failed to load deals");
  return (await res.json()) as DealRow[];
}

async function fetchDeliveryDetail(dealId: string) {
  const res = await fetch(apiUrl(`/api/delivery/deal/${encodeURIComponent(dealId)}`));
  if (!res.ok) throw new Error("Failed to load delivery details");
  return (await res.json()) as {
    dealId: string;
    deliveryStatus: string | null;
    deliveryUpdatedAt: string | null;
    logs: DeliveryLogRow[];
  };
}

export default function DeliveryPage() {
  const qc = useQueryClient();
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const users = useAppStore((s) => s.users);

  const canView = can(me.role, "delivery", "view") || can(me.role, "deals", "view");
  const canUpdate = can(me.role, "delivery", "update") || me.role === "super_admin";
  const canAssign = me.role === "super_admin" || me.role === "sales_manager" || me.role === "finance";

  const deliveryManagers = useMemo(
    () => users.filter((u) => u.status === "active" && u.role === "delivery_manager"),
    [users],
  );

  const dealsQ = useQuery({
    queryKey: ["delivery", "deals", me.role, me.id, me.teamId, me.regionId],
    queryFn: () => fetchDealsForDelivery(me),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });

  const [dealFilter, setDealFilter] = useState<"all" | "active" | "won">("all");
  const [draftDealFilter, setDraftDealFilter] = useState<"all" | "active" | "won">("all");

  useEffect(() => {
    setDraftDealFilter(dealFilter);
  }, [dealFilter]);

  const hasPendingFilterChanges = draftDealFilter !== dealFilter;

  const rows = useMemo(() => {
    const all = dealsQ.data ?? [];
    const enriched = all.map((d) => ({
      ...d,
      customerName: customers.find((c) => c.id === d.customerId)?.companyName ?? "—",
      ownerName: users.find((u) => u.id === d.ownerUserId)?.name ?? "—",
    }));
    const normalized = enriched.filter((d) => !String(d.dealStatus || "").toLowerCase().includes("lost"));
    const filtered = normalized.filter((d) => {
      const ds = String(d.dealStatus || "").toLowerCase();
      const st = String(d.stage || "").toLowerCase();
      const isWon = ds.includes("won") || st === "won";
      const isActive = ds === "" || ds.includes("active") || ds.includes("hot") || ds.includes("cold") || ds.includes("pending");
      if (dealFilter === "won") return isWon;
      if (dealFilter === "active") return isActive;
      return true;
    });
    return filtered.sort((a, b) => String(b.deliveryUpdatedAt || "").localeCompare(String(a.deliveryUpdatedAt || "")));
  }, [dealsQ.data, customers, users]);

  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<DeliveryStatus>("in_progress");
  const [notes, setNotes] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState<string>("unassigned");

  const detailQ = useQuery({
    queryKey: ["delivery", "detail", openDealId],
    queryFn: () => fetchDeliveryDetail(openDealId!),
    enabled: !!openDealId,
  });

  const assignM = useMutation({
    mutationFn: async (args: { dealId: string; assigneeUserId: string | null }) => {
      const assignee =
        args.assigneeUserId ? users.find((u) => u.id === args.assigneeUserId) ?? null : null;
      const res = await fetch(apiUrl(`/api/deals/${encodeURIComponent(args.dealId)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorRole: me.role,
          actorUserId: me.id,
          actorTeamId: me.teamId,
          actorRegionId: me.regionId,
          changedByUserId: me.id,
          changedByName: me.name,
          // preserve required deal fields? API merges from body; it expects full deal payload in current codepath.
          // We'll patch by sending minimal fields that are merged into `deal` object via existing merge logic in server.
          deliveryAssigneeUserId: assignee?.id ?? null,
          deliveryAssigneeName: assignee?.name ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to assign");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Delivery assigned" });
      await qc.invalidateQueries({ queryKey: ["delivery", "deals"] });
    },
  });

  const transitionM = useMutation({
    mutationFn: async (args: { dealId: string; toStatus: DeliveryStatus; notes?: string }) => {
      const res = await fetch(apiUrl(`/api/delivery/deal/${encodeURIComponent(args.dealId)}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: args.toStatus,
          notes: args.notes || null,
          actorRole: me.role,
          actorUserId: me.id,
          actorName: me.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Delivery updated" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["delivery", "deals"] }),
        qc.invalidateQueries({ queryKey: ["delivery", "detail", openDealId] }),
      ]);
    },
  });

  if (!canView) {
    return (
      <>
        <Topbar title="Delivery" subtitle="You do not have access to delivery management." />
        <p className="text-sm text-muted-foreground">Ask an admin to grant delivery access.</p>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Delivery"
        subtitle="Manage post-sales delivery stages for won deals"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={draftDealFilter} onValueChange={(v) => setDraftDealFilter(v as typeof dealFilter)}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deals</SelectItem>
                <SelectItem value="active">Active pipeline</SelectItem>
                <SelectItem value="won">Won</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={!hasPendingFilterChanges}
              onClick={() => setDealFilter(draftDealFilter)}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => dealsQ.refetch()}
              disabled={dealsQ.isFetching}
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", dealsQ.isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <Card className="border border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Deal</TableHead>
                <TableHead className="text-xs">Customer</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
                      <TableHead className="text-xs">Delivery</TableHead>
                      <TableHead className="text-xs">Assignee</TableHead>
                <TableHead className="text-xs">Updated</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dealsQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No deals in scope for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((d) => {
                  const st = (String(d.deliveryStatus || "not_started") as DeliveryStatus) || "not_started";
                  return (
                    <TableRow key={d.id} className="hover:bg-muted/40">
                      <TableCell className="text-sm font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.ownerName}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[st])}>
                          {STATUS_LABELS[st]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.deliveryAssigneeName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.deliveryUpdatedAt ? new Date(String(d.deliveryUpdatedAt)).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            setOpenDealId(d.id);
                            setNextStatus(st === "not_started" ? "in_progress" : st);
                            setNotes("");
                            setAssigneeUserId(d.deliveryAssigneeUserId ?? "unassigned");
                          }}
                        >
                          <ClipboardList className="h-4 w-4 mr-1.5" />
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!openDealId}
        onOpenChange={(o) => {
          if (!o) setOpenDealId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery management</DialogTitle>
          </DialogHeader>

          {detailQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : detailQ.error ? (
            <p className="text-sm text-destructive">{(detailQ.error as Error).message}</p>
          ) : (
            <>
              {canAssign && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-1">
                    <p className="text-xs text-muted-foreground">Delivery assignee</p>
                    <Select
                      value={assigneeUserId}
                      onValueChange={setAssigneeUserId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {deliveryManagers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {deliveryManagers.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        No delivery managers found. Create a user with role “Delivery Manager” first.
                      </p>
                    )}
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={!openDealId || assignM.isPending || (assigneeUserId !== "unassigned" && deliveryManagers.length === 0)}
                        onClick={() => {
                          if (!openDealId) return;
                          assignM.mutate({
                            dealId: openDealId,
                            assigneeUserId: assigneeUserId === "unassigned" ? null : assigneeUserId,
                          });
                        }}
                      >
                        Assign
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-1">
                  <p className="text-xs text-muted-foreground">Set status</p>
                  <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as DeliveryStatus)} disabled={!canUpdate}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["not_started", "in_progress", "quality_check", "final_approval", "delivered"] as DeliveryStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!canUpdate && (
                    <p className="text-[11px] text-muted-foreground">You don’t have permission to change delivery status.</p>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes for this transition…" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setOpenDealId(null)}>
                  Close
                </Button>
                <Button
                  disabled={!canUpdate || !openDealId || transitionM.isPending}
                  onClick={() => {
                    if (!openDealId) return;
                    transitionM.mutate({ dealId: openDealId, toStatus: nextStatus, notes });
                  }}
                >
                  Save
                </Button>
              </div>

              <div className="pt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Logs</p>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">At</TableHead>
                        <TableHead className="text-xs">From → To</TableHead>
                        <TableHead className="text-xs">By</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detailQ.data?.logs ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                            No logs yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (detailQ.data?.logs ?? []).map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(l.at).toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell className="text-sm">
                              <Badge variant="outline" className="text-[10px]">
                                {String(l.fromStatus || "—")} → {String(l.toStatus)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{l.performedByName || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{l.notes || "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

