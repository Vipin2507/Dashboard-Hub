import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomersListQuery } from "@/hooks/useCustomersListQuery";
import { mapApiCustomerRowToCustomer } from "@/lib/customerApiToUi";
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
import { makeProposalNumber } from "@/lib/proposalNumber";
import type { Proposal, ProposalLineItem, ProposalPdfScope } from "@/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
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
  const regions = useAppStore((s) => s.regions);
  const users = useAppStore((s) => s.users);
  const setCustomers = useAppStore((s) => s.setCustomers);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const addProposal = useAppStore((s) => s.addProposal);
  const updateProposal = useAppStore((s) => s.updateProposal);
  const saveNewVersion = useAppStore((s) => s.saveNewVersion);
  const submitForApproval = useAppStore((s) => s.submitForApproval);
  const sendProposal = useAppStore((s) => s.sendProposal);

  const customersQuery = useCustomersListQuery({ enabled: open });

  useEffect(() => {
    if (!open || !customersQuery.data) return;
    setCustomers(customersQuery.data.map((row) => mapApiCustomerRowToCustomer(row, { regions, users, me })));
  }, [open, customersQuery.data, regions, users, me.id, setCustomers]);

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
  const [isTitleAuto, setIsTitleAuto] = useState(true);
  const [titleAutoCreatedAt, setTitleAutoCreatedAt] = useState<Date | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<Proposal["status"]>("shared");
  const [assignedTo, setAssignedTo] = useState("");
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [lineItems, setLineItems] = useState<ProposalLineItem[]>([]);
  const [setupDeploymentCharges, setSetupDeploymentCharges] = useState<number>(0);
  const [overrideFinal, setOverrideFinal] = useState(false);
  const [finalQuoteValue, setFinalQuoteValue] = useState("");
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [pdfScope, setPdfScope] = useState<ProposalPdfScope>("end_to_end");

  const canOverride = can(me.role, "proposals", "override_final_value");
  const canRequestApproval = can(me.role, "proposals", "request_approval");
  const canSend = can(me.role, "proposals", "send");

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((s, li) => s + li.lineTotal, 0);
    const totalDiscount = lineItems.reduce((s, li) => s + li.qty * li.unitPrice * (li.discount / 100), 0);
    const totalTax = lineItems.reduce((s, li) => s + li.taxAmount, 0);
    const grandTotal = subtotal + totalTax + (Number(setupDeploymentCharges) || 0);
    return { subtotal, totalDiscount, totalTax, grandTotal };
  }, [lineItems, setupDeploymentCharges]);

  const monthYear = useMemo(() => {
    const d = titleAutoCreatedAt ?? new Date();
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [titleAutoCreatedAt]);

  const computeAutoTitleBase = () => {
    const customer = customers.find((c) => c.id === customerId);
    const primaryContactName =
      customer?.contacts?.find((c) => c.isPrimary)?.name ?? customer?.contacts?.[0]?.name ?? "";
    const companyOrCustomerName = (customer?.companyName ?? primaryContactName ?? "").trim() || "Customer";
    const serviceOrProduct =
      (lineItems.find((li) => li.name && li.name.trim())?.name ?? "").trim() || "Proposal";
    return `${companyOrCustomerName} – ${serviceOrProduct} – ${monthYear}`;
  };

  const makeUniqueTitle = (base: string) => {
    const existing = new Set(
      proposals
        .filter((p) => p.id !== editingProposal?.id)
        .map((p) => (p.title ?? "").trim())
        .filter(Boolean),
    );
    if (!existing.has(base)) return base;
    let n = 2;
    // Avoid infinite loop; realistic titles will settle quickly.
    while (n < 10_000) {
      const next = `${base} (${n})`;
      if (!existing.has(next)) return next;
      n++;
    }
    return `${base} (${Date.now()})`;
  };

  const autoTitle = useMemo(() => {
    const base = computeAutoTitleBase();
    return makeUniqueTitle(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, lineItems, monthYear, proposals, editingProposal?.id]);

  const customerOptions = useMemo(() => {
    return customers.map((c) => ({
      value: c.id,
      label: c.companyName || c.customerName || c.customerNumber,
    }));
  }, [customers]);
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

  const nextProposalNumber = useMemo(
    () => makeProposalNumber(proposals.map((p) => p.proposalNumber)),
    [proposals],
  );

  const buildProposal = (): Omit<Proposal, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string; updatedAt?: string } => {
    const now = new Date().toISOString();
    const customer = customers.find((c) => c.id === customerId);
    const assignedUser = users.find((u) => u.id === assignedTo);
    const value = overrideFinal && finalQuoteValue ? Number(finalQuoteValue) : totals.grandTotal;
    const companyName = (customer?.companyName ?? "").trim() || customer?.customerName || "";
    return {
      id: editingProposal?.id,
      proposalNumber: editingProposal?.proposalNumber ?? nextProposalNumber(companyName),
      title,
      customerId,
      customerName: customer?.customerName ?? "",
      customerCompanyName: (customer?.companyName ?? "").trim() || undefined,
      assignedTo: assignedTo || me.id,
      assignedToName: assignedUser?.name ?? users.find((u) => u.id === (assignedTo || me.id))?.name ?? "",
      regionId: editingProposal?.regionId ?? me.regionId,
      teamId: editingProposal?.teamId ?? me.teamId,
      status: editingProposal?.status ?? status ?? "shared",
      validUntil,
      lineItems,
      setupDeploymentCharges: Number(setupDeploymentCharges) || 0,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
      finalQuoteValue: overrideFinal ? value : undefined,
      versionHistory: editingProposal?.versionHistory ?? [
        { version: 1, createdAt: now, createdBy: me.id, lineItems, setupDeploymentCharges: Number(setupDeploymentCharges) || 0, subtotal: totals.subtotal, totalDiscount: totals.totalDiscount, totalTax: totals.totalTax, grandTotal: totals.grandTotal },
      ],
      currentVersion: editingProposal?.currentVersion ?? 1,
      notes: internalNotes || undefined,
      customerNotes: customerNotes || undefined,
      createdAt: editingProposal?.createdAt ?? now,
      updatedAt: now,
      createdBy: editingProposal?.createdBy ?? me.id,
      pdfScope,
    };
  };

  const handleSaveDraft = () => {
    if (!title || !customerId) {
      toast({ title: "Missing fields", description: "Title and Customer are required.", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    if (editingProposal) {
      updateProposal(editingProposal.id, payload);
      toast({ title: "Proposal updated", description: `${payload.proposalNumber} saved.` });
    } else {
      const id = "p" + makeId();
      const now = new Date().toISOString();
      addProposal({
        ...payload,
        id,
        createdAt: now,
        updatedAt: now,
      } as Proposal);
      toast({ title: "Proposal created", description: `${payload.proposalNumber} saved as ${payload.status}.` });
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
      setIsTitleAuto(false);
      setTitleAutoCreatedAt(null);
      setCustomerId(editingProposal.customerId);
      setStatus(editingProposal.status ?? "shared");
      setAssignedTo(editingProposal.assignedTo);
      setValidUntil(editingProposal.validUntil);
      setCustomerNotes(editingProposal.customerNotes ?? "");
      setInternalNotes(editingProposal.notes ?? "");
      setLineItems(editingProposal.lineItems);
      setSetupDeploymentCharges(Number(editingProposal.setupDeploymentCharges) || 0);
      setOverrideFinal(editingProposal.finalQuoteValue != null);
      setFinalQuoteValue(String(editingProposal.finalQuoteValue ?? ""));
      setPdfScope(editingProposal.pdfScope ?? "end_to_end");
    } else {
      const createdAt = new Date();
      setTitleAutoCreatedAt(createdAt);
      setIsTitleAuto(true);
      setCustomerId(initialCustomerId ?? "");
      setStatus("shared");
      setAssignedTo(me.id);
      setValidUntil(defaultValidUntil());
      setCustomerNotes("");
      setInternalNotes("");
      setLineItems([]);
      setSetupDeploymentCharges(0);
      setOverrideFinal(false);
      setFinalQuoteValue("");
      setPdfScope("end_to_end");
    }
  }, [open, editingProposal?.id, initialCustomerId]);

  useEffect(() => {
    if (!open) return;
    if (editingProposal) return;
    if (!isTitleAuto) return;
    setTitle(autoTitle);
  }, [open, editingProposal?.id, isTitleAuto, autoTitle]);

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
                <div className="flex items-center justify-between gap-2">
                  <Label>Lead Name / Proposal Title *</Label>
                  {!editingProposal && !isTitleAuto ? (
                    <button
                      type="button"
                      className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline"
                      onClick={() => {
                        setIsTitleAuto(true);
                        setTitle(autoTitle);
                      }}
                    >
                      ↺ Reset to auto
                    </button>
                  ) : null}
                </div>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!editingProposal && isTitleAuto) setIsTitleAuto(false);
                  }}
                  placeholder="Lead name or proposal title"
                />
              </div>
              <div className="space-y-3 sm:col-span-2 lg:col-span-3">
                <Label>Proposal PDF cover heading</Label>
                <RadioGroup
                  value={pdfScope}
                  onValueChange={(v) => setPdfScope(v as ProposalPdfScope)}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  <label
                    htmlFor="pdf-scope-sales"
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors",
                      pdfScope === "sales" ? "border-primary bg-muted/40" : "border-border hover:bg-muted/20",
                    )}
                  >
                    <RadioGroupItem value="sales" id="pdf-scope-sales" className="mt-0.5" />
                    <span className="text-sm leading-snug">
                      <span className="font-medium">Sales</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Buildesk Annual sales management proposal
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="pdf-scope-post"
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors",
                      pdfScope === "post" ? "border-primary bg-muted/40" : "border-border hover:bg-muted/20",
                    )}
                  >
                    <RadioGroupItem value="post" id="pdf-scope-post" className="mt-0.5" />
                    <span className="text-sm leading-snug">
                      <span className="font-medium">Post</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Buildesk Annual Post sales management proposal
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="pdf-scope-e2e"
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors",
                      pdfScope === "end_to_end" ? "border-primary bg-muted/40" : "border-border hover:bg-muted/20",
                    )}
                  >
                    <RadioGroupItem value="end_to_end" id="pdf-scope-e2e" className="mt-0.5" />
                    <span className="text-sm leading-snug">
                      <span className="font-medium">End to end</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Buildesk annual end to end sales management proposal
                      </span>
                    </span>
                  </label>
                </RadioGroup>
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
                <Label>Status</Label>
                <SearchableSelect
                  value={status}
                  onValueChange={(v) => setStatus(v as Proposal["status"])}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "sent", label: "Sent" },
                    { value: "shared", label: "Shared" },
                    { value: "approval_pending", label: "Approval Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "negotiation", label: "Negotiation" },
                    { value: "won", label: "Won" },
                    { value: "rejected", label: "Rejected" },
                    { value: "cold", label: "Cold" },
                    { value: "deal_created", label: "Deal Created" },
                  ]}
                  placeholder="Shared"
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
                    <div className="flex justify-between"><span>Setup &amp; Deployment Charges</span><span className="font-mono">{formatINR(Number(setupDeploymentCharges) || 0)}</span></div>
                    <div className="flex justify-between font-medium"><span>Deal Value (Incl. GST)</span><span className="font-mono">{formatINR(totals.grandTotal)}</span></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label>Setup &amp; Deployment Charges</Label>
                  <NumericInput
                    className="h-10"
                    min={0}
                    emptyOnBlur={0}
                    value={setupDeploymentCharges}
                    onValueChange={(v) => setSetupDeploymentCharges(Number(v) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">Added to the final amount (default 0).</p>
                </div>
              </div>

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
