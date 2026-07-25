import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import type { Deal } from "@/types";
import {
  buildDealsFromExcelRows,
  downloadDealsTemplate,
  parseDealsWorkbook,
  type AgentResolution,
  type DealExcelRow,
  type DuplicateMode,
} from "@/lib/bulkDealExcel";
import { cn } from "@/lib/utils";

async function saveDealsToApi(
  creates: Deal[],
  updates: Deal[],
  meta: { meId: string; meName: string; role: string; teamId: string; regionId: string },
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  if (creates.length) {
    const payload = creates.map((d) => {
      const { id: _omitId, ...rest } = d;
      return {
        ...rest,
        changedByUserId: meta.meId,
        changedByName: meta.meName,
        createdByUserId: meta.meId,
        createdByName: meta.meName,
        actorRole: meta.role,
      };
    });

    const bulkUrl = apiUrl("/api/deals/bulk");
    const chunkSize = 200;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const bulkRes = await fetch(bulkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (bulkRes.ok) {
        const body = (await bulkRes.json().catch(() => ({}))) as { created?: number };
        created += body.created ?? chunk.length;
        continue;
      }
      if (bulkRes.status === 413) {
        throw new Error(
          "Upload too large (413). Reduce rows per import or increase server/proxy body size limits.",
        );
      }
      if (bulkRes.status !== 404 && bulkRes.status !== 405) {
        const msg = await bulkRes.text().catch(() => bulkRes.statusText);
        throw new Error(msg || `Bulk save failed (${bulkRes.status})`);
      }
      for (const d of chunk) {
        const r = await fetch(apiUrl("/api/deals"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
        if (!r.ok) {
          const lastErr = (await r.text().catch(() => r.statusText)) || `${r.status}`;
          throw new Error(lastErr || "Could not save deals (single-item API failed).");
        }
        created += 1;
      }
    }
  }

  for (const d of updates) {
    const r = await fetch(apiUrl(`/api/deals/${encodeURIComponent(d.id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...d,
        actorRole: meta.role,
        actorUserId: meta.meId,
        actorTeamId: meta.teamId,
        actorRegionId: meta.regionId,
        changedByUserId: meta.meId,
        changedByName: meta.meName,
      }),
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => r.statusText);
      throw new Error(msg || `Failed to overwrite deal ${d.id}`);
    }
    updated += 1;
  }

  return { created, updated };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingDeals: Deal[];
  onImported: () => void | Promise<void>;
};

export function BulkImportDealsDialog({ open, onOpenChange, existingDeals, onImported }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);

  const salesUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.status !== "disabled" &&
          (u.role === "sales_rep" || u.role === "sales_manager" || u.role === "super_admin"),
      ),
    [users],
  );

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<{ rowIndex: number; data: DealExcelRow }[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [unmatchedAgents, setUnmatchedAgents] = useState<string[]>([]);
  const [agentResolution, setAgentResolution] = useState<AgentResolution>({});
  const [preview, setPreview] = useState<{
    newCount: number;
    dupCount: number;
    unmatchedCount: number;
  } | null>(null);

  const reset = () => {
    setFile(null);
    setParsedRows([]);
    setParseErrors([]);
    setUnmatchedAgents([]);
    setAgentResolution({});
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const unresolvedAgents = unmatchedAgents.filter((name) => !agentResolution[name.toLowerCase()]);

  const refreshPreview = async (
    rows: { rowIndex: number; data: DealExcelRow }[],
    resolution: AgentResolution,
  ) => {
    if (!rows.length) {
      setPreview(null);
      setUnmatchedAgents([]);
      return;
    }
    const { results, unmatchedAgents: agents } = await buildDealsFromExcelRows(rows, {
      me,
      users,
      teams,
      existingDeals,
      agentResolution: resolution,
      allowFallbackOwner: false,
    });
    setUnmatchedAgents(agents);
    setPreview({
      newCount: results.filter((r) => !r.existingDealId).length,
      dupCount: results.filter((r) => r.existingDealId).length,
      unmatchedCount: agents.filter((n) => !resolution[n.toLowerCase()]).length,
    });
  };

  const handlePick = async (f: File | null) => {
    setFile(f);
    setParseErrors([]);
    setParsedRows([]);
    setUnmatchedAgents([]);
    setAgentResolution({});
    setPreview(null);
    if (!f) return;
    const { rows, errors } = await parseDealsWorkbook(f);
    setParseErrors(errors);
    setParsedRows(rows);
    if (errors.length && !rows.length) {
      toast({
        title: "Could not read rows",
        description: errors.map((e) => `Row ${e.row}: ${e.message}`).join("; "),
        variant: "destructive",
      });
      return;
    }
    await refreshPreview(rows, {});
  };

  const setAgentMapping = (agentName: string, userId: string) => {
    const next = { ...agentResolution, [agentName.toLowerCase()]: userId };
    setAgentResolution(next);
    void refreshPreview(parsedRows, next);
  };

  const handleImport = async () => {
    if (!parsedRows.length) {
      toast({ title: "Nothing to import", description: "Choose a valid Excel file first.", variant: "destructive" });
      return;
    }
    if (unresolvedAgents.length) {
      toast({
        title: "Map unmatched sales agents",
        description: `Select an executive for: ${unresolvedAgents.slice(0, 3).join(", ")}${unresolvedAgents.length > 3 ? "…" : ""}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { results, errors } = await buildDealsFromExcelRows(parsedRows, {
        me,
        users,
        teams,
        existingDeals,
        agentResolution,
        allowFallbackOwner: false,
      });

      if (errors.length && !results.length) {
        toast({
          title: "Import failed",
          description: errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`).join("; "),
          variant: "destructive",
        });
        setParseErrors(errors);
        return;
      }

      const creates: Deal[] = [];
      const updates: Deal[] = [];
      let skippedDup = 0;

      for (const r of results) {
        if (r.existingDealId) {
          if (duplicateMode === "overwrite") {
            updates.push({ ...r.deal, id: r.existingDealId });
          } else {
            skippedDup += 1;
          }
        } else {
          creates.push({ ...r.deal, id: "pending" });
        }
      }

      if (!creates.length && !updates.length) {
        toast({
          title: "Nothing imported",
          description:
            skippedDup > 0
              ? `All ${skippedDup} row(s) were duplicates (skip mode). Switch to Overwrite to update them.`
              : "No valid deals to import.",
        });
        return;
      }

      const { created, updated } = await saveDealsToApi(creates, updates, {
        meId: me.id,
        meName: me.name,
        role: me.role,
        teamId: me.teamId,
        regionId: me.regionId,
      });

      const listRes = await fetch(
        apiUrl(`/api/deals?actorRole=${encodeURIComponent(me.role)}&actorUserId=${encodeURIComponent(me.id)}`),
      );
      if (listRes.ok) {
        const list = (await listRes.json()) as Deal[];
        queryClient.setQueryData(QK.deals({ role: me.role }), list);
        useAppStore.getState().setDeals(list);
      } else {
        await queryClient.invalidateQueries({ queryKey: QK.deals({ role: me.role }) });
        await queryClient.refetchQueries({ queryKey: QK.deals({ role: me.role }) });
      }

      const parts = [
        created ? `${created} created` : null,
        updated ? `${updated} overwritten` : null,
        skippedDup ? `${skippedDup} duplicate(s) skipped` : null,
        errors.length ? `${errors.length} row(s) failed` : null,
      ].filter(Boolean);

      toast({ title: "Import complete", description: parts.join(" · ") || "Done." });
      if (errors.length) setParseErrors(errors);
      reset();
      onOpenChange(false);
      await onImported();
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import deals</DialogTitle>
          <DialogDescription>
            Upload your CRM sheet (Date, Client Id, Customer, subscription period, modules, licenses, Total Deal
            Value Amount / With GST, payments, team, sales agent, etc.). Amount without tax and tax are aligned from
            Amount + With GST. Unmatched sales agents must be mapped manually — nothing is assigned at random.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadDealsTemplate()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download CRM template
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Choose Excel file
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => void handlePick(e.target.files?.[0] ?? null)}
          />
        </div>

        {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}

        {parsedRows.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm">
              Parsed <span className="font-medium">{parsedRows.length}</span> row(s)
              {preview ? (
                <>
                  {" "}
                  · <span className="font-medium text-emerald-700 dark:text-emerald-400">{preview.newCount}</span>{" "}
                  new
                  {" · "}
                  <span className="font-medium text-amber-700 dark:text-amber-400">{preview.dupCount}</span>{" "}
                  duplicate(s)
                </>
              ) : null}
            </p>

            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Duplicate rows
              </Label>
              <RadioGroup
                value={duplicateMode}
                onValueChange={(v) => setDuplicateMode(v as DuplicateMode)}
                className="grid gap-2 sm:grid-cols-2"
              >
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors",
                    duplicateMode === "skip" ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <RadioGroupItem value="skip" id="dup-skip" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Skip duplicates</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Do not import rows that already exist (matched by Client Id / invoice #).
                    </span>
                  </span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors",
                    duplicateMode === "overwrite" ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <RadioGroupItem value="overwrite" id="dup-overwrite" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Overwrite duplicates</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Update existing deals with sheet values (totals, tax, payments, owner, remarks).
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>
          </div>
        )}

        {unmatchedAgents.length > 0 && (
          <div className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div>
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                Unmatched sales agents ({unresolvedAgents.length} remaining)
              </p>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                These names from the sheet are not in Users. Pick the correct executive for each before importing.
              </p>
            </div>
            <div className="space-y-2">
              {unmatchedAgents.map((name) => (
                <div
                  key={name}
                  className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr]"
                >
                  <p className="truncate text-sm font-medium">{name}</p>
                  <Select
                    value={agentResolution[name.toLowerCase()] || ""}
                    onValueChange={(v) => setAgentMapping(name, v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select executive…" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.role !== "sales_rep" ? ` (${u.role})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="max-h-32 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {parseErrors.slice(0, 12).map((e) => (
              <div key={`${e.row}-${e.message}`}>
                Row {e.row}: {e.message}
              </div>
            ))}
            {parseErrors.length > 12 && <div>…and {parseErrors.length - 12} more</div>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || parsedRows.length === 0 || unresolvedAgents.length > 0}
            onClick={() => void handleImport()}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
