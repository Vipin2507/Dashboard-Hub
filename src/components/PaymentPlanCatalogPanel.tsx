import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { apiUrl } from "@/lib/api";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";

type CatalogRow = {
  id: string;
  name: string;
  defaultBillingCycle: string;
  defaultGraceDays: number;
  suggestedInstallments: number | null;
  createdAt: string;
};

const emptyForm = {
  name: "",
  defaultBillingCycle: "yearly" as string,
  defaultGraceDays: "5",
  suggestedInstallments: "",
};

export function PaymentPlanCatalogPanel() {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.me);
  const canCreate = can(me.role, "payments", "create");
  const canUpdate = can(me.role, "payments", "update");
  const canDelete = can(me.role, "payments", "delete");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const catalogQ = useQuery({
    queryKey: ["payment-plan-catalog"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/payment-plans/catalog"));
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json() as Promise<CatalogRow[]>;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["payment-plan-catalog"] });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(apiUrl("/api/payment-plans/catalog"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Create failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Plan template created" });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(apiUrl(`/api/payment-plans/catalog/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Plan template updated" });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/payment-plans/catalog/${id}`), { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Plan template removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: CatalogRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      defaultBillingCycle: row.defaultBillingCycle,
      defaultGraceDays: String(row.defaultGraceDays),
      suggestedInstallments: row.suggestedInstallments != null ? String(row.suggestedInstallments) : "",
    });
    setDialogOpen(true);
  };

  const submitForm = () => {
    const body = {
      name: form.name.trim(),
      defaultBillingCycle: form.defaultBillingCycle,
      defaultGraceDays: Number(form.defaultGraceDays) || 5,
      suggestedInstallments: form.suggestedInstallments.trim()
        ? Number(form.suggestedInstallments)
        : null,
    };
    if (!body.name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, body });
    } else {
      createMut.mutate(body);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Payment plan templates</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Master list used when assigning a plan to a customer (CRUD).
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="h-8 gap-1" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Add template
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {catalogQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Billing cycle</TableHead>
                  <TableHead className="text-xs">Grace (days)</TableHead>
                  <TableHead className="text-xs">Installments</TableHead>
                  <TableHead className="text-xs w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(catalogQ.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm font-medium">{row.name}</TableCell>
                    <TableCell className="text-xs capitalize">{row.defaultBillingCycle}</TableCell>
                    <TableCell className="text-xs">{row.defaultGraceDays}</TableCell>
                    <TableCell className="text-xs">{row.suggestedInstallments ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {canUpdate && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm(`Delete template "${row.name}"?`)) deleteMut.mutate(row.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit template" : "New plan template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input className="h-9" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default billing cycle</Label>
                <Select
                  value={form.defaultBillingCycle}
                  onValueChange={(v) => setForm((f) => ({ ...f, defaultBillingCycle: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default grace period (days after due)</Label>
                <Input
                  className="h-9"
                  type="number"
                  min={0}
                  value={form.defaultGraceDays}
                  onChange={(e) => setForm((f) => ({ ...f, defaultGraceDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Suggested installments (optional)</Label>
                <Input
                  className="h-9"
                  type="number"
                  min={1}
                  placeholder="e.g. 12"
                  value={form.suggestedInstallments}
                  onChange={(e) => setForm((f) => ({ ...f, suggestedInstallments: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitForm} disabled={createMut.isPending || updateMut.isPending}>
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
