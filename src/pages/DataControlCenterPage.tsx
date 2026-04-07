import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { formatDistanceToNow } from "date-fns";
import { Database, Download, History, Pencil, RefreshCw, Scale, Shield, Upload, Plus, Trash2 } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";

type DccField = { key: string; label: string; editable: boolean };
type DccModule = { id: string; label: string; fields: DccField[] };

type RowBase = Record<string, unknown> & {
  id: string;
  _lastModified?: { by: string; at: string } | null;
};

function actorParams(me: { id: string; name: string; role: string }) {
  const q = new URLSearchParams({
    actorRole: me.role,
    userId: me.id,
    userName: me.name,
  });
  return q.toString();
}

function displayCellValue(row: RowBase, fieldKey: string): string {
  if (fieldKey === "assignedTo") {
    const name = row.assignedToName as string | undefined;
    const id = row.assignedTo as string | undefined;
    return name || id || "";
  }
  const v = row[fieldKey];
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function moduleFileSlug(id: string) {
  return id.replace(/_/g, "-");
}

export default function DataControlCenterPage() {
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const regions = useAppStore((s) => s.regions);
  const queryClient = useQueryClient();

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [compareField, setCompareField] = useState<string | null>(null);
  const [comparisonOn, setComparisonOn] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  /** Multi-field bulk: list of { fieldKey, value } — all applied to target rows */
  const [bulkFieldRows, setBulkFieldRows] = useState<{ fieldKey: string; value: string }[]>([{ fieldKey: "", value: "" }]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importParseError, setImportParseError] = useState<string | null>(null);

  const metaQuery = useQuery({
    queryKey: QK.dataControlMeta(),
    queryFn: () =>
      api.get<{
        modules: DccModule[];
        totalModuleCount: number;
        totalFieldCount: number;
      }>(`/data-control/meta?${actorParams(me)}`),
  });

  const rowsQuery = useQuery({
    queryKey: QK.dataControlRows(activeModule ?? ""),
    queryFn: () =>
      api.get<{ module: string; rows: RowBase[] }>(
        `/data-control/rows?module=${encodeURIComponent(activeModule!)}&${actorParams(me)}`,
      ),
    enabled: !!activeModule,
  });

  const currentModuleDef = useMemo(
    () => metaQuery.data?.modules.find((m) => m.id === activeModule),
    [metaQuery.data?.modules, activeModule],
  );

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [activeModule]);

  useEffect(() => {
    if (!activeModule || selectedKeys.size === 0) return;
    const keys = Array.from(selectedKeys);
    void api
      .post("/data-control/log-view", {
        module: activeModule,
        fieldKeys: keys,
        actorRole: me.role,
        userId: me.id,
        userName: me.name,
      })
      .catch(() => undefined);
  }, [activeModule, selectedKeys, me.id, me.name, me.role]);

  const patchMutation = useMutation({
    mutationFn: (body: { module: string; recordId: string; fieldKey: string; value: unknown }) =>
      api.patch("/data-control/cell", {
        ...body,
        actorRole: me.role,
        userId: me.id,
        userName: me.name,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.dataControlRows(activeModule ?? "") });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const bulkPatchMutation = useMutation({
    mutationFn: (body: { module: string; recordIds: string[]; fields: Record<string, unknown> }) =>
      api.post("/data-control/bulk-patch", {
        ...body,
        actorRole: me.role,
        userId: me.id,
        userName: me.name,
      }),
    onSuccess: (data: { updated: number; errors?: { id: string; fieldKey?: string; error?: string }[] }) => {
      queryClient.invalidateQueries({ queryKey: QK.dataControlRows(activeModule ?? "") });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      const errPart =
        data.errors?.length ? ` ${data.errors.length} row(s) had errors (see server response).` : "";
      toast({
        title: "Bulk update applied",
        description: `${data.updated} record(s) fully updated.${errPart}`,
        variant: data.errors?.length ? "destructive" : "default",
      });
      setBulkOpen(false);
      setBulkConfirmOpen(false);
      setBulkFieldRows([{ fieldKey: "", value: "" }]);
      setSelectedRowIds(new Set());
    },
    onError: (e: Error) => toast({ title: "Bulk update failed", description: e.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: (body: { module: string; rows: Record<string, unknown>[] }) =>
      api.post<{ created: number; errors?: { index: number; error: string }[] }>("/data-control/bulk-import", {
        ...body,
        actorRole: me.role,
        userId: me.id,
        userName: me.name,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QK.dataControlRows(activeModule ?? "") });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      const failed = data.errors?.length ?? 0;
      toast({
        title: "Bulk import finished",
        description: `Created ${data.created} record(s).${failed ? ` ${failed} row(s) failed.` : ""}`,
        variant: failed ? "destructive" : "default",
      });
      setImportOpen(false);
      setImportRows([]);
      setImportParseError(null);
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const rows = rowsQuery.data?.rows ?? [];

  const filteredRows = useMemo(() => {
    let list = rows.map((r) => ({ ...r }));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        Object.entries(r).some(
          ([k, v]) =>
            k !== "_lastModified" &&
            String(v ?? "")
              .toLowerCase()
              .includes(q),
        ),
      );
    }
    for (const [fk, fv] of Object.entries(columnFilters)) {
      if (!fv.trim()) continue;
      const needle = fv.trim().toLowerCase();
      list = list.filter((r) => displayCellValue(r, fk).toLowerCase().includes(needle));
    }
    if (comparisonOn && compareField) {
      list = [...list].sort((a, b) =>
        displayCellValue(a, compareField).localeCompare(displayCellValue(b, compareField), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
    }
    return list;
  }, [rows, search, columnFilters, comparisonOn, compareField]);

  /** Bulk targets: checked rows (any still in module), or all filtered rows if none checked */
  const targetRecordIds = useMemo(() => {
    const allIds = new Set(rows.map((r) => r.id));
    if (selectedRowIds.size > 0) {
      return [...selectedRowIds].filter((id) => allIds.has(id));
    }
    return filteredRows.map((r) => r.id);
  }, [rows, filteredRows, selectedRowIds]);

  const toggleRowSelected = (id: string) => {
    setSelectedRowIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllFiltered = () => {
    setSelectedRowIds(new Set(filteredRows.map((r) => r.id)));
  };

  const clearRowSelection = () => setSelectedRowIds(new Set());

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedRowIds.has(r.id));

  const selectAllFields = useCallback(() => {
    if (!currentModuleDef) return;
    setSelectedKeys(new Set(currentModuleDef.fields.map((f) => f.key)));
  }, [currentModuleDef]);

  const clearFields = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const toggleField = (key: string) => {
    setSelectedKeys((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const selectedFieldDefs = useMemo(() => {
    if (!currentModuleDef) return [];
    return currentModuleDef.fields.filter((f) => selectedKeys.has(f.key));
  }, [currentModuleDef, selectedKeys]);

  const exportXlsx = () => {
    if (!activeModule || selectedFieldDefs.length === 0) return;
    const cols = selectedFieldDefs.map((f) => ({ key: f.key, label: f.label }));
    const data = filteredRows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const c of cols) o[c.label] = displayCellValue(r, c.key);
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    const d = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${moduleFileSlug(activeModule)}_export_${d}.xlsx`);
  };

  const buildBulkFieldsObject = (): Record<string, unknown> | null => {
    if (!activeModule) return null;
    const fields: Record<string, unknown> = {};
    const numericKeys = new Set(["dealValue", "totalAmount", "amountPaid", "quantity"]);
    for (const row of bulkFieldRows) {
      const key = row.fieldKey.trim();
      if (!key) continue;
      const def = selectedFieldDefs.find((f) => f.key === key);
      if (!def?.editable) continue;
      let v: unknown = row.value;
      if (numericKeys.has(key)) v = Number(row.value);
      fields[key] = v;
    }
    return Object.keys(fields).length ? fields : null;
  };

  const runBulk = () => {
    const fields = buildBulkFieldsObject();
    if (!activeModule || !fields || targetRecordIds.length === 0) return;
    setBulkConfirmOpen(true);
  };

  const confirmBulk = () => {
    if (!activeModule) return;
    const fields = buildBulkFieldsObject();
    if (!fields) return;
    bulkPatchMutation.mutate({ module: activeModule, recordIds: targetRecordIds, fields });
  };

  const importSupported =
    activeModule === "customer_management" ||
    activeModule === "inventory" ||
    activeModule === "deals_section";

  const downloadImportTemplate = () => {
    if (!activeModule) return;
    const headers =
      activeModule === "customer_management"
        ? [
            "regionId",
            "customerName",
            "contact",
            "email",
            "city",
            "status",
            "assignedExecutive",
            "remarks",
            "joinDate",
          ]
        : activeModule === "inventory"
          ? [
              "itemName",
              "itemCode",
              "category",
              "unitOfMeasure",
              "quantity",
              "unitPrice",
              "costPrice",
              "taxRate",
              "status",
              "supplier",
              "location",
              "remarks",
            ]
          : [
              "customerId",
              "ownerUserId",
              "dealTitle",
              "dealValue",
              "status",
              "priority",
              "dealSource",
              "expectedClose",
              "followUpDate",
              "remarks",
            ];
    const example =
      activeModule === "customer_management"
        ? ["<region id>", "Example Pvt Ltd", "9990001111", "a@b.com", "Mumbai", "active", "", "", ""]
        : activeModule === "inventory"
          ? ["Sample item", "ITEM-001", "General", "unit", "10", "100", "0", "18", "active", "", "", ""]
          : ["<customer id>", "<user id>", "New deal", "50000", "Qualification", "Medium", "", "", "", ""];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import");
    XLSX.writeFile(wb, `${moduleFileSlug(activeModule)}_import_template.xlsx`);
  };

  const parseImportWorkbook = (file: File) => {
    setImportParseError(null);
    setImportRows([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Empty file");
        const wb = XLSX.read(data, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (!json.length) throw new Error("No data rows after the header");
        setImportRows(json);
      } catch (err) {
        setImportParseError(err instanceof Error ? err.message : "Could not parse file");
      }
    };
    reader.readAsBinaryString(file);
  };

  if (me.role !== "super_admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Topbar
        title="Data control center"
        subtitle="Super Admin — per-module bulk add, multi-field bulk update, row selection, and export"
      />
      <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default" className="gap-1">
            <Shield className="h-3 w-3" />
            Super Admin
          </Badge>
          <p className="text-sm text-muted-foreground">
            View actions are logged. Edits write to the database immediately and are audited.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total modules</p>
              <p className="text-2xl font-semibold">{metaQuery.data?.totalModuleCount ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total fields</p>
              <p className="text-2xl font-semibold">{metaQuery.data?.totalFieldCount ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Fields selected</p>
              <p className="text-2xl font-semibold">{selectedKeys.size}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Records loaded</p>
              <p className="text-2xl font-semibold">{filteredRows.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Step 1 — Module</Label>
          <div className="flex flex-wrap gap-2">
            {(metaQuery.data?.modules ?? []).map((m) => (
              <Button
                key={m.id}
                type="button"
                variant={activeModule === m.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveModule(m.id);
                  setSelectedKeys(new Set());
                  setColumnFilters({});
                  setCompareField(null);
                  setComparisonOn(false);
                }}
              >
                <Database className="h-3.5 w-3.5 mr-1.5" />
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        {currentModuleDef && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs uppercase text-muted-foreground">Step 2 — Fields</Label>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={selectAllFields}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearFields}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentModuleDef.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleField(f.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    selectedKeys.has(f.key)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {f.label}
                  {!f.editable && <span className="ml-1 text-muted-foreground">(read-only)</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeModule && selectedFieldDefs.length > 0 && (
          <div className="space-y-4 border rounded-lg p-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <Label className="text-xs uppercase text-muted-foreground">Step 3 — Data</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => rowsQuery.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant={editMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditMode((e) => !e)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {editMode ? "Done editing" : "Edit rows"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                  Select all filtered
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearRowSelection}>
                  Clear row selection
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkFieldRows([{ fieldKey: "", value: "" }]);
                    setBulkOpen(true);
                  }}
                >
                  Bulk update
                </Button>
                {importSupported && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportRows([]);
                      setImportParseError(null);
                      setImportOpen(true);
                    }}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Bulk add (import)
                  </Button>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={exportXlsx}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export selected
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedRowIds.size > 0
                ? `Bulk actions use ${selectedRowIds.size} selected row(s).`
                : `No rows selected — bulk update applies to all ${filteredRows.length} filtered row(s).`}
            </p>

            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Search (all columns)</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter rows…" />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={comparisonOn ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setComparisonOn((v) => !v)}
                >
                  <Scale className="h-3.5 w-3.5 mr-1" />
                  Comparison
                </Button>
                {comparisonOn && (
                  <Select value={compareField ?? ""} onValueChange={(v) => setCompareField(v || null)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Sort by field" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedFieldDefs.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <ScrollArea className="w-full border rounded-md max-h-[min(70vh,720px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pr-0">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(c) => (c ? selectAllFiltered() : clearRowSelection())}
                        aria-label="Select all filtered rows"
                      />
                    </TableHead>
                    <TableHead className="w-10 text-xs text-muted-foreground">#</TableHead>
                    {selectedFieldDefs.map((f) => (
                      <TableHead key={f.key} className="min-w-[120px]">
                        <div className="space-y-1">
                          <span>{f.label}</span>
                          <Input
                            className="h-7 text-xs"
                            placeholder="Filter…"
                            value={columnFilters[f.key] ?? ""}
                            onChange={(e) =>
                              setColumnFilters((prev) => ({ ...prev, [f.key]: e.target.value }))
                            }
                          />
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[160px] text-xs">Last modified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell className="pr-0">
                        <Checkbox
                          checked={selectedRowIds.has(row.id)}
                          onCheckedChange={() => toggleRowSelected(row.id)}
                          aria-label={`Select row ${idx + 1}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      {selectedFieldDefs.map((f) => (
                        <TableCell key={f.key} className="align-top">
                          <EditableCell
                            row={row}
                            field={f}
                            moduleId={activeModule}
                            editMode={editMode && f.editable}
                            users={users}
                            regions={regions}
                            me={me}
                            onSave={(value) => {
                              patchMutation.mutate(
                                { module: activeModule, recordId: row.id, fieldKey: f.key, value },
                                {
                                  onSuccess: () =>
                                    toast({ title: "Saved", description: `${f.label} updated.` }),
                                  onError: (e: Error) =>
                                    toast({ title: "Save failed", description: e.message, variant: "destructive" }),
                                },
                              );
                            }}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-muted-foreground">
                        {row._lastModified ? (
                          <span>
                            {formatDistanceToNow(new Date(row._lastModified.at), { addSuffix: true })} ·{" "}
                            {row._lastModified.by}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <p className="text-xs text-muted-foreground text-right">
              Showing {filteredRows.length} of {rows.length} record(s)
            </p>
          </div>
        )}
      </div>

      <Sheet open={bulkOpen} onOpenChange={setBulkOpen}>
        <SheetContent className={cn(sheetContentDetail)}>
          <SheetHeader>
            <SheetTitle>Bulk update</SheetTitle>
            <SheetDescription>
              Set one or more fields on <strong>{targetRecordIds.length}</strong> record(s)
              {selectedRowIds.size > 0 ? " (selected rows)" : " (all filtered rows)"}. Each field is applied in order;
              failures roll per row. Operations are audited.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-4">
            {bulkFieldRows.map((br, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Field</Label>
                  <Select
                    value={br.fieldKey}
                    onValueChange={(v) =>
                      setBulkFieldRows((rows) => {
                        const next = [...rows];
                        next[i] = { ...next[i], fieldKey: v };
                        return next;
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose field" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedFieldDefs
                        .filter((f) => f.editable)
                        .map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Value</Label>
                  {br.fieldKey === "assignedTo" &&
                  (activeModule === "deals_section" || activeModule === "proposals_section") ? (
                    <Select
                      value={br.value}
                      onValueChange={(v) =>
                        setBulkFieldRows((rows) => {
                          const next = [...rows];
                          next[i] = { ...next[i], value: v };
                          return next;
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select executive" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={br.value}
                      onChange={(e) =>
                        setBulkFieldRows((rows) => {
                          const next = [...rows];
                          next[i] = { ...next[i], value: e.target.value };
                          return next;
                        })
                      }
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={bulkFieldRows.length <= 1}
                  onClick={() => setBulkFieldRows((rows) => rows.filter((_, j) => j !== i))}
                  aria-label="Remove field"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setBulkFieldRows((rows) => [...rows, { fieldKey: "", value: "" }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add field
            </Button>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={runBulk}
              disabled={!buildBulkFieldsObject() || bulkPatchMutation.isPending || targetRecordIds.length === 0}
            >
              Review & confirm
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className={cn(sheetContentDetail)}>
          <SheetHeader>
            <SheetTitle>Bulk add (import)</SheetTitle>
            <SheetDescription>
              Download the template (first row = column keys), fill rows, then upload an .xlsx or .xls file.
              {activeModule === "customer_management" && (
                <>
                  {" "}
                  <strong>regionId</strong> must match a region id from your Regions master.
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <Button type="button" variant="secondary" className="w-full" onClick={downloadImportTemplate}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download template
            </Button>
            <div>
              <Label className="text-xs">Spreadsheet file</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                className="mt-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) parseImportWorkbook(f);
                  e.target.value = "";
                }}
              />
            </div>
            {importParseError && <p className="text-xs text-destructive">{importParseError}</p>}
            {importRows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Parsed <strong>{importRows.length}</strong> row(s). First row preview below.
              </p>
            )}
            {importRows[0] && (
              <ScrollArea className="h-32 border rounded-md p-2 text-xs font-mono">
                <pre className="whitespace-pre-wrap">{JSON.stringify(importRows[0], null, 2)}</pre>
              </ScrollArea>
            )}
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => activeModule && importMutation.mutate({ module: activeModule, rows: importRows })}
              disabled={!importRows.length || importMutation.isPending || !activeModule}
            >
              Import {importRows.length} row(s)
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply bulk update?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Update <strong>{targetRecordIds.length}</strong> record(s) with:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {bulkFieldRows
                    .filter((r) => r.fieldKey.trim())
                    .map((r) => (
                      <li key={r.fieldKey}>
                        <strong>{selectedFieldDefs.find((x) => x.key === r.fieldKey)?.label ?? r.fieldKey}</strong> →{" "}
                        &quot;{r.value}&quot;
                      </li>
                    ))}
                </ul>
                <p>This cannot be undone from this panel.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulk}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditableCell({
  row,
  field,
  moduleId,
  editMode,
  users,
  regions,
  me,
  onSave,
}: {
  row: RowBase;
  field: DccField;
  moduleId: string;
  editMode: boolean;
  users: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  me: { id: string; name: string; role: string };
  onSave: (value: unknown) => void;
}) {
  const [local, setLocal] = useState(() =>
    field.key === "assignedTo" && (moduleId === "deals_section" || moduleId === "proposals_section")
      ? String(row.assignedTo ?? "")
      : displayCellValue(row, field.key),
  );
  const [openHist, setOpenHist] = useState(false);

  useEffect(() => {
    if (field.key === "assignedTo" && (moduleId === "deals_section" || moduleId === "proposals_section"))
      setLocal(String(row.assignedTo ?? ""));
    else setLocal(displayCellValue(row, field.key));
  }, [row, field.key, moduleId]);

  const histQuery = useQuery({
    queryKey: ["data-control", "history", moduleId, row.id, field.key],
    queryFn: () =>
      api.get<{ items: { oldValue: string | null; newValue: string | null; userName: string; at: string }[] }>(
        `/data-control/field-history?module=${encodeURIComponent(moduleId)}&recordId=${encodeURIComponent(row.id)}&fieldKey=${encodeURIComponent(field.key)}&${actorParams(me)}`,
      ),
    enabled: openHist,
  });

  const commit = () => {
    const before =
      field.key === "assignedTo" && (moduleId === "deals_section" || moduleId === "proposals_section")
        ? String(row.assignedTo ?? "")
        : displayCellValue(row, field.key);
    if (local === before) return;
    const numFields = ["dealValue", "totalAmount", "amountPaid", "quantity"];
    onSave(numFields.includes(field.key) ? Number(local) : field.key === "assignedTo" ? local : local);
  };

  const inner = editMode ? (
    field.key === "assignedTo" && (moduleId === "deals_section" || moduleId === "proposals_section") ? (
      <Select
        value={String(local)}
        onValueChange={(v) => {
          setLocal(v);
          onSave(v);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : field.key === "region" && moduleId === "executives" ? (
      <Select
        value={String(row.regionId ?? "")}
        onValueChange={(id) => {
          const r = regions.find((x) => x.id === id);
          if (r) {
            setLocal(r.name);
            onSave(r.name);
          }
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {regions.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <Input
        className="h-8 text-xs"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    )
  ) : (
    <span className="text-sm">{displayCellValue(row, field.key) || "—"}</span>
  );

  return (
    <div className="flex items-start gap-1">
      <div className="flex-1 min-w-0">{inner}</div>
      {field.editable && (
        <Popover open={openHist} onOpenChange={setOpenHist}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Field history"
              onClick={() => setOpenHist(true)}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <p className="text-xs font-semibold mb-2">Change history — {field.label}</p>
            <div className="max-h-48 overflow-y-auto space-y-2 text-xs">
              {histQuery.isLoading && <p className="text-muted-foreground">Loading…</p>}
              {!histQuery.isLoading && (histQuery.data?.items?.length ?? 0) === 0 && (
                <p className="text-muted-foreground">No history yet.</p>
              )}
              {histQuery.data?.items?.map((h, i) => (
                <div key={i} className="border-b border-border/60 pb-1">
                  <p>
                    <span className="text-muted-foreground">{h.oldValue ?? "—"}</span> →{" "}
                    <span className="font-medium">{h.newValue ?? "—"}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {h.userName} · {formatDistanceToNow(new Date(h.at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
