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
import {
  downloadProposalsTemplate,
  parseProposalsWorkbook,
  buildProposalsFromExcelRows,
  type ProposalExcelRow,
} from "@/lib/bulkProposalExcel";
import { useAppStore } from "@/store/useAppStore";
import type { Customer, CustomerStatus, Proposal, Region } from "@/types";

async function saveProposalsToApi(proposals: Proposal[]): Promise<void> {
  const bulkUrl = apiUrl("/api/proposals/bulk");
  const bulkRes = await fetch(bulkUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposals),
  });

  if (bulkRes.ok) return;

  if (bulkRes.status !== 404 && bulkRes.status !== 405) {
    const msg = await bulkRes.text().catch(() => bulkRes.statusText);
    throw new Error(msg || `Bulk save failed (${bulkRes.status})`);
  }

  let failed = 0;
  let lastErr = "";
  for (const p of proposals) {
    const r = await fetch(apiUrl("/api/proposals"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!r.ok) {
      failed += 1;
      lastErr = (await r.text().catch(() => r.statusText)) || `${r.status}`;
    }
  }
  if (failed === proposals.length) {
    throw new Error(lastErr || "Could not save proposals (single-item API also failed).");
  }
  if (failed > 0) {
    throw new Error(`${proposals.length - failed} saved, ${failed} failed. Last error: ${lastErr}`);
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: Region[];
  existingProposals: Proposal[];
  onImported: () => void | Promise<void>;
};

export function BulkImportProposalsDialog({
  open,
  onOpenChange,
  regions,
  existingProposals,
  onImported,
}: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const setCustomers = useAppStore((s) => s.setCustomers);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<{ rowIndex: number; data: ProposalExcelRow }[]>([]);
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
    const { rows, errors } = await parseProposalsWorkbook(f);
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
      toast({
        title: "Nothing to import",
        description: "Choose a valid Excel file first.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const rows = parsedRows;

      const defaultRegionId = regions[0]?.id ?? me.regionId;
      const { proposals, errors } = await buildProposalsFromExcelRows(rows, {
        me,
        users,
        regions,
        inventoryItems,
        existingProposals,
        defaultRegionId,
      });

      const wonCount = proposals.filter((p) => p.status === "won").length;
      if (wonCount > 0) {
        toast({
          title: "Check proposal statuses",
          description:
            `${wonCount} imported row(s) have status “Won”. Are you sure? Won is usually set after negotiation.`,
        });
      }

      if (errors.length && !proposals.length) {
        toast({
          title: "Import failed",
          description: errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`).join("; "),
          variant: "destructive",
        });
        setParseErrors(errors);
        return;
      }

      await saveProposalsToApi(proposals);

      const listRes = await fetch(apiUrl("/api/proposals"));
      if (listRes.ok) {
        const list = (await listRes.json()) as Proposal[];
        queryClient.setQueryData(QK.proposals(), list);
        useAppStore.getState().setProposals(list);
      } else {
        await queryClient.invalidateQueries({ queryKey: QK.proposals() });
        await queryClient.refetchQueries({ queryKey: QK.proposals() });
      }

      // New customers may have been created during the import. Refresh customers so they appear immediately.
      const customersRes = await fetch(apiUrl("/api/customers"));
      if (customersRes.ok) {
        type ApiCustomer = {
          id: string;
          leadId?: string;
          name: string;
          customerName?: string | null;
          companyName?: string | null;
          state?: string | null;
          gstin?: string | null;
          regionId: string;
          city?: string | null;
          email?: string | null;
          primaryPhone?: string | null;
          status?: string | null;
          createdAt?: string;
          salesExecutive?: string | null;
          accountManager?: string | null;
          deliveryExecutive?: string | null;
          tags?: string | string[] | null;
        };

        const toUiCustomer = (row: ApiCustomer): Customer => {
          const regionName = regions.find((r) => r.id === row.regionId)?.name ?? "Unknown";
          const assignedUser =
            users.find((u) => u.name === row.salesExecutive) ??
            users.find((u) => u.regionId === row.regionId && u.role === "sales_rep") ??
            users[0];
          const nowIso = row.createdAt ?? new Date().toISOString();
          const customerName = (row.customerName ?? "").trim();
          const companyName = (row.companyName ?? "").trim();
          const fallback = (companyName || customerName || row.name || "Company").trim();
          return {
            id: row.id,
            customerNumber: row.leadId ?? `CUST-${row.id.slice(-4).toUpperCase()}`,
            companyName: companyName || (customerName ? "" : (row.name ?? "").trim()) || fallback,
            customerName: customerName || undefined,
            status: (row.status as CustomerStatus) ?? "active",
            gstin: row.gstin ?? undefined,
            pan: undefined,
            industry: undefined,
            website: undefined,
            address: {
              city: row.city ?? undefined,
              state: row.state ?? undefined,
              country: "India",
            },
            contacts: [
              {
                id: `ct-${row.id}`,
                name: customerName || fallback,
                email: row.email ?? undefined,
                phone: row.primaryPhone ?? undefined,
                isPrimary: true,
              },
            ],
            regionId: row.regionId,
            regionName,
            teamId: assignedUser?.teamId ?? users[0]?.teamId ?? "t1",
            assignedTo: assignedUser?.id ?? users[0]?.id ?? me.id,
            assignedToName: assignedUser?.name ?? row.salesExecutive ?? "Unassigned",
            tags: [],
            notes: [],
            attachments: [],
            productLines: [],
            payments: [],
            invoices: [],
            supportTickets: [],
            activityLog: [],
            totalRevenue: 0,
            totalDealValue: 0,
            activeProposalsCount: 0,
            activeDealsCount: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: me.id,
          };
        };

        const customerRows = (await customersRes.json()) as ApiCustomer[];
        const customers: Customer[] = customerRows.map(toUiCustomer);
        queryClient.setQueryData(QK.customers(), customers);
        setCustomers(customers);
      } else {
        await queryClient.invalidateQueries({ queryKey: QK.customers() });
      }

      const extra =
        errors.length > 0
          ? ` ${errors.length} row(s) skipped (see details).`
          : "";
      toast({
        title: "Import complete",
        description: `${proposals.length} proposal(s) created.${extra}`,
        variant: errors.length ? "default" : "default",
      });
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
          <DialogTitle>Bulk import proposals</DialogTitle>
          <DialogDescription>
            Template columns match the proposal tracker: Lead Id, Company Name, Deal Value, Proposal Stage, etc. Unknown
            companies are created as leads when Region ID (optional) is set or your default region is used.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadProposalsTemplate(regions.map((r) => ({ id: r.id, name: r.name })))}
          >
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
