import { useState, useMemo } from 'react';
import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { getScope, visibleWithScope, can, formatINR } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { dialogSmMax2xl, dialogSmMaxMd } from '@/lib/dialogLayout';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Lock, DollarSign, FileText, CheckCircle, Clock, Plus, Trash2 } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { PRODUCT_CATEGORIES, SUBSCRIPTION_TYPES, PROPOSAL_FORMATS } from '@/lib/masterData';
import type { ProposalLineItem } from '@/types';

const STATUS_DOT: Record<string, string> = {
  PROPOSAL_DRAFT: 'bg-muted-foreground',
  PROPOSAL_SHARED: 'bg-success',
  PROPOSAL_APPROVED: 'bg-success',
  DEAL_CREATED: 'bg-primary',
};

export default function ProposalsPage() {
  const me = useAppStore(s => s.me);
  const proposals = useAppStore(s => s.proposals);
  const customers = useAppStore(s => s.customers);
  const inventoryItems = useAppStore(s => s.inventoryItems);
  const users = useAppStore(s => s.users);
  const teams = useAppStore(s => s.teams);
  const regions = useAppStore(s => s.regions);
  const createProposal = useAppStore(s => s.createProposal);
  const shareProposal = useAppStore(s => s.shareProposal);
  const reviseProposal = useAppStore(s => s.reviseProposal);
  const requestApproval = useAppStore(s => s.requestApproval);
  const approveProposal = useAppStore(s => s.approveProposal);
  const createDeal = useAppStore(s => s.createDeal);
  const updateFinalValue = useAppStore(s => s.updateFinalValue);

  const scope = getScope(me.role, 'proposals');
  const visible = visibleWithScope(scope, me, proposals);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = proposals.find(p => p.id === selectedId);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseValue, setReviseValue] = useState('');
  const [fqv, setFqv] = useState('');

  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCustomerId, setNewCustomerId] = useState<string | undefined>(customers[0]?.id);
  const managers = users.filter(u => u.role === 'sales_manager');
  const [newManagerId, setNewManagerId] = useState<string | undefined>(managers[0]?.id);
  const [newCategory, setNewCategory] = useState<string | undefined>(PRODUCT_CATEGORIES[0]);
  const [newSubType, setNewSubType] = useState<string | undefined>(SUBSCRIPTION_TYPES[0]);
  const [newFormat, setNewFormat] = useState<string | undefined>(PROPOSAL_FORMATS[0]);
  const [newValue, setNewValue] = useState('');
  const [newLineItems, setNewLineItems] = useState<ProposalLineItem[]>([]);
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');

  const activeInventory = useMemo(() => inventoryItems.filter(it => it.isActive), [inventoryItems]);
  const inventoryFiltered = useMemo(() => {
    if (!inventorySearch.trim()) return activeInventory;
    const q = inventorySearch.trim().toLowerCase();
    return activeInventory.filter(
      it => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
    );
  }, [activeInventory, inventorySearch]);

  const lineItemsSubtotal = newLineItems.reduce((s, li) => s + li.lineTotal, 0);
  const lineItemsTax = newLineItems.reduce((s, li) => s + li.taxAmount, 0);
  const lineItemsGrandTotal = lineItemsSubtotal + lineItemsTax;

  function addLineItemFromInventory(item: (typeof activeInventory)[0]) {
    const qty = 1;
    const unitPrice = item.sellingPrice;
    const lineTotal = qty * unitPrice;
    const taxAmount = (lineTotal * item.taxRate) / 100;
    setNewLineItems(prev => [
      ...prev,
      {
        inventoryItemId: item.id,
        name: item.name,
        sku: item.sku,
        qty,
        unitPrice,
        taxRate: item.taxRate,
        lineTotal,
        taxAmount,
      },
    ]);
    setInventoryPickerOpen(false);
    setInventorySearch('');
  }

  function updateLineItem(idx: number, updates: Partial<ProposalLineItem>) {
    setNewLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const merged = { ...li, ...updates };
      const lineTotal = (merged.qty ?? li.qty) * (merged.unitPrice ?? li.unitPrice);
      const taxRate = merged.taxRate ?? li.taxRate;
      const taxAmount = (lineTotal * taxRate) / 100;
      return { ...merged, lineTotal, taxAmount } as ProposalLineItem;
    }));
  }

  function removeLineItem(idx: number) {
    setNewLineItems(prev => prev.filter((_, i) => i !== idx));
  }

  const customer = selected ? customers.find(c => c.id === selected.customerId) : null;
  const owner = selected ? users.find(u => u.id === selected.ownerUserId) : null;
  const approver = selected?.approvedBy ? users.find(u => u.id === selected.approvedBy) : null;
  const team = selected ? teams.find(t => t.id === selected.teamId) : null;
  const manager = selected?.managerId ? users.find(u => u.id === selected.managerId) : null;
  const region = selected ? regions.find(r => r.id === selected.regionId) : null;
  const dealCreated = !!selected?.dealId;

  const canUpdate = can(me.role, 'proposals', 'update');
  const canShare = can(me.role, 'proposals', 'share');
  const canApprove = can(me.role, 'proposals', 'approve');
  const canRequestAppr = can(me.role, 'proposals', 'request_approval');
  const canOverride = can(me.role, 'proposals', 'override_final_value');
  const canAdminOverride = can(me.role, 'proposals', 'admin_override');

  // Stats
  const totalEstimated = visible.reduce((s, p) => s + p.calculatedTotal, 0);
  const accepted = visible.filter(p => p.approvedBy).length;
  const pending = visible.filter(p => p.pendingApproval).length;

  function handleShare() {
    if (selected && shareEmail) {
      shareProposal(selected.id, shareEmail);
      setShareOpen(false);
      setShareEmail('');
    }
  }
  function handleRevise() {
    if (selected && reviseValue) {
      reviseProposal(selected.id, Number(reviseValue));
      setReviseOpen(false);
      setReviseValue('');
    }
  }
  function handleUpdateFqv() {
    if (selected && fqv) {
      updateFinalValue(selected.id, Number(fqv));
      setFqv('');
    }
  }

  function handleCreate() {
    const valueToUse = newLineItems.length > 0 ? lineItemsGrandTotal : Number(newValue);
    if (!newTitle || !newCustomerId) return;
    if (newLineItems.length === 0 && (!newValue || !Number.isFinite(Number(newValue)) || Number(newValue) <= 0)) return;
    if (newLineItems.length > 0 && lineItemsGrandTotal <= 0) return;
    const proposalNo = `PROP-${new Date().getFullYear()}-${String(proposals.length + 1).padStart(4, '0')}`;
    createProposal({
      proposalNo,
      customerId: newCustomerId,
      ownerUserId: me.id,
      teamId: me.teamId,
      regionId: me.regionId,
      managerId: newManagerId,
      productCategory: newCategory,
      subscriptionType: newSubType,
      proposalFormat: newFormat,
      value: valueToUse,
      lineItems: newLineItems.length > 0 ? newLineItems : undefined,
    });
    toast({
      title: 'Proposal created',
      description: `${newTitle} has been created as ${proposalNo}.`,
    });
    setNewTitle('');
    setNewCustomerId(customers[0]?.id);
    setNewManagerId(managers[0]?.id);
    setNewCategory(PRODUCT_CATEGORIES[0]);
    setNewSubType(SUBSCRIPTION_TYPES[0]);
    setNewFormat(PROPOSAL_FORMATS[0]);
    setNewValue('');
    setNewLineItems([]);
    setNewOpen(false);
  }

  return (
    <>
      <Topbar title="Proposals" subtitle="Create quotes before finalizing deals" />
      <div className="space-y-4 sm:space-y-6">
        {/* Stat cards */}
        <div className="flex items-center justify-between gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">Total Estimated</p>
              <p className="text-2xl font-bold text-foreground">{formatINR(totalEstimated)}</p>
              <p className="text-xs text-muted-foreground mt-1">{visible.length} proposals</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">Accepted</p>
              <p className="text-2xl font-bold text-success">{accepted}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatINR(visible.filter(p => p.approvedBy).reduce((s, p) => s + p.finalQuoteValue, 0))}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">Pending</p>
              <p className="text-2xl font-bold text-warning">{pending}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatINR(visible.filter(p => p.pendingApproval).reduce((s, p) => s + p.finalQuoteValue, 0))}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">Shared</p>
              <p className="text-2xl font-bold text-primary">{visible.filter(p => p.sharedTo).length}</p>
              <p className="text-xs text-muted-foreground mt-1">Sent to clients</p>
            </CardContent>
          </Card>
          </div>
          <Button size="sm" className="text-xs h-9" onClick={() => setNewOpen(true)}>
            + New Proposal
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Table */}
          <Card className="flex-1 bg-card border border-border">
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-foreground">All Proposals</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Proposal No</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Manager</TableHead>
                    <TableHead className="text-xs">Product Category</TableHead>
                    <TableHead className="text-xs">Subscription</TableHead>
                    <TableHead className="text-xs">Format</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Owner</TableHead>
                    <TableHead className="text-xs text-right">Final / Calc</TableHead>
                    <TableHead className="text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(p => {
                    const c = customers.find(c => c.id === p.customerId);
                    const o = users.find(u => u.id === p.ownerUserId);
                    const m = p.managerId ? users.find(u => u.id === p.managerId) : null;
                    return (
                      <TableRow key={p.id} className={selectedId === p.id ? 'bg-accent' : ''}>
                        <TableCell className="font-mono-id">{p.proposalNo}</TableCell>
                        <TableCell className="text-sm">{c?.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m?.name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.productCategory ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.subscriptionType ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.proposalFormat ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${p.pendingApproval ? 'bg-warning' : STATUS_DOT[p.status] ?? 'bg-muted-foreground'}`} />
                            <span className="text-xs">{p.status.replace(/_/g, ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{o?.name}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatINR(p.finalQuoteValue)} / {formatINR(p.calculatedTotal)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setSelectedId(p.id); setFqv(String(p.finalQuoteValue)); }}>Open</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visible.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-12">No proposals in scope</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detail panel */}
          {selected && (
            <Card className="w-[380px] min-w-[380px] bg-card border border-border self-start">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="font-mono-id font-bold text-base">{selected.proposalNo}</h3>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="outline" className="text-[10px]">{selected.status.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline" className="text-[10px]">{scope}</Badge>
                    <Badge variant="outline" className="text-[10px]">{team?.name}</Badge>
                    {dealCreated && <Badge className="text-[10px] bg-accent text-accent-foreground"><Lock className="w-3 h-3 mr-1" />Deal Created</Badge>}
                  </div>
                </div>

                <div className="space-y-2 text-sm border-t border-border pt-3">
                  <Row label="Customer" value={customer?.name} />
                  <Row label="Owner" value={owner?.name} />
                  <Row label="Manager" value={manager?.name ?? null} />
                  <Row label="Product category" value={selected.productCategory ?? null} />
                  <Row label="Subscription type" value={selected.subscriptionType ?? null} />
                  <Row label="Proposal format" value={selected.proposalFormat ?? null} />
                  <Row label="Shared to" value={selected.sharedTo ?? '—'} mono />
                  <Row label="Approved by" value={approver?.name ?? (selected.pendingApproval ? '⏳ Pending' : '—')} />
                  <Row label="Calculated total" value={formatINR(selected.calculatedTotal)} />
                  {selected.lineItems && selected.lineItems.length > 0 && (
                    <div className="border-t border-border pt-3 mt-2">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Line items</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] p-1">Item</TableHead>
                            <TableHead className="text-[10px] p-1">Qty</TableHead>
                            <TableHead className="text-[10px] p-1 text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.lineItems.map((li, i) => (
                            <TableRow key={`${li.inventoryItemId}-${i}`}>
                              <TableCell className="text-xs p-1">{li.name} ({li.sku})</TableCell>
                              <TableCell className="text-xs p-1">{li.qty}</TableCell>
                              <TableCell className="text-xs p-1 text-right font-mono">{formatINR(li.lineTotal + li.taxAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Final Quote Value */}
                <div className="space-y-1.5 border-t border-border pt-3">
                  <Label className="text-xs text-muted-foreground">Final Quote Value</Label>
                  <div className="flex gap-2">
                    <Input type="number" value={fqv} onChange={e => setFqv(e.target.value)} className="font-mono text-sm h-9" disabled={dealCreated ? !canAdminOverride : !canOverride} />
                    <Btn disabled={dealCreated ? !canAdminOverride : !canOverride} reason={dealCreated ? 'Only Super Admin can update after deal' : 'No permission'} onClick={handleUpdateFqv}>Update</Btn>
                  </div>
                </div>

                {dealCreated && canAdminOverride && (
                  <div className="p-3 rounded-md bg-warning/10 border border-warning/20 text-xs text-warning">
                    ⚠️ Admin override: updating value after deal creation will trigger an audit log.
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <Btn disabled={!canShare || dealCreated} reason={dealCreated ? 'Deal created' : 'No share permission'} onClick={() => setShareOpen(true)}>Share</Btn>
                  <Btn disabled={!canUpdate || dealCreated} reason={dealCreated ? 'Deal created' : 'No update permission'} onClick={() => setReviseOpen(true)}>Revise</Btn>
                  <Btn disabled={!canRequestAppr || dealCreated} reason={dealCreated ? 'Deal created' : 'No permission'} onClick={() => requestApproval(selected.id)}>Request Approval</Btn>
                  <Btn disabled={!canApprove || dealCreated} reason={dealCreated ? 'Deal created' : 'Only Sales Manager'} onClick={() => approveProposal(selected.id)}>Approve</Btn>
                  <Button size="sm" className="text-xs h-8" disabled={!selected.approvedBy || dealCreated} onClick={() => createDeal(selected.id)}>Create Deal</Button>
                </div>

                {/* Version History */}
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">Version History</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] p-1">V#</TableHead>
                        <TableHead className="text-[10px] p-1">Date</TableHead>
                        <TableHead className="text-[10px] p-1">Note</TableHead>
                        <TableHead className="text-[10px] p-1 text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.versions.map(v => (
                        <TableRow key={v.version}>
                          <TableCell className="text-xs font-mono p-1">v{v.version}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground p-1">{new Date(v.date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground p-1">{v.note}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono p-1">{formatINR(v.value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* New Proposal dialog */}
      <Dialog open={newOpen} onOpenChange={(open) => { setNewOpen(open); if (!open) setNewLineItems([]); }}>
        <DialogContent className={dialogSmMax2xl}>
          <DialogHeader>
            <DialogTitle>Create New Proposal</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Proposal Title *</Label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Enterprise License Agreement"
              />
            </div>
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={newCustomerId}
                onValueChange={setNewCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Manager</Label>
              <Select
                value={newManagerId}
                onValueChange={setNewManagerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product category</Label>
              <Select
                value={newCategory}
                onValueChange={setNewCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subscription type</Label>
              <Select
                value={newSubType}
                onValueChange={setNewSubType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subscription" />
                </SelectTrigger>
                <SelectContent>
                  {SUBSCRIPTION_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proposal format</Label>
              <Select
                value={newFormat}
                onValueChange={setNewFormat}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_FORMATS.map(f => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-3">
              <Label>Line items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setInventoryPickerOpen(true)}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Line Item from Inventory
              </Button>
              {newLineItems.length > 0 && (
                <div className="border rounded-md overflow-hidden mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs">Item code</TableHead>
                        <TableHead className="text-xs w-20">Qty</TableHead>
                        <TableHead className="text-xs text-right">Unit price</TableHead>
                        <TableHead className="text-xs w-16">GST %</TableHead>
                        <TableHead className="text-xs text-right">Line total</TableHead>
                        <TableHead className="text-xs text-right">GST</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newLineItems.map((li, idx) => (
                        <TableRow key={`${li.inventoryItemId}-${idx}`}>
                          <TableCell className="text-xs font-medium">{li.name}</TableCell>
                          <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 text-xs w-16"
                              min={1}
                              integer
                              emptyOnBlur={1}
                              value={li.qty}
                              onValueChange={qty => updateLineItem(idx, { qty })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 text-xs text-right w-24"
                              min={0}
                              emptyOnBlur={0}
                              value={li.unitPrice}
                              onValueChange={unitPrice => updateLineItem(idx, { unitPrice })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 text-xs w-14"
                              min={0}
                              emptyOnBlur={0}
                              value={li.taxRate}
                              onValueChange={taxRate => updateLineItem(idx, { taxRate })}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatINR(li.lineTotal)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatINR(li.taxAmount)}</TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLineItem(idx)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-2 border-t bg-muted/30 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">{formatINR(lineItemsSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total GST</span>
                      <span className="font-mono">{formatINR(lineItemsTax)}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-1">
                      <span>Grand total</span>
                      <span className="font-mono">{formatINR(lineItemsGrandTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-3">
              <Label>Proposal value (₹) {newLineItems.length > 0 ? '(from line items or override)' : ''}</Label>
              <Input
                type="number"
                value={newLineItems.length > 0 ? lineItemsGrandTotal : newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="350000"
                readOnly={newLineItems.length > 0}
                className={newLineItems.length > 0 ? 'bg-muted' : ''}
              />
              {newLineItems.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Value is set from line items. Use Final Quote Value in proposal detail to override if you have permission.</p>
              )}
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>
              Create Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share Proposal</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2"><Label>Customer Email</Label><Input value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="email@example.com" /></DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button><Button onClick={handleShare}>Share</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Revise Dialog */}
      <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revise Proposal</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2"><Label>New Calculated Total (₹)</Label><Input type="number" value={reviseValue} onChange={e => setReviseValue(e.target.value)} /></DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setReviseOpen(false)}>Cancel</Button><Button onClick={handleRevise}>Revise</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Line Item from Inventory */}
      <Dialog open={inventoryPickerOpen} onOpenChange={setInventoryPickerOpen}>
        <DialogContent className={dialogSmMaxMd}>
          <DialogHeader>
            <DialogTitle>Add line item from inventory</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Input
              placeholder="Search by name or item code..."
              value={inventorySearch}
              onChange={e => setInventorySearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto border rounded-md">
              {inventoryFiltered.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No active inventory items found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Item code</TableHead>
                      <TableHead className="text-xs text-right">Price</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryFiltered.map(it => (
                      <TableRow key={it.id}>
                        <TableCell className="text-sm">{it.name}</TableCell>
                        <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatINR(it.sellingPrice)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addLineItemFromInventory(it)}>
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function Btn({ children, disabled, reason, onClick }: { children: React.ReactNode; disabled: boolean; reason: string; onClick: () => void }) {
  if (!disabled) return <Button size="sm" variant="outline" className="text-xs h-8" onClick={onClick}>{children}</Button>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex"><Button size="sm" variant="outline" className="text-xs h-8" disabled>{children}</Button></span></TooltipTrigger>
      <TooltipContent><p className="text-xs">{reason}</p></TooltipContent>
    </Tooltip>
  );
}
