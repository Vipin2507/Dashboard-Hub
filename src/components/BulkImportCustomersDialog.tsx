import { useRef, useState } from "react";
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
import { downloadCustomersTemplate, parseCustomersWorkbook, type CustomerBulkRow } from "@/lib/bulkExcel";
import type { Region } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: Region[];
  onImported: () => void;
};

export function BulkImportCustomersDialog({ open, onOpenChange, regions, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [preview, setPreview] = useState<CustomerBulkRow[]>([]);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFile(null);
    setParseErrors([]);
    setPreview([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handlePick = async (f: File | null) => {
    setFile(f);
    setParseErrors([]);
    setPreview([]);
    if (!f) return;
    const { rows, errors } = await parseCustomersWorkbook(f);
    setParseErrors(errors);
    setPreview(rows);
    if (errors.length && !rows.length) {
      toast({ title: "Could not read rows", description: errors.map((e) => `Row ${e.row}: ${e.message}`).join("; "), variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!preview.length) {
      toast({ title: "Nothing to import", description: "Fix template errors or choose another file.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/customers/bulk"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });
      if (!res.ok) throw new Error("Import failed");
      const created = (await res.json()) as CustomerBulkRow[];
      toast({
        title: "Import complete",
        description: `${Array.isArray(created) ? created.length : preview.length} customer(s) created.`,
      });
      reset();
      onOpenChange(false);
      onImported();
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
          <DialogTitle>Bulk import customers</DialogTitle>
          <DialogDescription>
            Download the Excel template, fill one row per customer, then upload. Region ID must match the Region reference sheet.
            This imports customers only — to import proposal rows, use{" "}
            <span className="font-medium text-foreground">Proposals → Bulk import</span> with the proposals template.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadCustomersTemplate(regions.map((r) => ({ id: r.id, name: r.name })))}>
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
        {preview.length > 0 && (
          <p className="text-sm">
            Ready to import <span className="font-medium">{preview.length}</span> row(s).
          </p>
        )}
        {(parseErrors.length > 0 || preview.length > 0) && parseErrors.length > 0 && (
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
          <Button type="button" disabled={loading || !preview.length} onClick={() => void handleImport()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
