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
  const [toStage, setToStage] = useState<string>(options[0] ?? "Won");

  const counts = useMemo(() => stageCounts(deals), [deals]);

  // Reset defaults whenever the dialog opens so From is visible and points at an active stage.
  useEffect(() => {
    if (!open) return;
    const nextMode = hasSelection ? "selected" : "by_stage";
    setMode(nextMode);
    const defaultFrom = pickDefaultFromStage(options, counts);
    setFromStage(nextMode === "selected" ? ANY_STAGE : defaultFrom);
    const toCandidate =
      options.find((s) => s !== defaultFrom) ?? options[0] ?? "Won";
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
        throw new Error("Choose a From stage");
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
            Bulk update stage
          </DialogTitle>
          <DialogDescription>
            Move multiple deals from one pipeline stage to another. Locked deals are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
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
            <Label className="text-xs">From stage</Label>
            <Select value={fromStage} onValueChange={setFromStage}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="From stage" />
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
            <Label className="text-xs">To stage</Label>
            <Select value={toStage} onValueChange={setToStage}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="To stage" />
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
              {willUpdate === 1 ? "" : "s"} will move to{" "}
              <span className="font-medium text-foreground">{dealStageLabel(toStage)}</span>
            </p>
            {unchangedCount > 0 && <p>{unchangedCount} already in the target stage</p>}
            {lockedInScope > 0 && (
              <p>
                {lockedInScope} locked deal{lockedInScope === 1 ? "" : "s"} will be skipped
              </p>
            )}
            {fromStage !== ANY_STAGE && (
              <p>
                Matching deals currently in{" "}
                <span className="font-medium text-foreground">{dealStageLabel(fromStage)}</span>
                {(counts.get(normalizeDealStage(fromStage)) ?? 0) > 0
                  ? ` (${counts.get(normalizeDealStage(fromStage))})`
                  : ""}
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
