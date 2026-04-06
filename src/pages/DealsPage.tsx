import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { can, getScope, visibleWithScope, formatINR } from "@/lib/rbac";
import { canDeleteDeal, canEditDeal, dealStatusOptionsForRole, isDealSuperAdmin } from "@/lib/dealPermissions";
import { apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useUpdateDealStage } from "@/hooks/useWorkflow";
import {
  DEAL_STATUSES,
  DEAL_STATUS_META,
  DEAL_SOURCES,
  DEAL_PRIORITIES,
  normalizeDealStatus,
  type DealPipelineStatus,
} from "@/lib/dealStatus";
import { checkDealFollowUpReminders, triggerAutomation } from "@/lib/automationService";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Lock, DollarSign, TrendingUp, CheckCircle, Plus, Pencil, Trash2, Search, Eye, LayoutGrid, List } from "lucide-react";
import { useMdUp } from "@/hooks/useSmUp";
import type { Deal } from "@/types";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { sheetContentDetail } from "@/lib/dialogLayout";
import { cn } from "@/lib/utils";

type DealAuditRow = {
  id: string;
  dealId: string;
  action: string;
  detailJson?: string | null;
  userId: string;
  userName: string;
  at: string;
};

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const DEFAULT_SALES_STAGES = ["Prospecting", "Qualified", "Proposal", "Negotiation", "Closing"];

export default function DealsPage() {
  const queryClient = useQueryClient();
  const updateDealStage = useUpdateDealStage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useAppStore((s) => s.me);
  const deals = useAppStore((s) => s.deals);
  const setDeals = useAppStore((s) => s.setDeals);
  const customers = useAppStore((s) => s.customers);
  const users = useAppStore((s) => s.users);
  const scope = getScope(me.role, "deals");
  const visibleDeals = visibleWithScope(scope, me, deals);
  const scopedActiveDeals = useMemo(
    () => visibleDeals.filter((d) => !d.deletedAt),
    [visibleDeals],
  );
  const deletedDealsInScope = useMemo(() => {
    if (!isDealSuperAdmin(me.role)) return [];
    return visibleWithScope(scope, me, deals).filter((d) => !!d.deletedAt);
  }, [deals, me, scope]);
  const canCreate = can(me.role, "deals", "create");
  const canUpdateDeal = canEditDeal(me.role);
  const canRemoveDeal = canDeleteDeal(me.role);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DealPipelineStatus>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | "view">("create");
  const [sheetDeal, setSheetDeal] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);
  const [lossTarget, setLossTarget] = useState<Deal | null>(null);
  const [lossReasonDraft, setLossReasonDraft] = useState("");
  const mdUp = useMdUp();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [stage, setStage] = useState("Qualified");
  const [value, setValue] = useState("");
  const [locked, setLocked] = useState(false);
  const [proposalId, setProposalId] = useState("");
  const [dealStatus, setDealStatus] = useState<DealPipelineStatus>("Active");
  const [dealSource, setDealSource] = useState<string>("Direct");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [remarks, setRemarks] = useState("");

  const statusOptions = useMemo(() => [...dealStatusOptionsForRole(me.role)], [me.role]);

  const dealsQuery = useQuery({
    queryKey: [...QK.deals({ role: me.role })],
    queryFn: async () => {
      const q =
        me.role === "super_admin"
          ? "?includeDeleted=1&actorRole=super_admin"
          : "";
      const res = await fetch(apiUrl(`/api/deals${q}`));
      if (!res.ok) throw new Error("Failed to load deals");
      return (await res.json()) as Deal[];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["deal-audit", sheetDeal?.id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/deals/${sheetDeal!.id}/audit`));
      if (!res.ok) throw new Error("Failed to load audit");
      return res.json() as Promise<DealAuditRow[]>;
    },
    enabled: sheetOpen && !!sheetDeal?.id && sheetMode !== "create",
  });

  useEffect(() => {
    if (!dealsQuery.data) return;
    setDeals(dealsQuery.data);
  }, [dealsQuery.data, setDeals]);

  useEffect(() => {
    checkDealFollowUpReminders(deals);
  }, [deals]);

  useEffect(() => {
    if (!mdUp) setViewMode("list");
  }, [mdUp]);

  useEffect(() => {
    const q = searchParams.get("q");
    const stage = searchParams.get("stage");
    const status = searchParams.get("status") as DealPipelineStatus | null;
    const owner = searchParams.get("owner");
    const team = searchParams.get("team");
    const region = searchParams.get("region");
    if (q) setSearch(q);
    if (stage) setStageFilter(stage);
    if (status && (DEAL_STATUSES as readonly string[]).includes(status)) setStatusFilter(status);
    if (owner) setOwnerFilter(owner);
    if (team) setTeamFilter(team);
    if (region) setRegionFilter(region);
  }, [searchParams]);

  useEffect(() => {
    if (!sheetOpen) return;
    if (sheetMode !== "create" && sheetDeal) {
      setName(sheetDeal.name);
      setCustomerId(sheetDeal.customerId);
      setOwnerUserId(sheetDeal.ownerUserId);
      setStage(sheetDeal.stage);
      setValue(String(sheetDeal.value));
      setLocked(sheetDeal.locked);
      setProposalId(sheetDeal.proposalId ?? "");
      setDealStatus(normalizeDealStatus(sheetDeal.dealStatus));
      setDealSource(sheetDeal.dealSource ?? "Direct");
      setExpectedCloseDate(sheetDeal.expectedCloseDate ?? "");
      setPriority(sheetDeal.priority ?? "Medium");
      setNextFollowUpDate(sheetDeal.nextFollowUpDate ?? "");
      setContactPhone(sheetDeal.contactPhone ?? "");
      setRemarks(sheetDeal.remarks ?? "");
      return;
    }
    if (sheetMode === "create") {
      setName("");
      setCustomerId(customers[0]?.id ?? "");
      setOwnerUserId(users[0]?.id ?? me.id);
      setStage("Qualified");
      setValue("");
      setLocked(false);
      setProposalId("");
      setDealStatus("Active");
      setDealSource("Direct");
      setExpectedCloseDate("");
      setPriority("Medium");
      setNextFollowUpDate("");
      setContactPhone("");
      setRemarks("");
    }
  }, [sheetOpen, sheetMode, sheetDeal?.id, customers, users, me.id]);

  const createMutation = useMutation({
    mutationFn: async (deal: Deal) => {
      const { id: _omitId, ...rest } = deal;
      const res = await fetch(apiUrl("/api/deals"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          locked: deal.locked,
          changedByUserId: me.id,
          changedByName: me.name,
          createdByUserId: me.id,
          createdByName: me.name,
          actorRole: me.role,
        }),
      });
      if (!res.ok) throw new Error("Failed to create deal");
      return (await res.json()) as Deal;
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: async (deal: Deal) => {
      const res = await fetch(apiUrl(`/api/deals/${deal.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...deal,
          locked: deal.locked,
          changedByUserId: me.id,
          changedByName: me.name,
          actorRole: me.role,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update deal");
      }
      return (await res.json()) as Deal;
    },
    onSuccess: () => {
      dealsQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["deal-audit"] });
    },
  });

  const patchDealApi = useCallback(
    async (current: Deal, patch: Partial<Deal>) => {
      const next: Deal = {
        ...current,
        ...patch,
        lossReason:
          patch.dealStatus === "Closed/Lost"
            ? patch.lossReason ?? current.lossReason
            : patch.dealStatus !== undefined && patch.dealStatus !== "Closed/Lost"
              ? null
              : current.lossReason,
      };
      const res = await fetch(apiUrl(`/api/deals/${current.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...next,
          locked: next.locked,
          changedByUserId: me.id,
          changedByName: me.name,
          actorRole: me.role,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      return (await res.json()) as Deal;
    },
    [me.id, me.name],
  );

  const patchDealMutation = useMutation({
    mutationFn: async ({
      deal,
      patch,
      prevStatus,
    }: {
      deal: Deal;
      patch: Partial<Deal>;
      prevStatus: DealPipelineStatus;
    }) => {
      return patchDealApi(deal, patch);
    },
    onSuccess: async (data, vars) => {
      await dealsQuery.refetch();
      const nextS = normalizeDealStatus(data.dealStatus);
      const prevS = vars.prevStatus;
      const rep = users.find((u) => u.id === data.ownerUserId);
      if (nextS === "Closed/Won" && prevS !== "Closed/Won") {
        const customer = customers.find((c) => c.id === data.customerId);
        const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
        await triggerAutomation("deal_won", {
          dealId: data.id,
          dealTitle: data.name,
          dealValue: data.value,
          customerId: data.customerId,
          customerName: customer?.companyName,
          customerPhone: primary?.phone,
          customerEmail: primary?.email,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          companyName: "Cravingcode Technologies Pvt. Ltd.",
        });
        toast({ title: "Deal won", description: "Team notification sent (if templates are active)." });
      }
      if (nextS === "Closed/Lost" && prevS !== "Closed/Lost") {
        const customer = customers.find((c) => c.id === data.customerId);
        await triggerAutomation("deal_lost", {
          dealId: data.id,
          dealTitle: data.name,
          dealValue: data.value,
          customerId: data.customerId,
          customerName: customer?.companyName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          lossReason: data.lossReason ?? "",
          companyName: "Cravingcode Technologies Pvt. Ltd.",
        });
      }
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/deals/${id}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorRole: me.role,
          deletedByUserId: me.id,
          deletedByName: me.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete deal");
      }
    },
    onSuccess: () => dealsQuery.refetch(),
  });

  const statusCounts = useMemo(() => {
    const c = {} as Record<DealPipelineStatus, number>;
    DEAL_STATUSES.forEach((s) => {
      c[s] = 0;
    });
    scopedActiveDeals.forEach((d) => {
      c[normalizeDealStatus(d.dealStatus)]++;
    });
    return c;
  }, [scopedActiveDeals]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedActiveDeals.filter((d) => {
      if (q) {
        const customerName = customers.find((c) => c.id === d.customerId)?.companyName ?? "";
        if (
          !d.id.toLowerCase().includes(q) &&
          !d.name.toLowerCase().includes(q) &&
          !customerName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (stageFilter !== "all" && d.stage !== stageFilter) return false;
      if (statusFilter !== "all" && normalizeDealStatus(d.dealStatus) !== statusFilter) return false;
      if (ownerFilter !== "all" && d.ownerUserId !== ownerFilter) return false;
      if (teamFilter !== "all" && d.teamId !== teamFilter) return false;
      if (regionFilter !== "all" && d.regionId !== regionFilter) return false;
      return true;
    });
  }, [scopedActiveDeals, search, stageFilter, statusFilter, ownerFilter, teamFilter, regionFilter, customers]);

  const totalValue = visible.reduce((s, d) => s + d.value, 0);

  const allStages = useMemo(() => {
    const set = new Set(scopedActiveDeals.map((d) => d.stage));
    return Array.from(set);
  }, [scopedActiveDeals]);

  const stageSelectOptions = useMemo(() => {
    return Array.from(new Set([...DEFAULT_SALES_STAGES, ...allStages]));
  }, [allStages]);

  const setStatusFilterAndUrl = (s: "all" | DealPipelineStatus) => {
    setStatusFilter(s);
    const next = new URLSearchParams(searchParams);
    if (s === "all") next.delete("status");
    else next.set("status", s);
    setSearchParams(next, { replace: true });
  };

  const handleSaveDeal = async () => {
    if (sheetMode === "view") return;
    const owner = users.find((u) => u.id === ownerUserId);
    const parsedValue = Number(value);
    if (!name.trim() || !customerId || !ownerUserId || !Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast({ title: "Missing fields", description: "Fill required fields correctly.", variant: "destructive" });
      return;
    }
    if (!priority.trim()) {
      toast({ title: "Priority required", variant: "destructive" });
      return;
    }
    if (dealStatus === "Closed/Lost" && !lossReasonDraft.trim() && !sheetDeal?.lossReason) {
      toast({ title: "Loss reason required", description: "Enter a loss reason for Closed/Lost.", variant: "destructive" });
      return;
    }
    const base = {
      name: name.trim(),
      customerId,
      ownerUserId,
      teamId: owner?.teamId ?? me.teamId,
      regionId: owner?.regionId ?? me.regionId,
      stage,
      value: parsedValue,
      locked,
      proposalId: proposalId.trim() ? proposalId.trim() : null,
      dealStatus,
      dealSource: dealSource || null,
      expectedCloseDate: expectedCloseDate.trim() || null,
      priority,
      nextFollowUpDate: nextFollowUpDate.trim() || null,
      contactPhone: contactPhone.trim() || null,
      remarks: remarks.trim() || null,
      lossReason:
        dealStatus === "Closed/Lost"
          ? (lossReasonDraft.trim() || sheetDeal?.lossReason || "").trim() || null
          : null,
    };

    if (sheetMode === "edit" && sheetDeal) {
      try {
        const prev = normalizeDealStatus(sheetDeal.dealStatus);
        const payload: Deal = { ...sheetDeal, ...base };
        const saved = await updateMutation.mutateAsync(payload);
        const rep = users.find((u) => u.id === saved.ownerUserId);
        if (normalizeDealStatus(saved.dealStatus) === "Closed/Won" && prev !== "Closed/Won") {
          const customer = customers.find((c) => c.id === saved.customerId);
          const primary = customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
          await triggerAutomation("deal_won", {
            dealId: saved.id,
            dealTitle: saved.name,
            dealValue: saved.value,
            customerId: saved.customerId,
            customerName: customer?.companyName,
            customerPhone: primary?.phone,
            customerEmail: primary?.email,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
            companyName: "Cravingcode Technologies Pvt. Ltd.",
          });
          toast({ title: "Deal updated", description: "Won notification sent (if templates are active)." });
        } else if (normalizeDealStatus(saved.dealStatus) === "Closed/Lost" && prev !== "Closed/Lost") {
          await triggerAutomation("deal_lost", {
            dealId: saved.id,
            dealTitle: saved.name,
            dealValue: saved.value,
            customerId: saved.customerId,
            customerName: customer?.companyName,
            salesRepId: rep?.id,
            salesRepName: rep?.name,
            lossReason: saved.lossReason ?? "",
            companyName: "Cravingcode Technologies Pvt. Ltd.",
          });
          toast({ title: "Deal updated", description: "Loss recorded and automation sent (if configured)." });
        } else {
          toast({ title: "Deal updated", description: `${base.name} updated successfully.` });
        }
      } catch (e) {
        toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
      }
    } else if (sheetMode === "create") {
      try {
        const temp: Deal = {
          id: "pending",
          ...base,
        };
        const saved = await createMutation.mutateAsync(temp);
        const customer = customers.find((c) => c.id === saved.customerId);
        const rep = users.find((u) => u.id === saved.ownerUserId);
        await triggerAutomation("deal_created", {
          dealId: saved.id,
          dealTitle: saved.name,
          dealValue: saved.value,
          customerId: saved.customerId,
          customerName: customer?.companyName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          companyName: "Cravingcode Technologies Pvt. Ltd.",
        });
        toast({ title: "Deal created", description: `${saved.name} (${saved.id})` });
      } catch (e) {
        toast({ title: "Create failed", description: (e as Error).message, variant: "destructive" });
      }
    }
    setSheetOpen(false);
    setSheetDeal(null);
    setLossReasonDraft("");
  };

  const handleDeleteDeal = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Deal archived", description: `${deleteTarget.name} was soft-deleted (Super Admin can view in Deleted records).` });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const onInlineStatusChange = (d: Deal, value: string) => {
    if (!canUpdateDeal || d.locked || d.deletedAt) return;
    const next = value as DealPipelineStatus;
    const prev = normalizeDealStatus(d.dealStatus);
    if (next === "Closed/Lost") {
      setLossTarget(d);
      setLossReasonDraft("");
      return;
    }
    patchDealMutation.mutate({ deal: d, patch: { dealStatus: next }, prevStatus: prev });
  };

  const submitLossReason = () => {
    if (!lossTarget) return;
    if (!lossReasonDraft.trim()) {
      toast({ title: "Required", description: "Enter a loss reason.", variant: "destructive" });
      return;
    }
    const prev = normalizeDealStatus(lossTarget.dealStatus);
    patchDealMutation.mutate(
      {
        deal: lossTarget,
        patch: { dealStatus: "Closed/Lost", lossReason: lossReasonDraft.trim() },
        prevStatus: prev,
      },
      {
        onSettled: () => {
          setLossTarget(null);
          setLossReasonDraft("");
        },
      },
    );
  };

  return (
    <>
      <Topbar title="Deals" subtitle="Track and manage all deals" />
      <div className="space-y-4 sm:space-y-6">
        {dealsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading deals...</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search deal, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {allStages.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Button
              className="h-9"
              onClick={() => {
                setSheetDeal(null);
                setSheetMode("create");
                setSheetOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> New Deal
            </Button>
          )}
        </div>

        {/* Pipeline status summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {DEAL_STATUSES.map((st) => {
            const meta = DEAL_STATUS_META[st];
            const count = statusCounts[st];
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilterAndUrl(active ? "all" : st)}
                className={cn(
                  "text-left rounded-lg border p-3 transition-all hover:ring-2 hover:ring-primary/30",
                  meta.cardClass,
                  active && "ring-2 ring-primary",
                )}
              >
                <p className="text-xs font-semibold text-foreground/90">{st}</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{count}</p>
                <p className="text-[10px] text-muted-foreground leading-snug mt-1 line-clamp-2">{meta.description}</p>
              </button>
            );
          })}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setStatusFilterAndUrl("all")}
          >
            All
          </Button>
          {DEAL_STATUSES.map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setStatusFilterAndUrl(st)}
            >
              {st}
            </Button>
          ))}
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Total Deal Value</p>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{formatINR(totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Visible Deals</p>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{visible.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Locked Deals</p>
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-success">{visible.filter((d) => d.locked).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border border-border bg-card">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">All Deals</h3>
              {mdUp && (
                <div className="flex gap-1 rounded-md border border-border p-0.5">
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 px-2.5"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-3.5 w-3.5" />
                    List
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "kanban" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 px-2.5"
                    onClick={() => setViewMode("kanban")}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Kanban
                  </Button>
                </div>
              )}
            </div>
            {mdUp && viewMode === "kanban" ? (
              <div className="overflow-x-auto pb-4 pt-2">
                <div className="flex min-w-max gap-4 px-4">
                  {stageSelectOptions.map((stage) => (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      deals={visible.filter((d) => d.stage === stage)}
                      customerName={(id) => customers.find((c) => c.id === id)?.companyName ?? "—"}
                      onViewDeal={(d) => {
                        setSheetDeal(d);
                        setSheetMode("view");
                        setSheetOpen(true);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                        Title
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell md:px-4 md:py-3">
                        Value
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell md:px-4 md:py-3">
                        Customer
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                        Stage
                      </TableHead>
                      <TableHead className="hidden min-w-[140px] px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground xl:table-cell md:px-4 md:py-3">
                        Deal status
                      </TableHead>
                      <TableHead className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell md:px-4 md:py-3">
                        Assigned To
                      </TableHead>
                      <TableHead className="hidden whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell md:px-4 md:py-3">
                        Created
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:px-4 md:py-3">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((d) => {
                    const st = normalizeDealStatus(d.dealStatus);
                    const badgeClass = DEAL_STATUS_META[st].badgeClass;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="px-3 py-3 text-sm font-medium md:px-4 md:py-3.5">{d.name}</TableCell>
                        <TableCell className="hidden px-3 py-3 text-right font-mono text-sm md:table-cell md:px-4 md:py-3.5">
                          {formatINR(d.value)}
                        </TableCell>
                        <TableCell className="hidden px-3 py-3 text-sm text-muted-foreground md:table-cell md:px-4 md:py-3.5">
                          {customers.find((c) => c.id === d.customerId) ? (
                            <button
                              type="button"
                              className="text-left text-primary hover:underline"
                              onClick={() => navigate(`/customers/${d.customerId}`)}
                            >
                              {customers.find((c) => c.id === d.customerId)?.companyName}
                            </button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                          {canUpdateDeal && !d.locked ? (
                            <Select
                              value={d.stage}
                              disabled={updateDealStage.isPending}
                              onValueChange={(v) =>
                                updateDealStage.mutate({
                                  dealId: d.id,
                                  stage: v,
                                  prevDealStatus: normalizeDealStatus(d.dealStatus),
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-[min(150px,100%)] max-w-[150px] px-2 text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {stageSelectOptions.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {d.stage}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden min-w-[140px] px-3 py-3 xl:table-cell md:px-4 md:py-3.5">
                          {canUpdateDeal && !d.locked ? (
                            <Select value={st} onValueChange={(v) => onInlineStatusChange(d, v)}>
                              <SelectTrigger className={cn("h-8 border text-xs", badgeClass)}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className={cn("border text-[10px]", badgeClass)}>
                              {st}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell md:px-4 md:py-3.5">
                          {users.find((u) => u.id === d.ownerUserId)?.name}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap px-3 py-3 text-xs text-muted-foreground lg:table-cell md:px-4 md:py-3.5">
                          {formatShortDate(d.createdAt)}
                        </TableCell>
                        <TableCell className="px-3 py-3 md:px-4 md:py-3.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {d.locked ? (
                              <span className="flex items-center gap-1 text-xs text-success">
                                <Lock className="w-3 h-3" /> Locked
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-warning">
                                <span className="w-2 h-2 rounded-full bg-warning" /> Open
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="View"
                              onClick={() => {
                                setSheetDeal(d);
                                setSheetMode("view");
                                setSheetOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {canUpdateDeal && !d.locked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Edit"
                                onClick={() => {
                                  setSheetDeal(d);
                                  setSheetMode("edit");
                                  setSheetOpen(true);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {canRemoveDeal && !d.locked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget(d)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                    {visible.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                          No active deals in scope
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Pipeline status</strong> drives reminders and win/loss automation.
              Changing to <strong>Closed/Won</strong> notifies the team (deal_won templates).{" "}
              <strong>Closed/Lost</strong> requires a loss reason and fires deal_lost templates.
            </p>
            <p>
              <strong className="text-foreground">Follow-up:</strong> Set “Next follow-up” to trigger{" "}
              <strong>deal_follow_up</strong> automation 1 day before and on that date. New deals fire{" "}
              <strong>deal_created</strong> for the assignee.
            </p>
            <p>
              <strong className="text-foreground">Roles:</strong> Super Admin can edit, archive (soft delete), and set{" "}
              <strong>Closed/Lost</strong>. Other roles can create and view.
            </p>
          </CardContent>
        </Card>

        {deletedDealsInScope.length > 0 && (
          <Card className="bg-card border border-destructive/30">
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Deleted records (soft-deleted)</h3>
                <p className="text-xs text-muted-foreground mt-1">Visible to Super Admin only. Rows stay in the database for audit.</p>
              </div>
              <div className="p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Deal ID</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Deleted at</TableHead>
                      <TableHead className="text-xs">By</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedDealsInScope.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.id}</TableCell>
                        <TableCell className="text-sm">{d.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatShortDate(d.deletedAt)}</TableCell>
                        <TableCell className="text-xs">{d.deletedByName ?? "—"}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setSheetDeal(d);
                              setSheetMode("view");
                              setSheetOpen(true);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) setSheetDeal(null);
          setSheetOpen(o);
        }}
      >
        <SheetContent side="right" className={cn(sheetContentDetail, "max-h-[100dvh]")}>
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "view" ? "Deal details" : sheetMode === "edit" ? "Edit deal" : "New deal"}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 max-h-[calc(100vh-8rem)] pr-3">
            <div className="space-y-4 pb-4">
              {sheetDeal && (sheetMode === "view" || sheetMode === "edit") && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <p>
                    <span className="text-muted-foreground">Deal ID:</span>{" "}
                    <span className="font-mono font-medium">{sheetDeal.id}</span>
                  </p>
                  {sheetDeal.createdAt && (
                    <p>
                      <span className="text-muted-foreground">Created:</span> {formatShortDate(sheetDeal.createdAt)} by{" "}
                      {sheetDeal.createdByName ?? sheetDeal.createdByUserId ?? "—"}
                    </p>
                  )}
                  {sheetDeal.updatedAt && (
                    <p>
                      <span className="text-muted-foreground">Last updated:</span> {formatShortDate(sheetDeal.updatedAt)}
                    </p>
                  )}
                  {sheetDeal.deletedAt && (
                    <p className="text-destructive">
                      Archived {formatShortDate(sheetDeal.deletedAt)}
                      {sheetDeal.deletedByName ? ` by ${sheetDeal.deletedByName}` : ""}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Deal title *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Deal title"
                  disabled={sheetMode === "view"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select value={customerId} onValueChange={setCustomerId} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned to *</Label>
                  <Select value={ownerUserId} onValueChange={setOwnerUserId} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Sales stage *</Label>
                  <Input
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    placeholder="Qualified"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pipeline status *</Label>
                  <Select
                    value={dealStatus}
                    onValueChange={(v) => setDealStatus(v as DealPipelineStatus)}
                    disabled={sheetMode === "view"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Deal source</Label>
                  <Select value={dealSource} onValueChange={setDealSource} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority *</Label>
                  <Select value={priority} onValueChange={setPriority} disabled={sheetMode === "view"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expected close date</Label>
                  <Input
                    type="date"
                    value={expectedCloseDate}
                    onChange={(e) => setExpectedCloseDate(e.target.value)}
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next follow-up date</Label>
                  <Input
                    type="date"
                    value={nextFollowUpDate}
                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deal value (₹) *</Label>
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact number</Label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91…"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Remarks / notes</Label>
                  {sheetMode === "view" && !isDealSuperAdmin(me.role) ? (
                    <p className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
                      Internal remarks are visible to Super Admin only.
                    </p>
                  ) : (
                    <Textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Internal notes…"
                      className="min-h-[72px]"
                      disabled={sheetMode === "view"}
                    />
                  )}
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Proposal ID (optional)</Label>
                  <Input
                    value={proposalId}
                    onChange={(e) => setProposalId(e.target.value)}
                    placeholder="p1234"
                    disabled={sheetMode === "view"}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Lock deal</Label>
                  <Select
                    value={locked ? "locked" : "open"}
                    onValueChange={(v) => setLocked(v === "locked")}
                    disabled={sheetMode === "view"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dealStatus === "Closed/Lost" && sheetMode !== "view" && (
                  <div className="space-y-2 col-span-2">
                    <Label>Loss reason *</Label>
                    <Textarea
                      value={lossReasonDraft || sheetDeal?.lossReason || ""}
                      onChange={(e) => setLossReasonDraft(e.target.value)}
                      placeholder="Why was this deal lost?"
                      className="min-h-[72px]"
                    />
                  </div>
                )}
                {dealStatus === "Closed/Lost" && sheetMode === "view" && sheetDeal?.lossReason && (
                  <div className="space-y-2 col-span-2">
                    <Label>Loss reason</Label>
                    <p className="text-sm border rounded-md p-3 bg-muted/20">{sheetDeal.lossReason}</p>
                  </div>
                )}
              </div>
              {sheetDeal?.id && sheetMode !== "create" && (
                <div className="border rounded-md p-3 space-y-2">
                  <p className="text-xs font-semibold">Activity log</p>
                  {auditQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                  <ul className="space-y-2 max-h-52 overflow-y-auto text-xs">
                    {(auditQuery.data ?? []).map((a) => (
                      <li key={a.id} className="border-b border-border/60 pb-2">
                        <span className="text-muted-foreground">{formatShortDate(a.at)}</span> —{" "}
                        <span className="font-medium">{a.userName}</span>{" "}
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {a.action.replace(/^deal_/, "").replace(/_/g, " ")}
                        </Badge>
                        <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all opacity-80">
                          {a.detailJson}
                        </pre>
                      </li>
                    ))}
                    {(auditQuery.data?.length ?? 0) === 0 && !auditQuery.isLoading && (
                      <li className="text-muted-foreground">No activity yet.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
          <SheetFooter className="mt-4 gap-2 sm:gap-0">
            {sheetMode === "view" ? (
              <>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  Close
                </Button>
                {canUpdateDeal && sheetDeal && !sheetDeal.locked && !sheetDeal.deletedAt && (
                  <Button
                    onClick={() => {
                      setSheetMode("edit");
                    }}
                  >
                    Edit
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDeal} disabled={!!sheetDeal?.deletedAt}>
                  {sheetMode === "edit" ? "Save changes" : "Create deal"}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!lossTarget} onOpenChange={(open) => !open && setLossTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Loss reason required</AlertDialogTitle>
            <AlertDialogDescription>
              Marking <strong>{lossTarget?.name}</strong> as Closed/Lost requires a reason for the audit trail and
              automation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={lossReasonDraft}
            onChange={(e) => setLossReasonDraft(e.target.value)}
            placeholder="e.g. Budget frozen, chose competitor, timing…"
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLossTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitLossReason}>Save as Closed/Lost</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete <strong>{deleteTarget?.name}</strong> (record kept for audit). Only Super Admin can
              see it under Deleted records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDeleteDeal}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function KanbanColumn({
  stage,
  deals,
  customerName,
  onViewDeal,
}: {
  stage: string;
  deals: Deal[];
  customerName: (customerId: string) => string;
  onViewDeal: (d: Deal) => void;
}) {
  return (
    <div className="w-72 shrink-0">
      <div className="rounded-lg bg-muted/60 p-3 dark:bg-muted/30">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {stage} ({deals.length})
        </h3>
        <div className="space-y-2">
          {deals.map((deal) => (
            <button
              key={deal.id}
              type="button"
              onClick={() => onViewDeal(deal)}
              className="w-full rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:bg-muted/50"
            >
              <p className="line-clamp-2 text-sm font-medium">{deal.name}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{customerName(deal.customerId)}</p>
              <p className="mt-2 text-xs font-mono font-semibold tabular-nums">{formatINR(deal.value)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
