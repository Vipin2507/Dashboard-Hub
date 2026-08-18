import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomersListQuery } from "@/hooks/useCustomersListQuery";
import { mapCustomersApiRowsToStore } from "@/lib/customerPersistence";
import { normalizeProposalStatus } from "@/lib/proposalStatus";
import { QK } from "@/lib/queryKeys";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { dialogSmMax4xl, dialogSmMaxEditor, dialogSmMaxMd } from "@/lib/dialogLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
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
import { formatINR, can, getScope, visibleWithScope } from "@/lib/rbac";
import { toast } from "@/components/ui/use-toast";
import { makeProposalNumber } from "@/lib/proposalNumber";
import type { Proposal, ProposalLineItem, ProposalPdfScope } from "@/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { FileText, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DEFAULT_TERMS, defaultCoverHeadingTextForScope, generateProposalPdfBlob } from "@/lib/generateProposalPdf";
import { previewProposalQtyBracket } from "@/lib/proposalQtyDisplay";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function computeLineTotal(qty: number, unitPrice: number, discount: number) {
  return qty * unitPrice * (1 - discount / 100);
}

function computeTaxAmount(lineTotal: number, taxRate: number) {
  return (lineTotal * taxRate) / 100;
}

const PDF_SCOPE_OPTIONS: { id: ProposalPdfScope; title: string; hint: string }[] = [
  { id: "sales", title: "Sales", hint: "Annual sales management" },
  { id: "post", title: "Post", hint: "Post-sales management" },
  { id: "end_to_end", title: "End to end", hint: "Full sales management" },
];

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
    setCustomers(mapCustomersApiRowsToStore(customersQuery.data, { regions, users, me }));
  }, [open, customersQuery.data, regions, users, me.id, setCustomers]);

  /** Wait for server persistence before refetching — avoids list overwriting the new row with stale GET. */
  const syncProposalQueriesAfterPersist = async () => {
    await queryClient.invalidateQueries({ queryKey: QK.proposals() });
    await queryClient.refetchQueries({ queryKey: QK.proposals() });
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
  const [pdfCoverHeading, setPdfCoverHeading] = useState("");
  const [termsAndConditionsText, setTermsAndConditionsText] = useState("");
  const [pdfEditorOpen, setPdfEditorOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [didAutoSeedPdfFields, setDidAutoSeedPdfFields] = useState(false);

  const canOverride = can(me.role, "proposals", "override_final_value");
  const canRequestApproval = can(me.role, "proposals", "request_approval");
  /** Save & send is restricted to Super Admin only (direct customer send from the form). */
  const canSaveAndSend = me.role === "super_admin";

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

  const customerScope = getScope(me.role, "customers");
  const visibleCustomers = useMemo(
    () => visibleWithScope(customerScope, me, customers),
    [customerScope, me, customers],
  );

  const customerOptions = useMemo(() => {
    return visibleCustomers.map((c) => ({
      value: c.id,
      label: c.companyName || c.customerName || c.customerNumber,
    }));
  }, [visibleCustomers]);
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
    const liveProposal = editingProposal
      ? proposals.find((p) => p.id === editingProposal.id) ?? editingProposal
      : null;
    const value = overrideFinal && finalQuoteValue ? Number(finalQuoteValue) : totals.grandTotal;
    const companyName = (customer?.companyName ?? "").trim() || customer?.customerName || "";
    const parsedTerms = termsAndConditionsText
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-•]\s*/, "").trim())
      .filter(Boolean);
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
      versionHistory: liveProposal?.versionHistory ?? [
        { version: 1, createdAt: now, createdBy: me.id, lineItems, setupDeploymentCharges: Number(setupDeploymentCharges) || 0, subtotal: totals.subtotal, totalDiscount: totals.totalDiscount, totalTax: totals.totalTax, grandTotal: totals.grandTotal },
      ],
      currentVersion: liveProposal?.currentVersion ?? 1,
      notes: internalNotes || undefined,
      customerNotes: customerNotes || undefined,
      createdAt: editingProposal?.createdAt ?? now,
      updatedAt: now,
      createdBy: editingProposal?.createdBy ?? me.id,
      pdfScope,
      pdfCoverHeading: pdfCoverHeading.trim() || undefined,
      termsAndConditions: parsedTerms.length ? parsedTerms : undefined,
    };
  };

  const canOpenPdfEditor = useMemo(() => {
    if (!title.trim()) return false;
    if (!customerId) return false;
    if (!validUntil) return false;
    if (!lineItems.length) return false;
    return true;
  }, [title, customerId, validUntil, lineItems.length]);

  const buildDraftProposalForPdf = () => {
    const now = new Date().toISOString();
    const payload = buildProposal();
    const id = editingProposal?.id ?? "p-preview";
    return {
      ...(payload as Omit<Proposal, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string; updatedAt?: string }),
      id,
      createdAt: payload.createdAt ?? now,
      updatedAt: payload.updatedAt ?? now,
    } as Proposal;
  };

  const refreshPdfPreview = async () => {
    if (!canOpenPdfEditor) return;
    setPdfPreviewLoading(true);
    try {
      const draft = buildDraftProposalForPdf();
      const blob = await generateProposalPdfBlob(draft);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate PDF preview";
      toast({ title: "PDF preview failed", description: message, variant: "destructive" });
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  const seedPdfEditorDefaultsIfNeeded = () => {
    if (didAutoSeedPdfFields) return;
    // Show the "current" PDF values even when the user hasn't overridden yet.
    if (!pdfCoverHeading.trim()) setPdfCoverHeading(defaultCoverHeadingTextForScope(pdfScope));
    if (!termsAndConditionsText.trim()) setTermsAndConditionsText(DEFAULT_TERMS.join("\n"));
    setDidAutoSeedPdfFields(true);
  };

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const handleSaveDraft = async () => {
    if (!title || !customerId) {
      toast({ title: "Missing fields", description: "Title and Customer are required.", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    try {
      if (editingProposal) {
        await updateProposal(editingProposal.id, payload);
        toast({ title: "Proposal updated", description: `${payload.proposalNumber} saved.` });
      } else {
        const id = "p" + makeId();
        const now = new Date().toISOString();
        await addProposal({
          ...payload,
          id,
          createdAt: now,
          updatedAt: now,
        } as Proposal);
        toast({ title: "Proposal created", description: `${payload.proposalNumber} saved as ${payload.status}.` });
      }
      await syncProposalQueriesAfterPersist();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not save proposal",
        variant: "destructive",
      });
    }
  };

  const handleSubmitForApproval = async () => {
    if (!title || !customerId) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    try {
      if (editingProposal) {
        await updateProposal(editingProposal.id, { ...payload, status: "draft" });
        saveNewVersion(editingProposal.id);
        await updateProposal(editingProposal.id, { status: "approval_pending" });
        await submitForApproval(editingProposal.id);
      } else {
        const id = "p" + makeId();
        const now = new Date().toISOString();
        await addProposal({ ...payload, id, createdAt: now, updatedAt: now, status: "approval_pending" } as Proposal);
        await submitForApproval(id);
      }
      toast({ title: "Submitted for approval", description: "Proposal has been sent for approval." });
      await syncProposalQueriesAfterPersist();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Submit failed",
        description: e instanceof Error ? e.message : "Could not submit proposal",
        variant: "destructive",
      });
    }
  };

  const handleSaveAndSend = async () => {
    if (!canSaveAndSend) {
      toast({ title: "Not allowed", description: "Only Super Admin can use Save & send.", variant: "destructive" });
      return;
    }
    if (!title || !customerId) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    const payload = buildProposal();
    try {
      if (editingProposal) {
        await updateProposal(editingProposal.id, { ...payload, status: "sent" });
        saveNewVersion(editingProposal.id);
        const now = new Date().toISOString();
        await updateProposal(editingProposal.id, { status: "sent", sentAt: now });
        await sendProposal(editingProposal.id);
      } else {
        const id = "p" + makeId();
        const now = new Date().toISOString();
        await addProposal({ ...payload, id, createdAt: now, updatedAt: now, status: "sent", sentAt: now } as Proposal);
        await sendProposal(id);
      }
      toast({ title: "Proposal sent", description: "Proposal has been sent to customer." });
      await syncProposalQueriesAfterPersist();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Send failed",
        description: e instanceof Error ? e.message : "Could not send proposal",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editingProposal) {
      setTitle(editingProposal.title);
      setIsTitleAuto(false);
      setTitleAutoCreatedAt(null);
      setCustomerId(editingProposal.customerId);
      setStatus(normalizeProposalStatus(editingProposal.status ?? "shared"));
      setAssignedTo(editingProposal.assignedTo);
      setValidUntil(editingProposal.validUntil);
      setCustomerNotes(editingProposal.customerNotes ?? "");
      setInternalNotes(editingProposal.notes ?? "");
      setLineItems(editingProposal.lineItems);
      setSetupDeploymentCharges(Number(editingProposal.setupDeploymentCharges) || 0);
      setOverrideFinal(editingProposal.finalQuoteValue != null);
      setFinalQuoteValue(String(editingProposal.finalQuoteValue ?? ""));
      setPdfScope(editingProposal.pdfScope ?? "end_to_end");
      setPdfCoverHeading(editingProposal.pdfCoverHeading ?? "");
      setTermsAndConditionsText((editingProposal.termsAndConditions ?? []).join("\n"));
      setDidAutoSeedPdfFields(true);
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
      setPdfCoverHeading("");
      setTermsAndConditionsText("");
      setDidAutoSeedPdfFields(false);
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

          <DialogBody className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Lead Name / Proposal Title *</Label>
                  {!editingProposal && !isTitleAuto ? (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
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
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">PDF cover scope</Label>
                <RadioGroup
                  value={pdfScope}
                  onValueChange={(v) => setPdfScope(v as ProposalPdfScope)}
                  className="grid gap-1.5 sm:grid-cols-3"
                >
                  {PDF_SCOPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      htmlFor={`pdf-scope-${opt.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
                        pdfScope === opt.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30",
                      )}
                    >
                      <RadioGroupItem value={opt.id} id={`pdf-scope-${opt.id}`} className="mt-0.5" />
                      <span className="text-xs leading-snug">
                        <span className="font-medium">{opt.title}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Company Name *</Label>
                <SearchableSelect
                  value={customerId}
                  onValueChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Select company"
                  searchPlaceholder="Search company…"
                  triggerClassName="h-9 text-sm"
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
                  ]}
                  placeholder="Shared"
                  triggerClassName="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Deal Owner *</Label>
                <SearchableSelect
                  value={assignedTo || me.id}
                  onValueChange={setAssignedTo}
                  options={userOptions}
                  placeholder="Select deal owner"
                  triggerClassName="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Valid Until *</Label>
                <Datepicker
                  select="single"
                  touchUi={false}
                  inputComponent="input"
                  inputProps={{ placeholder: "Select…", className: "h-9 text-sm" }}
                  value={ymdToDate(validUntil)}
                  onChange={(ev) => setValidUntil(ev.value ? dateToYmd(ev.value) : "")}
                />
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
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setInventoryPickerOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Inventory
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={addCustomItem}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Custom
                </Button>
              </div>
              {lineItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs min-w-[320px]">Item / code</TableHead>
                        <TableHead className="text-xs whitespace-nowrap w-[130px]">No. of License</TableHead>
                        <TableHead className="text-xs whitespace-nowrap w-[140px]">Unit Price</TableHead>
                        <TableHead className="text-xs whitespace-nowrap w-[110px]">Disc %</TableHead>
                        <TableHead className="text-xs whitespace-nowrap w-[100px]">GST %</TableHead>
                        <TableHead className="text-xs text-right whitespace-nowrap w-[180px]">Deal Value (Excl. GST)</TableHead>
                        <TableHead className="text-xs text-right whitespace-nowrap w-[140px]">GST Amount</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="align-top min-w-[320px]">
                            <Input
                              className="text-xs h-8 w-full min-w-[260px]"
                              value={li.name}
                              onChange={(e) => updateLineItem(li.id, { name: e.target.value })}
                              placeholder="Item name"
                            />
                            <Textarea
                              className="mt-2 text-xs w-full min-w-[260px]"
                              value={li.description ?? ""}
                              onChange={(e) => updateLineItem(li.id, { description: e.target.value })}
                              placeholder="Description (shows in PDF product table)"
                              rows={2}
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">{li.sku}</span>
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-full min-w-[110px]"
                              min={1}
                              integer
                              emptyOnBlur={1}
                              value={li.qty}
                              onValueChange={(qty) => updateLineItem(li.id, { qty })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-full min-w-[120px]"
                              min={0}
                              emptyOnBlur={0}
                              value={li.unitPrice}
                              onValueChange={(unitPrice) => updateLineItem(li.id, { unitPrice })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-full min-w-[90px]"
                              min={0}
                              max={100}
                              emptyOnBlur={0}
                              value={li.discount}
                              onValueChange={(discount) => updateLineItem(li.id, { discount })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-full min-w-[80px]"
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
                  <div className="space-y-0.5 border-t border-border bg-muted/30 px-2.5 py-2 text-[11px] tabular-nums">
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
                <p className="text-[11px] text-warning-foreground">This overrides the computed deal value (including GST).</p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={!canOpenPdfEditor}
              onClick={async () => {
                setPdfEditorOpen(true);
                seedPdfEditorDefaultsIfNeeded();
                await refreshPdfPreview();
              }}
              title={!canOpenPdfEditor ? "Fill Title, Customer, Valid Until and add at least 1 line item" : "Preview and edit PDF fields"}
            >
              <FileText className="mr-1 h-3.5 w-3.5" />
              Edit PDF
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={handleSaveDraft}>
              Save draft
            </Button>
            {canRequestApproval && (
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={handleSubmitForApproval}>
                Submit for approval
              </Button>
            )}
            {canSaveAndSend && (
              <Button size="sm" className="h-8 px-2.5 text-xs" onClick={handleSaveAndSend}>
                Save & send
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfEditorOpen} onOpenChange={(o) => { setPdfEditorOpen(o); }}>
        <DialogContent className={cn(dialogSmMaxEditor, "h-[92vh] overflow-hidden")}>
          <DialogHeader className="px-4 py-2.5 sm:px-5 sm:py-3">
            <DialogTitle className="text-base">Edit PDF</DialogTitle>
            <DialogDescription className="text-[11px]">
              Cover, terms, and line copy. Refresh to update the preview.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid h-full min-h-0 grid-cols-1 gap-2.5 overflow-hidden p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="card-soft flex h-full min-h-0 flex-col overflow-hidden">
              <div className="scrollbar-soft flex-1 space-y-3 overflow-y-auto p-3">
                <section className="space-y-1.5">
                  <p className="typo-section-title">Cover</p>
                  <RadioGroup
                    value={pdfScope}
                    onValueChange={(v) => {
                      const next = v as ProposalPdfScope;
                      const prevDefault = defaultCoverHeadingTextForScope(pdfScope);
                      setPdfScope(next);
                      if (!pdfCoverHeading.trim() || pdfCoverHeading.trim() === prevDefault) {
                        setPdfCoverHeading(defaultCoverHeadingTextForScope(next));
                      }
                    }}
                    className="grid gap-1.5 sm:grid-cols-3"
                  >
                    {PDF_SCOPE_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        htmlFor={`pdf-edit-scope-${opt.id}`}
                        className={cn(
                          "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                          pdfScope === opt.id ? "border-primary/40 bg-primary/5 font-medium" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <RadioGroupItem value={opt.id} id={`pdf-edit-scope-${opt.id}`} className="h-3.5 w-3.5" />
                        {opt.title}
                      </label>
                    ))}
                  </RadioGroup>
                  <Textarea
                    value={pdfCoverHeading}
                    onChange={(e) => setPdfCoverHeading(e.target.value)}
                    rows={3}
                    className="min-h-[4.5rem] text-sm"
                    placeholder={"BUILDESK ANNUAL SALES\nMANAGEMENT PROPOSAL"}
                  />
                </section>

                <section className="space-y-1.5">
                  <p className="typo-section-title">Terms &amp; conditions</p>
                  <Textarea
                    value={termsAndConditionsText}
                    onChange={(e) => setTermsAndConditionsText(e.target.value)}
                    rows={8}
                    className="min-h-[10rem] text-sm leading-relaxed"
                    placeholder={"One point per line.\nStart lines with - or •"}
                  />
                </section>

                <section className="space-y-1.5">
                  <p className="typo-section-title">Line items</p>
                  <div className="space-y-2">
                    {lineItems.map((li) => (
                      <div key={li.id} className="space-y-2 rounded-md border border-border p-2.5">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                          <div className="min-w-0 space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Item</Label>
                            <Input className="h-9 text-sm" value={li.name} onChange={(e) => updateLineItem(li.id, { name: e.target.value })} />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Code</Label>
                            <Input className="h-9 font-mono text-xs" value={li.sku} readOnly />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Description</Label>
                          <Textarea
                            className="min-h-[4.5rem] text-sm leading-relaxed"
                            value={li.description ?? ""}
                            onChange={(e) => updateLineItem(li.id, { description: e.target.value })}
                            rows={3}
                            placeholder="Shows in the PDF product table"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                          <div className="min-w-0 space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty prefix</Label>
                            <Input
                              className="h-9 text-sm"
                              value={li.qtyPrefix ?? ""}
                              onChange={(e) => updateLineItem(li.id, { qtyPrefix: e.target.value })}
                              placeholder="Up to"
                            />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty label</Label>
                            <Input
                              className="h-9 text-sm"
                              value={li.qtyLabel ?? "license"}
                              onChange={(e) => updateLineItem(li.id, { qtyLabel: e.target.value })}
                              placeholder="Units"
                            />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Service</Label>
                            <Input
                              className="h-9 text-sm"
                              value={li.serviceLabel ?? "12 Months"}
                              onChange={(e) => updateLineItem(li.id, { serviceLabel: e.target.value })}
                              placeholder="12 Months"
                            />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bracket</Label>
                            <Input
                              className="h-9 font-mono text-xs"
                              value={previewProposalQtyBracket(li.qty, li.qtyPrefix, li.qtyLabel)}
                              readOnly
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {lineItems.length === 0 && (
                      <p className="text-xs text-muted-foreground">Add a line item first.</p>
                    )}
                  </div>
                </section>

                <section className="space-y-1.5">
                  <p className="typo-section-title">Values</p>
                  <div className="grid gap-3 rounded-md border border-border p-2.5 sm:grid-cols-[minmax(0,1fr)_12rem]">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="min-w-0 space-y-0.5">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Setup &amp; deployment</Label>
                        <NumericInput
                          className="h-9"
                          min={0}
                          emptyOnBlur={0}
                          value={setupDeploymentCharges}
                          onValueChange={(v) => setSetupDeploymentCharges(Number(v) || 0)}
                        />
                      </div>
                      {canOverride && (
                        <div className="min-w-0 space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Final override</Label>
                          <div className="flex items-center gap-2">
                            <Switch checked={overrideFinal} onCheckedChange={setOverrideFinal} />
                            <Input
                              type="number"
                              className="h-9 min-w-0 flex-1 text-sm"
                              value={finalQuoteValue}
                              onChange={(e) => setFinalQuoteValue(e.target.value)}
                              placeholder={String(totals.grandTotal)}
                              disabled={!overrideFinal}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 text-xs tabular-nums text-muted-foreground sm:border-l sm:border-border sm:pl-3">
                      <div className="flex justify-between gap-3"><span>Subtotal</span><span className="font-mono text-foreground">{formatINR(totals.subtotal)}</span></div>
                      <div className="flex justify-between gap-3"><span>GST</span><span className="font-mono text-foreground">{formatINR(totals.totalTax)}</span></div>
                      <div className="flex justify-between gap-3 font-medium text-foreground">
                        <span>Grand total</span>
                        <span className="font-mono">{formatINR(totals.grandTotal)}</span>
                      </div>
                      {overrideFinal && finalQuoteValue ? (
                        <div className="flex justify-between gap-3 font-medium text-primary">
                          <span>Override</span>
                          <span className="font-mono">{formatINR(Number(finalQuoteValue) || totals.grandTotal)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-border px-2.5 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={refreshPdfPreview}
                  disabled={pdfPreviewLoading || !canOpenPdfEditor}
                >
                  {pdfPreviewLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                  Refresh
                </Button>
                <Button type="button" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setPdfEditorOpen(false)}>
                  Done
                </Button>
              </div>
            </div>

            <div className="relative h-full min-h-[280px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-muted/40">
              {pdfPreviewLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-[11px] text-muted-foreground">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating preview
                </div>
              )}
              {pdfPreviewUrl ? (
                <iframe
                  title="PDF preview"
                  src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&view=FitH`}
                  className="h-full w-full border-0 bg-transparent"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No preview yet
                </div>
              )}
            </div>
          </DialogBody>
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
