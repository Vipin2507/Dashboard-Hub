import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/rbac";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import type { CustomerProductLine, Deal, Proposal } from "@/types";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumericInput } from "@/components/ui/numeric-input";
import { Plus, Trash2 } from "lucide-react";
import { generateEstimatePdf } from "@/lib/generateEstimatePdf";
import { useAppStore } from "@/store/useAppStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog as SmallDialog,
  DialogContent as SmallDialogContent,
  DialogHeader as SmallDialogHeader,
  DialogTitle as SmallDialogTitle,
  DialogBody as SmallDialogBody,
} from "@/components/ui/dialog";

interface CreateDealDialogProps {
  proposalId: string;
  onClose: () => void;
}

export function CreateDealDialog({ proposalId, onClose }: CreateDealDialogProps) {
  const customers = useAppStore((s) => s.customers);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const regions = useAppStore((s) => s.regions);
  const me = useAppStore((s) => s.me);
  const { data: proposals } = useQuery({
    queryKey: QK.proposals(),
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });
  const proposal = proposals?.find((p) => p.id === proposalId);

  const [companyName, setCompanyName] = useState(proposal?.customerCompanyName ?? "");
  const [customerFullName, setCustomerFullName] = useState(proposal?.customerName ?? "");
  const [billingAddress, setBillingAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [gstin, setGstin] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");

  const [estimateNumber, setEstimateNumber] = useState("");
  const [estimateNumberLoading, setEstimateNumberLoading] = useState(false);
  const [estimateDate, setEstimateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dealTitle, setDealTitle] = useState(proposal?.title ?? "");
  const [dealValue, setDealValue] = useState(String(proposal?.finalQuoteValue ?? proposal?.grandTotal ?? 0));
  const [ownerUserId, setOwnerUserId] = useState(proposal?.assignedTo ?? "");
  const [teamId, setTeamId] = useState(proposal?.teamId ?? "");
  const [regionId, setRegionId] = useState(proposal?.regionId ?? "");
  const [stage, setStage] = useState("Qualified");

  const DEAL_STAGES = ["Qualified", "Proposal", "Negotiation", "Won", "Lost"] as const;

  type EstimateItem = {
    id: string;
    name: string;
    description: string;
    subDescription: string;
    validity: string;
    hsnSac: string;
    qty: number;
    unit: string;
    rate: number;
  };
  const [items, setItems] = useState<EstimateItem[]>([]);

  const [cgstPct, setCgstPct] = useState(9);
  const [sgstPct, setSgstPct] = useState(9);
  const [igstPct, setIgstPct] = useState(0);
  const [notes, setNotes] = useState("Looking forward for your business.");
  const [saving, setSaving] = useState(false);
  const [didAutoFetchCustomerProducts, setDidAutoFetchCustomerProducts] = useState(false);
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");

  useEffect(() => {
    if (!proposal) return;
    const customer = customers.find((c) => c.id === proposal.customerId);
    setCompanyName((customer?.companyName ?? proposal.customerCompanyName ?? "").trim());
    setCustomerFullName((customer?.customerName ?? proposal.customerName ?? "").trim());
    setCity((customer?.address?.city ?? "").trim());
    setState((customer?.address?.state ?? "").trim());
    setPincode((customer?.address?.pincode ?? "").trim());
    setCountry((customer?.address?.country ?? "India").trim() || "India");
    setGstin((customer?.gstin ?? "").trim());
    // Prefer customer primary contact if available, else fallback to customer list fields (if present).
    const primary = customer?.contacts?.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
    setEmail((primary?.email ?? (customer as any)?.email ?? "").trim());
    setPhone((primary?.phone ?? (customer as any)?.primaryPhone ?? "").trim());
    setDealTitle(proposal.title);
    setDealValue(String(proposal.finalQuoteValue ?? proposal.grandTotal ?? 0));
    setOwnerUserId(String(proposal.assignedTo ?? ""));
    setTeamId(String(proposal.teamId ?? ""));
    setRegionId(String(proposal.regionId ?? ""));
    setDidAutoFetchCustomerProducts(false);
  }, [proposalId, proposal]);

  const mapProposalLineItemToEstimateItem = (li: Proposal["lineItems"][number]) => {
    const inv = inventoryItems.find((x) => x.id === li.inventoryItemId);
    return {
      id: li.id,
      name: li.name,
      description: li.description ?? inv?.description ?? "",
      subDescription: li.sku ? `SKU: ${li.sku}` : "",
      validity: "",
      hsnSac: inv?.hsnSacCode ?? "",
      qty: Number(li.qty) || 1,
      unit: (inv?.unitOfMeasure ?? (li as any).qtyLabel ?? "Licence") as string,
      rate: Number(li.unitPrice) || 0,
    };
  };

  const mapProductLineToEstimateItem = (pl: CustomerProductLine) => {
    const inv = inventoryItems.find((x) => x.id === pl.inventoryItemId);
    const validityFrom = pl.purchasedAt ? pl.purchasedAt : "";
    const validityTo = pl.expiryDate || pl.renewalDate || "";
    const validity =
      validityFrom && validityTo ? `${validityFrom} to ${validityTo}` : validityFrom || validityTo || "";
    return {
      id: pl.id,
      name: pl.itemName,
      description: pl.usageDetails ?? inv?.description ?? "",
      subDescription: `${pl.sku}${pl.itemType ? ` · ${pl.itemType}` : ""}`,
      validity,
      hsnSac: inv?.hsnSacCode ?? "",
      qty: pl.qty ?? 1,
      unit: inv?.unitOfMeasure ?? "Licence",
      rate: pl.unitPrice ?? inv?.sellingPrice ?? 0,
    };
  };

  useEffect(() => {
    if (!proposal) return;
    if (didAutoFetchCustomerProducts) return;
    const customer = customers.find((c) => c.id === proposal.customerId);
    const productLines = customer?.productLines ?? [];
    if (productLines.length > 0) {
      setItems(productLines.map(mapProductLineToEstimateItem));
    } else {
      // Fallback to proposal items (so Section C isn't empty)
      const proposalItems = (proposal.lineItems ?? []).map(mapProposalLineItemToEstimateItem);
      setItems(proposalItems);
    }
    setDidAutoFetchCustomerProducts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal?.id, customers, inventoryItems, didAutoFetchCustomerProducts]);

  useEffect(() => {
    if (!proposalId) return;
    setEstimateNumberLoading(true);
    setEstimateNumber("");
    api
      .get<{ estimateNumber: string }>("/estimates/next-number")
      .then((r) => setEstimateNumber(r.estimateNumber))
      .catch(() => setEstimateNumber(""))
      .finally(() => setEstimateNumberLoading(false));
  }, [proposalId]);

  if (!proposal) return null;

  const subTotal = useMemo(() => items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0), [items]);
  const cgstAmount = useMemo(() => (subTotal * (Number(cgstPct) || 0)) / 100, [subTotal, cgstPct]);
  const sgstAmount = useMemo(() => (subTotal * (Number(sgstPct) || 0)) / 100, [subTotal, sgstPct]);
  const igstAmount = useMemo(() => (subTotal * (Number(igstPct) || 0)) / 100, [subTotal, igstPct]);
  const total = useMemo(() => subTotal + cgstAmount + sgstAmount + igstAmount, [subTotal, cgstAmount, sgstAmount, igstAmount]);

  const addItem = () => {
    const id = "estli-" + Math.random().toString(36).slice(2, 10);
    setItems((prev) => [
      ...prev,
      { id, name: "", description: "", subDescription: "", validity: "", hsnSac: "", qty: 1, unit: "Licence", rate: 0 },
    ]);
  };

  const activeInventory = useMemo(() => inventoryItems.filter((it) => it.isActive), [inventoryItems]);
  const inventoryFiltered = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return activeInventory;
    return activeInventory.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q),
    );
  }, [activeInventory, inventorySearch]);

  const addFromInventory = (it: (typeof activeInventory)[number]) => {
    const id = "estli-" + Math.random().toString(36).slice(2, 10);
    setItems((prev) => [
      ...prev,
      {
        id,
        name: it.name,
        description: it.description ?? "",
        subDescription: it.sku ? `SKU: ${it.sku}` : "",
        validity: "",
        hsnSac: it.hsnSacCode ?? "",
        qty: 1,
        unit: it.unitOfMeasure || "Licence",
        rate: it.sellingPrice ?? 0,
      },
    ]);
    setInventoryPickerOpen(false);
    setInventorySearch("");
  };

  const updateItem = (id: string, patch: Partial<EstimateItem>) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  const handleCreate = async () => {
    const numValue = Number(dealValue);
    if (!dealTitle.trim() || !Number.isFinite(numValue) || numValue <= 0) {
      toast.error("Fill Deal Title and a valid Deal Value.");
      return;
    }
    let estNum = estimateNumber.trim();
    if (!estNum) {
      try {
        setEstimateNumberLoading(true);
        const r = await api.get<{ estimateNumber: string }>("/estimates/next-number");
        estNum = String(r.estimateNumber || "").trim();
        setEstimateNumber(estNum);
      } catch {
        toast.error("Estimate number not available. Please start/restart the server (npm run server) and try again.");
        return;
      } finally {
        setEstimateNumberLoading(false);
      }
    }
    if (!estNum) {
      toast.error("Estimate number not available. Please start/restart the server (npm run server) and try again.");
      return;
    }
    if (!companyName.trim()) {
      toast.error("Company name is required.");
      return;
    }
    if (!ownerUserId) {
      toast.error("Owner is required.");
      return;
    }
    if (!teamId) {
      toast.error("Team is required.");
      return;
    }
    if (!regionId) {
      toast.error("Region is required.");
      return;
    }
    if (!stage.trim()) {
      toast.error("Stage is required.");
      return;
    }
    if (!items.length || items.some((it) => !it.name.trim() || !Number.isFinite(it.qty) || it.qty <= 0 || !Number.isFinite(it.rate) || it.rate < 0)) {
      toast.error("Add valid line items (name, qty, rate).");
      return;
    }

    setSaving(true);
    try {
      const estimatePayload = {
        billTo: {
          companyName: companyName.trim(),
          customerFullName: customerFullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          billingAddress: billingAddress.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          country: country.trim() || "India",
          gstin: gstin.trim(),
          placeOfSupply: placeOfSupply.trim(),
        },
        estimate: {
          estimateNumber: estNum,
          estimateDate,
          dealTitle: dealTitle.trim(),
          dealValue: numValue,
        },
        items: items.map((it) => ({
          name: it.name.trim(),
          description: it.description.trim() || undefined,
          subDescription: it.subDescription.trim() || undefined,
          validity: it.validity.trim() || undefined,
          hsnSac: it.hsnSac.trim() || undefined,
          qty: Number(it.qty) || 0,
          unit: it.unit.trim() || undefined,
          rate: Number(it.rate) || 0,
        })),
        tax: {
          subTotal,
          cgstPct: Number(cgstPct) || 0,
          sgstPct: Number(sgstPct) || 0,
          igstPct: Number(igstPct) || 0,
          cgstAmount,
          sgstAmount,
          igstAmount,
          total,
        },
        notes: notes.trim() || "Looking forward for your business.",
      };

      const dealCreate = await api.post<Deal>("/deals", {
        name: dealTitle.trim(),
        customerId: proposal.customerId,
        ownerUserId,
        teamId,
        regionId,
        stage,
        value: numValue,
        locked: true,
        proposalId: proposal.id,
        dealStatus: "Active",
        changedByUserId: me.id,
        changedByName: me.name,
        createdByUserId: me.id,
        createdByName: me.name,
        actorRole: me.role,
        actorUserId: me.id,
        actorTeamId: me.teamId,
        actorRegionId: me.regionId,
        // Show estimate number in existing list column too
        invoiceNumber: estNum,
        invoiceDate: estimateDate,
        placeOfSupply: placeOfSupply.trim() || null,
        amountWithoutTax: subTotal,
        taxAmount: cgstAmount + sgstAmount + igstAmount,
        totalAmount: total,
        estimateNumber: estNum,
        estimateDate,
        estimateJson: JSON.stringify(estimatePayload),
      });

      const proposalUpdated: Proposal = {
        ...proposal,
        status: "deal_created",
        dealId: dealCreate.id,
        updatedAt: new Date().toISOString(),
      };
      await api.put<Proposal>(`/proposals/${proposal.id}`, proposalUpdated);

      await generateEstimatePdf(dealCreate);
      toast.success("Deal created & Estimate PDF generated successfully");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create deal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={!!proposalId} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>Create Deal → Estimate</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-6 max-h-[78vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Proposal <strong>{proposal.proposalNumber}</strong> — {proposal.customerName}
            </p>

          {/* SECTION A */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-semibold">Section A — Bill To</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Customer Full Name</Label>
                <Input value={customerFullName} onChange={(e) => setCustomerFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Billing Address</Label>
                <Textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Pincode</Label>
                <Input value={pincode} onChange={(e) => setPincode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>GSTIN Number</Label>
                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Place of Supply</Label>
                <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="e.g. Maharashtra (27)" />
              </div>
            </div>
          </div>

          {/* SECTION B */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-semibold">Section B — Estimate Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estimate Number</Label>
                <Input value={estimateNumberLoading ? "Generating…" : estimateNumber} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Estimate Date</Label>
                <Datepicker
                  select="single"
                  touchUi={false}
                  inputComponent="input"
                  inputProps={{ placeholder: "Select…", className: "h-9" }}
                  value={ymdToDate(estimateDate)}
                  onChange={(ev) => setEstimateDate(ev.value ? dateToYmd(ev.value) : "")}
                />
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stage</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select value={regionId} onValueChange={setRegionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Deal Title</Label>
                <Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Deal Value (₹)</Label>
                <Input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
                <p className="text-xs text-muted-foreground">Proposal total: {formatINR(proposal.finalQuoteValue ?? proposal.grandTotal)}</p>
              </div>
            </div>
          </div>

          {/* SECTION C */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Section C — Items</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setInventoryPickerOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add from inventory
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add custom item
                </Button>
              </div>
            </div>
            {items.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground bg-muted/20">
                No products found for this customer. Please add items manually.
              </div>
            )}
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs min-w-[320px]">Item Name &amp; Description</TableHead>
                    <TableHead className="text-xs min-w-[240px]">Sub Description</TableHead>
                    <TableHead className="text-xs w-[120px]">HSN/SAC</TableHead>
                    <TableHead className="text-xs w-[220px]">Qty / Unit</TableHead>
                    <TableHead className="text-xs w-[140px] text-right">Rate (₹)</TableHead>
                    <TableHead className="text-xs w-[140px] text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => {
                    const amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="text-xs tabular-nums">{idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            value={it.name}
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                            placeholder="Item name"
                            className="mb-2 h-9"
                          />
                          <Textarea
                            value={it.description}
                            onChange={(e) => updateItem(it.id, { description: e.target.value })}
                            rows={2}
                            placeholder="Description"
                            className="min-h-[64px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Textarea
                            value={it.subDescription}
                            onChange={(e) => updateItem(it.id, { subDescription: e.target.value })}
                            rows={3}
                            placeholder="Sub description"
                            className="min-h-[88px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={it.hsnSac}
                            onChange={(e) => updateItem(it.id, { hsnSac: e.target.value })}
                            placeholder="9983"
                            className="h-9 font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-[90px]">
                              <NumericInput
                                value={it.qty}
                                onValueChange={(v) => updateItem(it.id, { qty: Number(v) || 0 })}
                                min={0}
                                emptyOnBlur={1}
                                className="h-9 text-right"
                              />
                            </div>
                            <Input
                              value={it.unit}
                              onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                              placeholder="Licence"
                              className="h-9"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <NumericInput
                            value={it.rate}
                            onValueChange={(v) => updateItem(it.id, { rate: Number(v) || 0 })}
                            min={0}
                            emptyOnBlur={0}
                            className="h-9 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          ₹{amount.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(it.id)} title="Remove">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                        No items. Click “Add Item”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* SECTION D */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-semibold">Section D — Tax &amp; Totals</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label>Sub Total</Label>
                <Input value={subTotal.toFixed(2)} readOnly />
              </div>
              <div className="space-y-2">
                <Label>CGST %</Label>
                <NumericInput value={cgstPct} onValueChange={(v) => setCgstPct(Number(v) || 0)} min={0} emptyOnBlur={0} />
              </div>
              <div className="space-y-2">
                <Label>SGST %</Label>
                <NumericInput value={sgstPct} onValueChange={(v) => setSgstPct(Number(v) || 0)} min={0} emptyOnBlur={0} />
              </div>
              <div className="space-y-2">
                <Label>IGST % (optional)</Label>
                <NumericInput value={igstPct} onValueChange={(v) => setIgstPct(Number(v) || 0)} min={0} emptyOnBlur={0} />
              </div>
              <div className="space-y-2">
                <Label>CGST Amount</Label>
                <Input value={cgstAmount.toFixed(2)} readOnly />
              </div>
              <div className="space-y-2">
                <Label>SGST Amount</Label>
                <Input value={sgstAmount.toFixed(2)} readOnly />
              </div>
              <div className="space-y-2">
                <Label>IGST Amount</Label>
                <Input value={igstAmount.toFixed(2)} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Total</Label>
                <Input value={total.toFixed(2)} readOnly />
              </div>
            </div>
          </div>

          {/* SECTION E */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-semibold">Section E — Notes</p>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Saving…" : "Save & Create Deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory picker for estimate items */}
      <SmallDialog open={inventoryPickerOpen} onOpenChange={setInventoryPickerOpen}>
        <SmallDialogContent className="sm:max-w-md">
          <SmallDialogHeader>
            <SmallDialogTitle>Add item from inventory</SmallDialogTitle>
          </SmallDialogHeader>
          <SmallDialogBody className="space-y-2">
            <Input
              placeholder="Search name, SKU, category…"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
            />
            <div className="max-h-72 overflow-y-auto border rounded-md">
              {inventoryFiltered.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2 p-2 border-b hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.sku} · {formatINR(it.sellingPrice)} · {it.unitOfMeasure}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addFromInventory(it)}>
                    Add
                  </Button>
                </div>
              ))}
              {inventoryFiltered.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground text-center">No items found</div>
              )}
            </div>
          </SmallDialogBody>
        </SmallDialogContent>
      </SmallDialog>
    </>
  );
}
