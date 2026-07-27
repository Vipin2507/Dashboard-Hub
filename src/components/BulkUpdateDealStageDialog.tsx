import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { dealStageLabel, normalizeDealStage } from "@/lib/dealStage";
import { resolveDealPipelineStatus } from "@/lib/dealStatus";
import { useAppStore } from "@/store/useAppStore";
import type { Deal } from "@/types";

type BulkStageResult = {
  updated: number;
  skippedLocked: number;
  skippedUnchanged: number;
  deals: Deal[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deals currently visible under filters (active, in scope). */
  deals: Deal[];
  stageOptions: string[];
  /** When set, dialog defaults to updating only these IDs. */
  selectedIds: string[];
  onCompleted?: () => void;
};

const ANY_STAGE = "__any__";

function countBy<T extends string>(values: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return map;
}

function formatCountMap(map: Map<string, number>, labelFn: (k: string) => string = (k) => k): string {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${labelFn(k)} (${n})`)
    .join(", ");
}

function stageCounts(list: Deal[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of list) {
    if (d.locked) continue;
    const key = normalizeDealStage(d.stage);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function pickDefaultFromStage(options: string[], counts: Map<string, number>): string {
  let best = options[0] ?? "Prospecting";
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

export function BulkUpdateDealStageDialog({
  open,
  onOpenChange,
  deals,
  stageOptions,
  selectedIds,
  onCompleted,
}: Props) {
  const me = useAppStore((s) => s.me);
  const setDeals = useAppStore((s) => s.setDeals);
  const queryClient = useQueryClient();

  const options = useMemo(
    () => Array.from(new Set(stageOptions.map((s) => normalizeDealStage(s)))),
    [stageOptions],
  );

  const hasSelection = selectedIds.length > 0;
  const [mode, setMode] = useState<"selected" | "by_stage">("by_stage");
  const [fromStage, setFromStage] = useState<string>(ANY_STAGE);
  const [toStage, setToStage] = useState<string>(options[0] ?? "Qualified");

  const counts = useMemo(() => stageCounts(deals), [deals]);

  const selectedDeals = useMemo(() => {
    if (!hasSelection) return [] as Deal[];
    const idSet = new Set(selectedIds);
    return deals.filter((d) => idSet.has(d.id));
  }, [deals, hasSelection, selectedIds]);

  const selectedStatusSummary = useMemo(() => {
    const map = countBy(
      selectedDeals.map((d) => resolveDealPipelineStatus(d.dealStatus, d.invoiceStatus)),
    );
    return formatCountMap(map);
  }, [selectedDeals]);

  const selectedStageSummary = useMemo(() => {
    const map = countBy(selectedDeals.map((d) => normalizeDealStage(d.stage)));
    return formatCountMap(map, dealStageLabel);
  }, [selectedDeals]);

  // Reset defaults whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const nextMode = hasSelection ? "selected" : "by_stage";
    setMode(nextMode);
    const defaultFrom = pickDefaultFromStage(options, counts);
    setFromStage(nextMode === "selected" ? ANY_STAGE : defaultFrom);
    const toCandidate =
      options.find((s) => s !== defaultFrom) ?? options[0] ?? "Qualified";
    setToStage(toCandidate);
  }, [open, hasSelection, options, counts]);

  const previewDeals = useMemo(() => {
    let list = deals.filter((d) => !d.locked);
    if (mode === "selected") {
      const idSet = new Set(selectedIds);
      list = list.filter((d) => idSet.has(d.id));
    }
    if (fromStage !== ANY_STAGE) {
      list = list.filter((d) => normalizeDealStage(d.stage) === normalizeDealStage(fromStage));
    }
    return list;
  }, [deals, mode, fromStage, selectedIds]);

  const lockedInScope = useMemo(() => {
    let list = deals.filter((d) => d.locked);
    if (mode === "selected") {
      const idSet = new Set(selectedIds);
      list = list.filter((d) => idSet.has(d.id));
    }
    if (fromStage !== ANY_STAGE) {
      list = list.filter((d) => normalizeDealStage(d.stage) === normalizeDealStage(fromStage));
    }
    return list.length;
  }, [deals, mode, fromStage, selectedIds]);

  const unchangedCount = previewDeals.filter(
    (d) => normalizeDealStage(d.stage) === normalizeDealStage(toStage),
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
        toStage: normalizeDealStage(toStage),
      };
      if (mode === "selected") {
        body.dealIds = selectedIds;
      }
      if (fromStage !== ANY_STAGE) {
        body.fromStage = normalizeDealStage(fromStage);
      } else if (mode !== "selected") {
        throw new Error("Choose a From pipeline stage");
      }
      return api.post<BulkStageResult>("/deals/bulk-stage", body);
    },
    onSuccess: (result) => {
      if (result.deals?.length) {
        const byId = new Map(result.deals.map((d) => [d.id, d]));
        setDeals(useAppStore.getState().deals.map((d) => byId.get(d.id) ?? d));
      }
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      const parts = [`Updated ${result.updated} deal${result.updated === 1 ? "" : "s"}`];
      if (result.skippedLocked) parts.push(`${result.skippedLocked} locked skipped`);
      if (result.skippedUnchanged) parts.push(`${result.skippedUnchanged} already in target stage`);
      toast({ title: "Bulk stage update", description: parts.join(" · ") });
      onCompleted?.();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Bulk update failed", description: e.message, variant: "destructive" });
    },
  });

  const sameStage =
    fromStage !== ANY_STAGE &&
    normalizeDealStage(fromStage) === normalizeDealStage(toStage);

  const fromInvalid = mode === "by_stage" && fromStage === ANY_STAGE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Bulk update pipeline stage
          </DialogTitle>
          <DialogDescription>
            Changes pipeline stage only (Prospecting, Qualified, Proposal…). Deal status
            (Active, Closed/Won, …) is separate and is not changed here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {hasSelection && mode === "selected" && (
            <div className="space-y-1 rounded-lg border border-blue-200/80 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-medium">{selectedDeals.length} selected deal{selectedDeals.length === 1 ? "" : "s"}</p>
              {selectedStatusSummary ? (
                <p>
                  Status: <span className="font-medium">{selectedStatusSummary}</span>
                </p>
              ) : null}
              {selectedStageSummary ? (
                <p>
                  Pipeline stage: <span className="font-medium">{selectedStageSummary}</span>
                </p>
              ) : null}
            </div>
          )}

          {hasSelection && (
            <div className="space-y-1.5">
              <Label className="text-xs">Scope</Label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  const next = v as "selected" | "by_stage";
                  setMode(next);
                  if (next === "by_stage" && fromStage === ANY_STAGE) {
                    setFromStage(pickDefaultFromStage(options, counts));
                  }
                  if (next === "selected") setFromStage(ANY_STAGE);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selected">
                    Selected deals ({selectedIds.length})
                  </SelectItem>
                  <SelectItem value="by_stage">All filtered deals in a stage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">From pipeline stage</Label>
            <Select value={fromStage} onValueChange={setFromStage}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="From pipeline stage" />
              </SelectTrigger>
              <SelectContent>
                {mode === "selected" && (
                  <SelectItem value={ANY_STAGE}>Any stage (all selected)</SelectItem>
                )}
                {options.map((s) => {
                  const c = counts.get(s) ?? 0;
                  return (
                    <SelectItem key={s} value={s}>
                      {dealStageLabel(s)}
                      {c > 0 ? ` (${c})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">To pipeline stage</Label>
            <Select value={toStage} onValueChange={setToStage}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="To pipeline stage" />
              </SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s} value={s}>
                    {dealStageLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{willUpdate}</span> deal
              {willUpdate === 1 ? "" : "s"} will move to pipeline stage{" "}
              <span className="font-medium text-foreground">{dealStageLabel(toStage)}</span>
            </p>
            {unchangedCount > 0 && <p>{unchangedCount} already in the target stage</p>}
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
            disabled={mutation.isPending || willUpdate <= 0 || sameStage || fromInvalid}
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
