import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { can, getScope, visibleWithScope } from "@/lib/rbac";
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
import { Lock, Plus, Pencil, Trash2, Search, Eye, Calendar, Upload } from "lucide-react";
import type { Deal } from "@/types";
import { BulkImportDealsDialog } from "@/components/BulkImportDealsDialog";
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

const DASHBOARD_STAGES = DEFAULT_SALES_STAGES.slice(0, 3);

type StageVisual = { key: string; label: string; pillColor: string; dotColor: string };

const DEAL_STAGE_VISUAL: StageVisual[] = [
  {
    key: "Prospecting",
    label: "Prospecting",
    pillColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    dotColor: "bg-slate-400",
  },
  {
    key: "Qualified",
    label: "Qualified",
    pillColor: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
    dotColor: "bg-blue-500",
  },
  {
    key: "Proposal",
    label: "Proposal",
    pillColor: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
    dotColor: "bg-violet-500",
  },
  {
    key: "Negotiation",
    label: "Negotiation",
    pillColor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    dotColor: "bg-amber-500",
  },
  {
    key: "Closing",
    label: "Closing",
    pillColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dotColor: "bg-emerald-500",
  },
];

function dealStatusLabel(s: string) {
  if (s === "Closed/Lost") return "Lost";
  if (s === "Closed/Won") return "Won";
  return s;
}

function stagePillClass(stage: string) {
  return (
    DEAL_STAGE_VISUAL.find((s) => s.key === stage)?.pillColor ??
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
  );
}

function stageDotClass(stage: string) {
  return DEAL_STAGE_VISUAL.find((s) => s.key === stage)?.dotColor ?? "bg-gray-400";
}

function formatDealListDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatINRAmount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return `₹${v.toLocaleString("en-IN")}`;
}

function isFollowUpOverdue(iso: string | null | undefined) {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  d.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return d < t;
}

function DealStageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[140px] truncate text-xs font-medium px-2 py-0.5 rounded-full",
        stagePillClass(stage),
      )}
      title={stage}
    >
      {stage}
    </span>
  );
}

function DealStageSelector({
  deal,
  options,
  disabled,
  pending,
  onStageChange,
}: {
  deal: Deal;
  options: string[];
  disabled: boolean;
  pending: boolean;
  onStageChange: (deal: Deal, stage: string) => void;
}) {
  return (
    <Select
      value={deal.stage}
      disabled={disabled || pending}
      onValueChange={(v) => onStageChange(deal, v)}
    >
      <SelectTrigger className="h-7 w-[min(148px,100%)] max-w-[148px] px-2 text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
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
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

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
        const inv = String(d.invoiceNumber ?? "").toLowerCase();
        const svc = String(d.serviceName ?? "").toLowerCase();
        if (
          !d.id.toLowerCase().includes(q) &&
          !d.name.toLowerCase().includes(q) &&
          !customerName.toLowerCase().includes(q) &&
          !inv.includes(q) &&
          !svc.includes(q)
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

  const activeDealsCount = useMemo(
    () =>
      visible.filter((d) => {
        const s = normalizeDealStatus(d.dealStatus);
        return s !== "Closed/Won" && s !== "Closed/Lost";
      }).length,
    [visible],
  );

  const wonValueThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    return visible.reduce((sum, d) => {
      if (normalizeDealStatus(d.dealStatus) !== "Closed/Won") return sum;
      const t = d.updatedAt || d.createdAt;
      if (!t) return sum;
      const dt = new Date(t);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo) return sum;
      return sum + d.value;
    }, 0);
  }, [visible]);

  const wonPct = totalValue > 0 ? Math.min((wonValueThisMonth / totalValue) * 100, 100) : 0;

  const stageCounts = useMemo(() => {
    const o: Record<string, number> = {};
    visible.forEach((d) => {
      o[d.stage] = (o[d.stage] ?? 0) + 1;
    });
    return o;
  }, [visible]);

  const stageValues = useMemo(() => {
    const o: Record<string, number> = {};
    visible.forEach((d) => {
      o[d.stage] = (o[d.stage] ?? 0) + d.value;
    });
    return o;
  }, [visible]);

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

  const openDeal = (d: Deal) => {
    setSheetDeal(d);
    setSheetMode("view");
    setSheetOpen(true);
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 -mx-4 sm:-mx-5 lg:-mx-6 px-4 sm:px-5 lg:px-6 py-6 space-y-5 max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Deals</h1>
            <p className="text-sm font-normal text-gray-500 mt-0.5">{visible.length} deals shown</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "h-7 px-3 rounded-md text-xs font-medium transition-colors",
                  viewMode === "kanban"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-blue-600"
                    : "text-gray-500 dark:text-gray-400",
                )}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "h-7 px-3 rounded-md text-xs font-medium transition-colors",
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-blue-600"
                    : "text-gray-500 dark:text-gray-400",
                )}
              >
                List
              </button>
            </div>
            {canCreate && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-4 text-sm rounded-lg"
                  onClick={() => setBulkImportOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  Bulk import
                </Button>
                <Button
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                  onClick={() => {
                    setSheetDeal(null);
                    setSheetMode("create");
                    setSheetOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Deal
                </Button>
              </>
            )}
          </div>
        </div>

        {dealsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading deals...</p>}

        <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12 lg:items-center">
              <div className="relative min-w-0 lg:col-span-4">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                  placeholder="Search deal, customer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-span-8 lg:grid-cols-5">
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="All stages" />
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

                <Select value={statusFilter} onValueChange={(v) => setStatusFilterAndUrl(v as "all" | DealPipelineStatus)}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="Deal status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {DEAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {dealStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <SelectValue placeholder="All owners" />
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

                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
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
                  <SelectTrigger className="h-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
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
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
              <button
                type="button"
                onClick={() => setStatusFilterAndUrl("all")}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === "all"
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                    : "border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-600 dark:text-gray-400",
                )}
              >
                All
              </button>
              {DEAL_STATUSES.map((st) => {
                const meta = DEAL_STATUS_META[st];
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilterAndUrl(active ? "all" : st)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? cn("ring-2 ring-blue-500", meta.cardClass)
                        : "border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-600 dark:text-gray-400",
                    )}
                  >
                    {dealStatusLabel(st)} ({statusCounts[st]})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Deal dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="col-span-2 lg:col-span-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow-sm">
            <p className="text-xs font-medium text-blue-100 mb-3 uppercase tracking-wide">Total deal value</p>
            <p className="text-3xl font-bold tracking-tight mb-1 tabular-nums">
              ₹{totalValue.toLocaleString("en-IN")}
            </p>
            <p className="text-sm text-blue-100">{activeDealsCount} active deals</p>
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-blue-100">
                <span>Won this month</span>
                <span className="tabular-nums">₹{wonValueThisMonth.toLocaleString("en-IN")}</span>
              </div>
              <div className="h-1.5 bg-blue-500/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${wonPct}%` }}
                />
              </div>
            </div>
          </div>

          {DASHBOARD_STAGES.map((stageKey) => {
            const sv = DEAL_STAGE_VISUAL.find((s) => s.key === stageKey);
            return (
              <div
                key={stageKey}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3 gap-2">
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full truncate max-w-[7rem]", sv?.pillColor ?? stagePillClass(stageKey))}>
                    {sv?.label ?? stageKey}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                    {stageCounts[stageKey] ?? 0}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  ₹{(stageValues[stageKey] ?? 0).toLocaleString("en-IN")}
                </p>
              </div>
            );
          })}
        </div>

        {/* Kanban */}
        {viewMode === "kanban" && (
          <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
            <div className="flex gap-4 min-w-max">
              {stageSelectOptions.map((stage) => (
                <div key={stage} className="w-72 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", stageDotClass(stage))} />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{stage}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full shrink-0 tabular-nums">
                        {visible.filter((d) => d.stage === stage).length}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                      ₹{(stageValues[stage] ?? 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {visible
                      .filter((d) => d.stage === stage)
                      .map((deal) => {
                        const cust = customers.find((c) => c.id === deal.customerId)?.companyName ?? "—";
                        const ownerName = users.find((u) => u.id === deal.ownerUserId)?.name ?? "";
                        return (
                          <div
                            key={deal.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openDeal(deal)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openDeal(deal);
                              }
                            }}
                            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-150 text-left w-full"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2.5">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 flex-1">
                                {deal.name}
                              </p>
                              <span className="text-xs font-bold text-blue-600 whitespace-nowrap flex-shrink-0 tabular-nums">
                                ₹{(deal.value ?? 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-1">{cust}</p>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                                    {ownerName?.[0] ?? "?"}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400 truncate">{ownerName?.split(" ")[0] ?? "—"}</span>
                              </div>
                              {deal.nextFollowUpDate && (
                                <span
                                  className={cn(
                                    "text-xs flex items-center gap-1 shrink-0",
                                    isFollowUpOverdue(deal.nextFollowUpDate) ? "text-red-500 font-medium" : "text-gray-400",
                                  )}
                                >
                                  <Calendar className="h-3 w-3" />
                                  {formatDealListDate(deal.nextFollowUpDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                    {[
                      "Status",
                      "Invoice Date",
                      "Invoice#",
                      "Customer Name",
                      "Total",
                      "Tax Amount",
                      "Amount Without Tax",
                      "Place of Supply",
                      "Balance",
                      "Amount Paid",
                      "Service",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className={cn(
                          "px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide",
                          (h === "Customer Name" || h === "Invoice#" || h === "Place of Supply" || h === "Service") && "text-left",
                          (h === "Total" ||
                            h === "Tax Amount" ||
                            h === "Amount Without Tax" ||
                            h === "Balance" ||
                            h === "Amount Paid") &&
                            "text-right",
                          (h === "Tax Amount" || h === "Amount Without Tax") && "hidden lg:table-cell",
                          (h === "Place of Supply" || h === "Service") && "hidden md:table-cell",
                          h === "Actions" && "text-center pr-5",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {visible.map((deal) => {
                    const cust = customers.find((c) => c.id === deal.customerId)?.companyName ?? "—";
                    return (
                      <tr
                        key={deal.id}
                        className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors duration-100"
                      >
                        <td className="px-4 py-3.5 pl-5 text-sm font-medium">
                          {deal.invoiceStatus ?? "—"}
                        </td>
                        <td className="px-4 py-3.5 text-sm tabular-nums">
                          {formatDealListDate(deal.invoiceDate)}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => openDeal(deal)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 text-left"
                            title={deal.id}
                          >
                            {deal.invoiceNumber ?? deal.id}
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          {customers.find((c) => c.id === deal.customerId) ? (
                            <button
                              type="button"
                              className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 text-left"
                              onClick={() => navigate(`/customers/${deal.customerId}`)}
                            >
                              {cust}
                            </button>
                          ) : (
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{cust}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {formatINRAmount(deal.totalAmount ?? deal.value)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm hidden lg:table-cell">
                          {formatINRAmount(deal.taxAmount)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm hidden lg:table-cell">
                          {formatINRAmount(deal.amountWithoutTax)}
                        </td>
                        <td className="px-4 py-3.5 text-sm hidden md:table-cell">
                          {deal.placeOfSupply ?? "—"}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm">
                          {formatINRAmount(deal.balanceAmount)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm">
                          {formatINRAmount(deal.amountPaid)}
                        </td>
                        <td className="px-4 py-3.5 text-sm hidden md:table-cell">
                          {deal.serviceName ?? "—"}
                        </td>
                        <td className="px-4 py-3.5 pr-5">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {deal.locked && (
                              <span title="Locked" className="text-emerald-600">
                                <Lock className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                              onClick={() => openDeal(deal)}
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <DealStageSelector
                              deal={deal}
                              options={stageSelectOptions}
                              disabled={!canUpdateDeal || !!deal.locked}
                              pending={updateDealStage.isPending}
                              onStageChange={(d, st) =>
                                updateDealStage.mutate({
                                  dealId: d.id,
                                  stage: st,
                                  prevDealStatus: normalizeDealStatus(d.dealStatus),
                                })
                              }
                            />
                            {canUpdateDeal && !deal.locked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 rounded-md text-gray-400 hover:text-gray-700"
                                title="Edit"
                                onClick={() => {
                                  setSheetDeal(deal);
                                  setSheetMode("edit");
                                  setSheetOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRemoveDeal && !deal.locked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Archive"
                                onClick={() => setDeleteTarget(deal)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        No deals match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Card className="bg-card border border-border">
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Deal status</strong> controls reminders and win/loss messages.
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
                  <Label>Deal status *</Label>
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

      <BulkImportDealsDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        existingDeals={scopedActiveDeals}
        onImported={async () => {
          await queryClient.invalidateQueries({ queryKey: [...QK.deals({ role: me.role })] });
          await dealsQuery.refetch();
        }}
      />
    </>
  );
}
