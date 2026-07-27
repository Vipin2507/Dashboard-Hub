import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import {
  DEAL_STATUSES,
  DEAL_STATUS_META,
  resolveDealPipelineStatus,
  type DealPipelineStatus,
} from "@/lib/dealStatus";
import { dealStatusOptionsForRole } from "@/lib/dealPermissions";
import { useAppStore } from "@/store/useAppStore";
import type { Deal } from "@/types";

type BulkStatusResult = {
  updated: number;
  skippedLocked: number;
  skippedUnchanged: number;
  deals: Deal[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: Deal[];
  selectedIds: string[];
  onCompleted?: () => void;
};

const ANY_STATUS = "__any__";

function statusLabel(s: string): string {
  if (s === "Closed/Won") return "Won";
  if (s === "Closed/Lost") return "Lost";
  return s;
}

function countByStatus(list: Deal[]): Map<DealPipelineStatus, number> {
  const map = new Map<DealPipelineStatus, number>();
  for (const d of list) {
    if (d.locked) continue;
    const key = resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function pickDefaultFromStatus(
  options: readonly DealPipelineStatus[],
  counts: Map<DealPipelineStatus, number>,
): DealPipelineStatus {
  let best: DealPipelineStatus = options[0] ?? "Active";
  let bestCount = -1;
  for (const s of options) {
    const c = counts.get(s) ?? 0;
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}

export function BulkUpdateDealStatusDialog({
  open,
  onOpenChange,
  deals,
  selectedIds,
  onCompleted,
}: Props) {
  const me = useAppStore((s) => s.me);
  const setDeals = useAppStore((s) => s.setDeals);
  const queryClient = useQueryClient();

  const statusOptions = useMemo(() => dealStatusOptionsForRole(me.role), [me.role]);
  const fromOptions = useMemo(() => [...DEAL_STATUSES], []);

  const hasSelection = selectedIds.length > 0;
  const [mode, setMode] = useState<"selected" | "by_status">("by_status");
  const [fromStatus, setFromStatus] = useState<string>(ANY_STATUS);
  const [toStatus, setToStatus] = useState<DealPipelineStatus>("Closed/Won");
  const [lossReason, setLossReason] = useState("");

  const counts = useMemo(() => countByStatus(deals), [deals]);

  const selectedDeals = useMemo(() => {
    if (!hasSelection) return [] as Deal[];
    const idSet = new Set(selectedIds);
    return deals.filter((d) => idSet.has(d.id));
  }, [deals, hasSelection, selectedIds]);

  const selectedStatusSummary = useMemo(() => {
    const map = countByStatus(selectedDeals);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${statusLabel(k)} (${n})`)
      .join(", ");
  }, [selectedDeals]);

  useEffect(() => {
    if (!open) return;
    const nextMode = hasSelection ? "selected" : "by_status";
    setMode(nextMode);
    const defaultFrom = pickDefaultFromStatus(fromOptions, counts);
    setFromStatus(nextMode === "selected" ? ANY_STATUS : defaultFrom);
    const toCandidate =
      statusOptions.find((s) => s !== defaultFrom) ?? statusOptions[0] ?? "Active";
    setToStatus(toCandidate);
    setLossReason("");
  }, [open, hasSelection, fromOptions, statusOptions, counts]);

  const previewDeals = useMemo(() => {
    let list = deals.filter((d) => !d.locked);
    if (mode === "selected") {
      const idSet = new Set(selectedIds);
      list = list.filter((d) => idSet.has(d.id));
    }
    if (fromStatus !== ANY_STATUS) {
      list = list.filter(
        (d) => resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus) === fromStatus,
      );
    }
    return list;
  }, [deals, mode, fromStatus, selectedIds]);

  const lockedInScope = useMemo(() => {
    let list = deals.filter((d) => d.locked);
    if (mode === "selected") {
      const idSet = new Set(selectedIds);
      list = list.filter((d) => idSet.has(d.id));
    }
    if (fromStatus !== ANY_STATUS) {
      list = list.filter(
        (d) => resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus) === fromStatus,
      );
    }
    return list.length;
  }, [deals, mode, fromStatus, selectedIds]);

  const unchangedCount = previewDeals.filter(
    (d) => resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus) === toStatus,
  ).length;
  const willUpdate = previewDeals.length - unchangedCount;

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        actorRole: me.role,
        actorUserId: me.id,
        actorTeamId: me.teamId,
        actorRegionId: me.regionId,
        changedByUserId: me.id,
        changedByName: me.name,
        toStatus,
      };
      if (mode === "selected") body.dealIds = selectedIds;
      if (fromStatus !== ANY_STATUS) body.fromStatus = fromStatus;
      else if (mode !== "selected") throw new Error("Choose a From status");
      if (toStatus === "Closed/Lost") body.lossReason = lossReason.trim();
      return api.post<BulkStatusResult>("/deals/bulk-status", body);
    },
    onSuccess: (result) => {
      if (result.deals?.length) {
        const byId = new Map(result.deals.map((d) => [d.id, d]));
        setDeals(useAppStore.getState().deals.map((d) => byId.get(d.id) ?? d));
      }
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      const parts = [`Updated ${result.updated} deal${result.updated === 1 ? "" : "s"}`];
      if (result.skippedLocked) parts.push(`${result.skippedLocked} locked skipped`);
      if (result.skippedUnchanged) parts.push(`${result.skippedUnchanged} already in target status`);
      toast({ title: "Bulk status update", description: parts.join(" · ") });
      onCompleted?.();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Bulk update failed", description: e.message, variant: "destructive" });
    },
  });

  const sameStatus = fromStatus !== ANY_STATUS && fromStatus === toStatus;
  const fromInvalid = mode === "by_status" && fromStatus === ANY_STATUS;
  const lossInvalid = toStatus === "Closed/Lost" && !lossReason.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Bulk update deal status
          </DialogTitle>
          <DialogDescription>
            Changes deal status (Active, Won, Lost, …). Pipeline stage is separate and is not
            changed here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {hasSelection && mode === "selected" && selectedStatusSummary ? (
            <div className="space-y-1 rounded-lg border border-blue-200/80 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-medium">
                {selectedDeals.length} selected deal{selectedDeals.length === 1 ? "" : "s"}
              </p>
              <p>
                Current status: <span className="font-medium">{selectedStatusSummary}</span>
              </p>
            </div>
          ) : null}

          {hasSelection && (
            <div className="space-y-1.5">
              <Label className="text-xs">Scope</Label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  const next = v as "selected" | "by_status";
                  setMode(next);
                  if (next === "by_status" && fromStatus === ANY_STATUS) {
                    setFromStatus(pickDefaultFromStatus(fromOptions, counts));
                  }
                  if (next === "selected") setFromStatus(ANY_STATUS);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selected">
                    Selected deals ({selectedIds.length})
                  </SelectItem>
                  <SelectItem value="by_status">All filtered deals with a status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">From status</Label>
            <Select value={fromStatus} onValueChange={setFromStatus}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="From status" />
              </SelectTrigger>
              <SelectContent>
                {mode === "selected" && (
                  <SelectItem value={ANY_STATUS}>Any status (all selected)</SelectItem>
                )}
                {fromOptions.map((s) => {
                  const c = counts.get(s) ?? 0;
                  return (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                      {c > 0 ? ` (${c})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">To status</Label>
            <Select
              value={toStatus}
              onValueChange={(v) => setToStatus(v as DealPipelineStatus)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="To status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex flex-col items-start">
                      <span>{statusLabel(s)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {DEAL_STATUS_META[s].description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {toStatus === "Closed/Lost" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Loss reason (required)</Label>
              <Textarea
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                placeholder="Why were these deals lost?"
                className="min-h-[72px] text-sm"
              />
            </div>
          )}

          <div className="space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{willUpdate}</span> deal
              {willUpdate === 1 ? "" : "s"} will move to status{" "}
              <span className="font-medium text-foreground">{statusLabel(toStatus)}</span>
            </p>
            {unchangedCount > 0 && <p>{unchangedCount} already in the target status</p>}
            {lockedInScope > 0 && (
              <p>
                {lockedInScope} locked deal{lockedInScope === 1 ? "" : "s"} will be skipped
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              mutation.isPending || willUpdate <= 0 || sameStatus || fromInvalid || lossInvalid
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              `Update ${willUpdate || 0}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
