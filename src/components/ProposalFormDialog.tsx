import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { dialogSmMax4xl, dialogSmMaxMd } from "@/lib/dialogLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/useAppStore";
import { formatINR } from "@/lib/rbac";
import { can } from "@/lib/rbac";
import { toast } from "@/components/ui/use-toast";
import type { Proposal, ProposalLineItem } from "@/types";
import { Plus, Trash2 } from "lucide-react";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function computeLineTotal(qty: number, unitPrice: number, discount: number) {
  return qty * unitPrice * (1 - discount / 100);
}

function computeTaxAmount(lineTotal: number, taxRate: number) {
  return (lineTotal * taxRate) / 100;
}

interface ProposalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProposal: Proposal | null;
  initialCustomerId?: string;
  onSaved: () => void;
}

export function ProposalFormDialog({
  open,
  onOpenChange,
  editingProposal,
  initialCustomerId,
  onSaved,
}: ProposalFormDialogProps) {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.me);
  const proposals = useAppStore((s) => s.proposals);
  const customers = useAppStore((s) => s.customers);
  const users = useAppStore((s) => s.users);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const addProposal = useAppStore((s) => s.addProposal);
  const updateProposal = useAppStore((s) => s.updateProposal);
  const saveNewVersion = useAppStore((s) => s.saveNewVersion);
  const submitForApproval = useAppStore((s) => s.submitForApproval);
  const sendProposal = useAppStore((s) => s.sendProposal);

  const invalidateProposalQueries = () => {
    void queryClient.invalidateQueries({ queryKey: QK.proposals() });
    void queryClient.invalidateQueries({ queryKey: QK.dashboard() });
  };

  const defaultValidUntil = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  };

  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [lineItems, setLineItems] = useState<ProposalLineItem[]>([]);
  const [overrideFinal, setOverrideFinal] = useState(false);
  const [finalQuoteValue, setFinalQuoteValue] = useState("");
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");

  const canOverride = can(me.role, "proposals", "override_final_value");
  const canRequestApproval = can(me.role, "proposals", "request_approval");
  const canSend = can(me.role, "proposals", "send");

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((s, li) => s + li.lineTotal, 0);
    const totalDiscount = lineItems.reduce((s, li) => s + li.qty * li.unitPrice * (li.discount / 100), 0);
    const totalTax = lineItems.reduce((s, li) => s + li.taxAmount, 0);
    const grandTotal = subtotal + totalTax;
    return { subtotal, totalDiscount, totalTax, grandTotal };
  }, [lineItems]);

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.companyName })),
    [customers],
  );
  const userOptions = useMemo(() => users.map((u) => ({ value: u.id, label: u.name })), [users]);

  const activeInventory = useMemo(() => inventoryItems.filter((it) => it.isActive), [inventoryItems]);
  const inventoryFiltered = useMemo(() => {
    if (!inventorySearch.trim()) return activeInventory;
    const q = inventorySearch.trim().toLowerCase();
    return activeInventory.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
    );
  }, [activeInventory, inventorySearch]);

  const updateLineItem = (id: string, updates: Partial<ProposalLineItem>) => {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== id) return li;
        const merged = { ...li, ...updates };
        const lineTotal = computeLineTotal(merged.qty, merged.unitPrice, merged.discount);
        const taxAmount = computeTaxAmount(lineTotal, merged.taxRate);
        return { ...merged, lineTotal, taxAmount };
      })
    );
  };

  const addFromInventory = (item: (typeof activeInventory)[0]) => {
    const lineTotal = computeLineTotal(1, item.sellingPrice, 0);
    const taxAmount = computeTaxAmount(lineTotal, item.taxRate);
    setLineItems((prev) => [
      ...prev,
      {
        id: "li-" + makeId(),
        inventoryItemId: item.id,
        name: item.name,
        sku: item.sku,
        qty: 1,
        unitPrice: item.sellingPrice,
        taxRate: item.taxRate,
        discount: 0,
        lineTotal,
        taxAmount,
      },
    ]);
  };

  const addCustomItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: "li-" + makeId(),
        inventoryItemId: "",
        name: "",
        sku: "CUSTOM",
        qty: 1,
        unitPrice: 0,
        taxRate: 18,
        discount: 0,
        lineTotal: 0,
        taxAmount: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => setLineItems((prev) => prev.filter((li) => li.id !== id));

  const getNextProposalNumber = () => {
    const year = new Date().getFullYear();
    const prefix = `PROP-${year}-`;
    const existing = proposals.filter((p) => p.proposalNumber.startsWith(prefix));
    const max = existing.reduce((m, p) => {
      const num = parseInt(p.proposalNumber.slice(prefix.length), 10);
      return isNaN(num) ? m : Math.max(m, num);
    }, 0);
    return `${prefix}${String(max + 1).padStart(4, "0")}`;
  };

  const buildProposal = (): Omit<Proposal, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string; updatedAt?: string } => {
    const now = new Date().toISOString();
    const customer = customers.find((c) => c.id === customerId);
    const assignedUser = users.find((u) => u.id === assignedTo);
    const value = overrideFinal && finalQuoteValue ? Number(finalQuoteValue) : totals.grandTotal;
    return {
      id: editingProposal?.id,
      proposalNumber: editingProposal?.proposalNumber ?? getNextProposalNumber(),
      title,
      customerId,
      customerName: customer?.companyName ?? "",
      assignedTo: assignedTo || me.id,
      assignedToName: assignedUser?.name ?? users.find((u) => u.id === (assignedTo || me.id))?.name ?? "",
      regionId: editingProposal?.regionId ?? me.regionId,
      teamId: editingProposal?.teamId ?? me.teamId,
      status: editingProposal?.status ?? "draft",
      validUntil,
      lineItems,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
      finalQuoteValue: overrideFinal ? value : undefined,
      versionHistory: editingProposal?.versionHistory ?? [
        { version: 1, createdAt: now, createdBy: me.id, lineItems, subtotal: totals.subtotal, totalDiscount: totals.totalDiscount, totalTax: totals.totalTax, grandTotal: totals.grandTotal },
      ],
      currentVersion: editingProposal?.currentVersion ?? 1,
      notes: internalNotes || undefined,
      customerNotes: customerNotes || undefined,
      createdAt: editingProposal?.createdAt ?? now,
      updatedAt: now,
      createdBy: editingProposal?.createdBy ?? me.id,
    };
  };

  const handleSaveDraft = () => {
    if (!title || !customerId) {
      toast({ title: "Missing fields", description: "Title and Customer are required.", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    if (editingProposal) {
      updateProposal(editingProposal.id, { ...payload, status: "draft" });
      toast({ title: "Proposal updated", description: `${payload.proposalNumber} saved as draft.` });
    } else {
      const id = "p" + makeId();
      const now = new Date().toISOString();
      addProposal({
        ...payload,
        id,
        createdAt: now,
        updatedAt: now,
      } as Proposal);
      toast({ title: "Proposal created", description: `${payload.proposalNumber} saved as draft.` });
    }
    invalidateProposalQueries();
    onSaved();
    onOpenChange(false);
  };

  const handleSubmitForApproval = () => {
    if (!title || !customerId) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    if (editingProposal) {
      updateProposal(editingProposal.id, { ...payload, status: "draft" });
      saveNewVersion(editingProposal.id);
      updateProposal(editingProposal.id, { status: "approval_pending" });
      submitForApproval(editingProposal.id);
    } else {
      const id = "p" + makeId();
      const now = new Date().toISOString();
      addProposal({ ...payload, id, createdAt: now, updatedAt: now, status: "approval_pending" } as Proposal);
      const added = useAppStore.getState().proposals.find((p) => p.id === id);
      if (added) submitForApproval(id);
    }
    toast({ title: "Submitted for approval", description: "Proposal has been sent for approval." });
    invalidateProposalQueries();
    onSaved();
    onOpenChange(false);
  };

  const handleSaveAndSend = () => {
    if (!title || !customerId) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    if (editingProposal) {
      updateProposal(editingProposal.id, { ...payload, status: "sent" });
      saveNewVersion(editingProposal.id);
      const now = new Date().toISOString();
      updateProposal(editingProposal.id, { status: "sent", sentAt: now });
      useAppStore.getState().sendProposal(editingProposal.id);
    } else {
      const id = "p" + makeId();
      const now = new Date().toISOString();
      addProposal({ ...payload, id, createdAt: now, updatedAt: now, status: "sent", sentAt: now } as Proposal);
      useAppStore.getState().sendProposal(id);
    }
    toast({ title: "Proposal sent", description: "Proposal has been sent to customer." });
    invalidateProposalQueries();
    onSaved();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    if (editingProposal) {
      setTitle(editingProposal.title);
      setCustomerId(editingProposal.customerId);
      setAssignedTo(editingProposal.assignedTo);
      setValidUntil(editingProposal.validUntil);
      setCustomerNotes(editingProposal.customerNotes ?? "");
      setInternalNotes(editingProposal.notes ?? "");
      setLineItems(editingProposal.lineItems);
      setOverrideFinal(editingProposal.finalQuoteValue != null);
      setFinalQuoteValue(String(editingProposal.finalQuoteValue ?? ""));
    } else {
      setTitle("");
      setCustomerId(initialCustomerId ?? "");
      setAssignedTo(me.id);
      setValidUntil(defaultValidUntil());
      setCustomerNotes("");
      setInternalNotes("");
      setLineItems([]);
      setOverrideFinal(false);
      setFinalQuoteValue("");
    }
  }, [open, editingProposal?.id, initialCustomerId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={dialogSmMax4xl}>
          <DialogHeader>
            <DialogTitle>{editingProposal ? "Edit proposal" : "New proposal"}</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Lead Name / Proposal Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lead name or proposal title" />
              </div>
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <SearchableSelect
                  value={customerId}
                  onValueChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Select company"
                  triggerClassName="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Deal Owner *</Label>
                <SearchableSelect
                  value={assignedTo || me.id}
                  onValueChange={setAssignedTo}
                  options={userOptions}
                  placeholder="Select deal owner"
                  triggerClassName="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Valid Until *</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 space-y-2">
                <Label>Remark (shown on proposal)</Label>
                <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={2} />
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 space-y-2">
                <Label>Internal Notes</Label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setInventoryPickerOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add from inventory
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addCustomItem}>
                  <Plus className="w-4 h-4 mr-1" /> Add custom item
                </Button>
              </div>
              {lineItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Item / code</TableHead>
                        <TableHead className="text-xs w-20">No. of License</TableHead>
                        <TableHead className="text-xs w-24">Unit Price</TableHead>
                        <TableHead className="text-xs w-20">Disc %</TableHead>
                        <TableHead className="text-xs w-16">GST %</TableHead>
                        <TableHead className="text-xs text-right">Deal Value (Excl. GST)</TableHead>
                        <TableHead className="text-xs text-right">GST Amount</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((li) => (
                        <TableRow key={li.id}>
                          <TableCell>
                            <Input
                              className="text-xs h-8"
                              value={li.name}
                              onChange={(e) => updateLineItem(li.id, { name: e.target.value })}
                              placeholder="Item name"
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">{li.sku}</span>
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-20"
                              min={1}
                              integer
                              emptyOnBlur={1}
                              value={li.qty}
                              onValueChange={(qty) => updateLineItem(li.id, { qty })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-24"
                              min={0}
                              emptyOnBlur={0}
                              value={li.unitPrice}
                              onValueChange={(unitPrice) => updateLineItem(li.id, { unitPrice })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-16"
                              min={0}
                              max={100}
                              emptyOnBlur={0}
                              value={li.discount}
                              onValueChange={(discount) => updateLineItem(li.id, { discount })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-14"
                              min={0}
                              emptyOnBlur={0}
                              value={li.taxRate}
                              onValueChange={(taxRate) => updateLineItem(li.id, { taxRate })}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatINR(li.lineTotal)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatINR(li.taxAmount)}</TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLineItem(li.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-2 border-t bg-muted/30 text-xs space-y-1">
                    <div className="flex justify-between"><span>Deal Value (Excl. GST)</span><span className="font-mono">{formatINR(totals.subtotal)}</span></div>
                    <div className="flex justify-between"><span>Total Discount</span><span className="font-mono">-{formatINR(totals.totalDiscount)}</span></div>
                    <div className="flex justify-between"><span>Total GST</span><span className="font-mono">{formatINR(totals.totalTax)}</span></div>
                    <div className="flex justify-between font-medium"><span>Deal Value (Incl. GST)</span><span className="font-mono">{formatINR(totals.grandTotal)}</span></div>
                  </div>
                </div>
              )}

              {canOverride && (
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={overrideFinal} onCheckedChange={setOverrideFinal} />
                    <Label>Override Deal Value (Incl. GST)</Label>
                  </div>
                  {overrideFinal && (
                    <div className="flex items-center gap-2">
                      <Input type="number" className="w-32" value={finalQuoteValue} onChange={(e) => setFinalQuoteValue(e.target.value)} placeholder={String(totals.grandTotal)} />
                      <span className="text-xs text-muted-foreground">₹ (default: Deal Value incl. GST)</span>
                    </div>
                  )}
                </div>
              )}
              {canOverride && overrideFinal && (
                <p className="text-xs text-amber-600">This overrides the computed deal value (including GST).</p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="outline" onClick={handleSaveDraft}>Save as draft</Button>
            {canRequestApproval && <Button variant="outline" onClick={handleSubmitForApproval}>Save & submit for approval</Button>}
            {canSend && <Button onClick={handleSaveAndSend}>Save & send</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory picker */}
      <Dialog open={inventoryPickerOpen} onOpenChange={setInventoryPickerOpen}>
        <DialogContent className={dialogSmMaxMd}>
          <DialogHeader><DialogTitle>Add item from inventory</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2">
          <Input placeholder="Search name, item code, category..." value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} />
          <div className="max-h-64 overflow-y-auto border rounded-md">
            {inventoryFiltered.map((it) => (
              <div key={it.id} className="flex items-center justify-between p-2 border-b hover:bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.sku} · {formatINR(it.sellingPrice)} · GST {it.taxRate}%</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addFromInventory(it)}>Add</Button>
              </div>
            ))}
          </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
