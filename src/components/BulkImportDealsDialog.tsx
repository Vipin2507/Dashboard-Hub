import { useRef, useState } from "react";
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
import { toast } from "@/components/ui/use-toast";
import { apiUrl } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import type { Deal } from "@/types";
import { buildDealsFromExcelRows, downloadDealsTemplate, parseDealsWorkbook, type DealExcelRow } from "@/lib/bulkDealExcel";

async function saveDealsToApi(deals: Deal[], meta: { meId: string; meName: string; role: string }): Promise<void> {
  const payload = deals.map((d) => {
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
  const bulkRes = await fetch(bulkUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (bulkRes.ok) return;

  if (bulkRes.status !== 404 && bulkRes.status !== 405) {
    const msg = await bulkRes.text().catch(() => bulkRes.statusText);
    throw new Error(msg || `Bulk save failed (${bulkRes.status})`);
  }

  let failed = 0;
  let lastErr = "";
  for (const d of payload) {
    const r = await fetch(apiUrl("/api/deals"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    if (!r.ok) {
      failed += 1;
      lastErr = (await r.text().catch(() => r.statusText)) || `${r.status}`;
    }
  }
  if (failed === payload.length) throw new Error(lastErr || "Could not save deals (single-item API also failed).");
  if (failed > 0) throw new Error(`${payload.length - failed} saved, ${failed} failed. Last error: ${lastErr}`);
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

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<{ rowIndex: number; data: DealExcelRow }[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFile(null);
    setParsedRows([]);
    setParseErrors([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handlePick = async (f: File | null) => {
    setFile(f);
    setParseErrors([]);
    setParsedRows([]);
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
    }
  };

  const handleImport = async () => {
    if (!parsedRows.length) {
      toast({ title: "Nothing to import", description: "Choose a valid Excel file first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { deals, errors } = await buildDealsFromExcelRows(parsedRows, { me });

      // De-dupe by invoice number (if present) to avoid accidental double imports
      const existingInvoiceNumbers = new Set(
        existingDeals.map((d) => String(d.invoiceNumber ?? "").trim()).filter(Boolean),
      );
      const deduped = deals.filter((d) => {
        const inv = String(d.invoiceNumber ?? "").trim();
        if (!inv) return true;
        return !existingInvoiceNumbers.has(inv);
      });

      if (errors.length && !deduped.length) {
        toast({
          title: "Import failed",
          description: errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`).join("; "),
          variant: "destructive",
        });
        setParseErrors(errors);
        return;
      }

      await saveDealsToApi(deduped, { meId: me.id, meName: me.name, role: me.role });

      const listRes = await fetch(apiUrl("/api/deals"));
      if (listRes.ok) {
        const list = (await listRes.json()) as Deal[];
        queryClient.setQueryData(QK.deals({ role: me.role }), list);
        useAppStore.getState().setDeals(list);
      } else {
        await queryClient.invalidateQueries({ queryKey: QK.deals({ role: me.role }) });
        await queryClient.refetchQueries({ queryKey: QK.deals({ role: me.role }) });
      }

      const extra = errors.length > 0 ? ` ${errors.length} row(s) skipped (see details).` : "";
      toast({ title: "Import complete", description: `${deduped.length} deal(s) created.${extra}` });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk import deals</DialogTitle>
          <DialogDescription>
            Download the Excel template, fill one row per invoice/deal, then upload. Customer Name must match an existing
            customer (or the importer will create it in your region).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadDealsTemplate()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download template
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
          <p className="text-sm">
            Ready to import <span className="font-medium">{parsedRows.length}</span> row(s).
          </p>
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
          <Button type="button" disabled={loading || parsedRows.length === 0} onClick={() => void handleImport()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

