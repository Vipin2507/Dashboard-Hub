import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import {
  Pencil,
  Send,
  Check,
  X,
  FileText,
  FileDown,
  Loader2,
  Handshake,
  Trophy,
  Snowflake,
  ExternalLink,
  CheckCheck,
} from "lucide-react";
import type { Proposal, ProposalStatus } from "@/types";
import { formatINR, can } from "@/lib/rbac";
import { useAppStore } from "@/store/useAppStore";
import { isProposalWon, proposalStatusLabel, normalizeProposalStatus } from "@/lib/proposalStatus";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ProposalStatus, StatusTone> = {
  draft: "muted",
  sent: "info",
  shared: "info",
  approval_pending: "warning",
  approved: "success",
  negotiation: "info",
  won: "success",
  cold: "muted",
  rejected: "danger",
  deal_created: "success",
};

interface ProposalDetailSheetProps {
  proposal: Proposal | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSend: () => void;
  onCreateDeal: () => void;
  onMarkNegotiation: () => void;
  onMarkWon: () => void;
  onMarkCold: () => void;
  onDownloadPdf: () => void;
  isPdfLoading?: boolean;
}

export function ProposalDetailSheet({
  proposal,
  open,
  onOpenChange,
  onEdit,
  onApprove,
  onReject,
  onSend,
  onCreateDeal,
  onMarkNegotiation,
  onMarkWon,
  onMarkCold,
  onDownloadPdf,
  isPdfLoading = false,
}: ProposalDetailSheetProps) {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const regions = useAppStore((s) => s.regions);
  const teams = useAppStore((s) => s.teams);
  const updateProposal = useAppStore((s) => s.updateProposal);

  const [editingNumber, setEditingNumber] = useState(false);
  const [numberDraft, setNumberDraft] = useState("");
  const [savingNumber, setSavingNumber] = useState(false);

  useEffect(() => {
    if (!open || !proposal) {
      setEditingNumber(false);
      return;
    }
    setNumberDraft(proposal.proposalNumber || "");
    setEditingNumber(false);
  }, [open, proposal?.id, proposal?.proposalNumber]);

  if (!proposal) return null;

  const region = regions.find((r) => r.id === proposal.regionId);
  const team = teams.find((t) => t.id === proposal.teamId);
  const approver = proposal.approvedBy ? users.find((u) => u.id === proposal.approvedBy) : null;
  const canUpdate = can(me.role, "proposals", "update");
  const canApprove = can(me.role, "proposals", "approve");
  const canReject = can(me.role, "proposals", "reject");
  const canSend = can(me.role, "proposals", "send");
  const ownsOrAdmin = me.role === "super_admin" || proposal.assignedTo === me.id;
  const canEditForm =
    (proposal.status === "draft" ||
      proposal.status === "rejected" ||
      proposal.status === "negotiation" ||
      proposal.status === "approval_pending") &&
    ownsOrAdmin;
  const canEditNumber = canUpdate && ownsOrAdmin;
  const canOutcome = canUpdate && ownsOrAdmin && !proposal.dealId;

  const activityLog: { at: string; text: string }[] = [];
  if (proposal.createdAt) activityLog.push({ at: proposal.createdAt, text: `Created by ${proposal.assignedToName}` });
  if (proposal.approvedAt) activityLog.push({ at: proposal.approvedAt, text: `Approved by ${approver?.name ?? "—"}` });
  if (proposal.sentAt) activityLog.push({ at: proposal.sentAt, text: "Sent to customer" });
  if (proposal.dealId) activityLog.push({ at: proposal.updatedAt, text: `Deal created (${proposal.dealId})` });
  activityLog.sort((a, b) => b.at.localeCompare(a.at));

  const dealValueInclGst = proposal.finalQuoteValue ?? proposal.grandTotal;
  const setupCharges = Number((proposal as unknown as { setupDeploymentCharges?: number }).setupDeploymentCharges) || 0;
  const status = normalizeProposalStatus(proposal.status);

  const saveNumber = async () => {
    const next = numberDraft.trim();
    if (!next) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (next === (proposal.proposalNumber || "").trim()) {
      setEditingNumber(false);
      return;
    }
    setSavingNumber(true);
    try {
      await updateProposal(proposal.id, { proposalNumber: next });
      toast({ title: "Title updated" });
      setEditingNumber(false);
    } catch (e) {
      toast({ title: "Failed to update title", description: String(e), variant: "destructive" });
    } finally {
      setSavingNumber(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn(sheetContentDetail, "gap-0")}>
        <SheetHeader className="space-y-3 border-b border-border pb-3 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              {editingNumber ? (
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="sr-only">{proposal.proposalNumber}</SheetTitle>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Input
                      className="h-8 min-w-0 flex-1 font-mono text-sm font-semibold"
                      value={numberDraft}
                      onChange={(e) => setNumberDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveNumber();
                        if (e.key === "Escape") {
                          setNumberDraft(proposal.proposalNumber || "");
                          setEditingNumber(false);
                        }
                      }}
                      autoFocus
                      disabled={savingNumber}
                      aria-label="Proposal title"
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => void saveNumber()}
                      disabled={savingNumber}
                      title="Save title"
                    >
                      {savingNumber ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        setNumberDraft(proposal.proposalNumber || "");
                        setEditingNumber(false);
                      }}
                      disabled={savingNumber}
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <StatusPill tone={STATUS_TONE[status]}>{proposalStatusLabel(proposal.status)}</StatusPill>
                </div>
              ) : (
                <div className="group flex flex-wrap items-center gap-2">
                  <SheetTitle className="font-mono text-sm font-semibold tracking-tight text-primary sm:text-base">
                    {proposal.proposalNumber}
                  </SheetTitle>
                  <StatusPill tone={STATUS_TONE[status]}>{proposalStatusLabel(proposal.status)}</StatusPill>
                  {canEditNumber ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground opacity-80 hover:text-foreground group-hover:opacity-100"
                      onClick={() => setEditingNumber(true)}
                      title="Edit title"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              )}

              {proposal.title && proposal.title.trim() !== proposal.proposalNumber.trim() ? (
                <p className="text-sm font-medium leading-snug text-foreground">{proposal.title}</p>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
                Created {new Date(proposal.createdAt).toLocaleDateString("en-IN")}
                {proposal.validUntil ? ` · Valid until ${proposal.validUntil}` : ""}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
              <IconAction onClick={onDownloadPdf} title="Download PDF" disabled={isPdfLoading}>
                {isPdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              </IconAction>
              {canEditForm ? (
                <IconAction onClick={onEdit} title="Edit proposal">
                  <Pencil className="h-4 w-4" />
                </IconAction>
              ) : null}
              {canSend &&
              (proposal.status === "approved" || proposal.status === "draft" || proposal.status === "negotiation") ? (
                <IconAction onClick={onSend} title="Send">
                  <Send className="h-4 w-4" />
                </IconAction>
              ) : null}
              {canApprove && proposal.status === "approval_pending" ? (
                <IconAction onClick={onApprove} title="Approve" className="text-success">
                  <Check className="h-4 w-4" />
                </IconAction>
              ) : null}
              {canReject && proposal.status === "approval_pending" ? (
                <IconAction onClick={onReject} title="Reject" className="text-destructive">
                  <X className="h-4 w-4" />
                </IconAction>
              ) : null}
              {(canApprove || me.role === "super_admin") && proposal.status === "approved" && !proposal.dealId ? (
                <IconAction onClick={onCreateDeal} title="Create Deal">
                  <FileText className="h-4 w-4" />
                </IconAction>
              ) : null}
              {proposal.dealId ? (
                <IconAction
                  title="View Deal"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/deals?proposalId=${proposal.id}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </IconAction>
              ) : null}
              {canOutcome && proposal.status !== "negotiation" ? (
                <IconAction onClick={onMarkNegotiation} title="Mark Negotiation">
                  <Handshake className="h-4 w-4" />
                </IconAction>
              ) : null}
              {canOutcome && !isProposalWon(proposal.status) ? (
                <IconAction onClick={onMarkWon} title="Mark Won" className="text-success">
                  <Trophy className="h-4 w-4" />
                </IconAction>
              ) : null}
              {canOutcome && proposal.status !== "cold" ? (
                <IconAction onClick={onMarkCold} title="Mark Cold">
                  <Snowflake className="h-4 w-4" />
                </IconAction>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-4 flex min-h-0 flex-1 flex-col">
          <TabsList className="grid h-9 w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="lineitems" className="text-xs">
              Items
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs">
              Versions
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 space-y-3 duration-200 animate-in fade-in-0">
            <Section title="Customer">
              <MetaRow label="Company">
                <button
                  type="button"
                  className="text-right text-primary hover:underline"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/customers/${proposal.customerId}`);
                  }}
                >
                  {proposal.customerCompanyName || proposal.customerName || "—"}
                </button>
              </MetaRow>
              {proposal.customerName && proposal.customerCompanyName ? (
                <MetaRow label="Contact" value={proposal.customerName} />
              ) : null}
            </Section>

            <Section title="Assignment">
              <MetaRow label="Owner" value={proposal.assignedToName} />
              <MetaRow label="Team" value={team?.name} />
              <MetaRow label="Region" value={region?.name} />
            </Section>

            <Section title="Commercial">
              <MetaRow label="Value excl. GST" value={formatINR(proposal.subtotal)} mono />
              <MetaRow label="GST" value={formatINR(proposal.totalTax)} mono />
              <MetaRow label="Setup & configuration" value={formatINR(setupCharges)} mono />
              <MetaRow label="Value incl. GST" value={formatINR(dealValueInclGst)} mono emphasize />
            </Section>

            {(proposal.notes || proposal.customerNotes || proposal.rejectionReason) && (
              <Section title="Notes">
                {proposal.notes ? <MetaRow label="Internal" value={proposal.notes} /> : null}
                {proposal.customerNotes ? <MetaRow label="Customer remark" value={proposal.customerNotes} /> : null}
                {proposal.rejectionReason ? <MetaRow label="Rejection" value={proposal.rejectionReason} /> : null}
              </Section>
            )}
          </TabsContent>

          <TabsContent value="lineitems" className="mt-3 space-y-3 duration-200 animate-in fade-in-0">
            {proposal.lineItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                No line items on this proposal.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-wide">Item</TableHead>
                        <TableHead className="hidden text-[10px] uppercase tracking-wide sm:table-cell">SKU</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wide">Qty</TableHead>
                        <TableHead className="hidden text-[10px] uppercase tracking-wide md:table-cell">Service</TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wide">Unit</TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wide">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proposal.lineItems.map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="max-w-[10rem]">
                            <p className="truncate text-sm font-medium">{li.name}</p>
                            <p className="text-[10px] text-muted-foreground sm:hidden">{li.sku}</p>
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                            {li.sku}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">{li.qty}</TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                            {li.serviceLabel?.trim() || "12 Months"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {formatINR(li.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatINR(li.lineTotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
                  <TotalsRow label="Subtotal" value={formatINR(proposal.subtotal)} />
                  <TotalsRow label="Discount" value={`-${formatINR(proposal.totalDiscount)}`} />
                  <TotalsRow label="GST" value={formatINR(proposal.totalTax)} />
                  <TotalsRow label="Setup & configuration" value={formatINR(setupCharges)} />
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                    <span>Grand total</span>
                    <span className="font-mono tabular-nums">{formatINR(proposal.grandTotal)}</span>
                  </div>
                  {proposal.finalQuoteValue != null && proposal.finalQuoteValue !== proposal.grandTotal ? (
                    <div className="flex justify-between font-semibold text-primary">
                      <span>Final quote</span>
                      <span className="font-mono tabular-nums">{formatINR(proposal.finalQuoteValue)}</span>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="versions" className="mt-3 space-y-2 duration-200 animate-in fade-in-0">
            {proposal.versionHistory.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                No version history yet.
              </p>
            ) : (
              proposal.versionHistory.map((v) => (
                <div key={v.version} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Version {v.version}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    By {users.find((u) => u.id === v.createdBy)?.name ?? v.createdBy}
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums">{formatINR(v.grandTotal)}</p>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-3 space-y-1.5 duration-200 animate-in fade-in-0">
            {activityLog.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                No activity recorded.
              </p>
            ) : (
              activityLog.map((a, i) => (
                <div
                  key={`${a.at}-${i}`}
                  className="flex gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                >
                  <span className="w-[7.5rem] shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {new Date(a.at).toLocaleString("en-IN")}
                  </span>
                  <span className="min-w-0">{a.text}</span>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function IconAction({
  children,
  title,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/30 px-3 py-1.5">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      </div>
      <div className="divide-y divide-border/60 px-3">{children}</div>
    </section>
  );
}

function MetaRow({
  label,
  value,
  children,
  mono,
  emphasize,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {children ?? (
        <span
          className={cn(
            "min-w-0 text-right",
            mono && "font-mono tabular-nums",
            emphasize && "font-semibold text-foreground",
          )}
        >
          {value ?? "—"}
        </span>
      )}
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}
