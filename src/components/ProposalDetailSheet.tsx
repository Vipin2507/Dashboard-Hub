import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { sheetContentDetail } from "@/lib/dialogLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Pencil, Send, Check, X, FileText, FileDown, Loader2, Handshake, Trophy, Snowflake, ExternalLink } from "lucide-react";
import type { Proposal, ProposalStatus } from "@/types";
import { formatINR } from "@/lib/rbac";
import { can } from "@/lib/rbac";
import { useAppStore } from "@/store/useAppStore";

const STATUS_BADGE: Record<ProposalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700",
  shared: "bg-sky-500/15 text-sky-700",
  approval_pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-green-500/15 text-green-700",
  negotiation: "bg-indigo-500/15 text-indigo-700",
  won: "bg-emerald-500/15 text-emerald-700",
  cold: "bg-slate-500/15 text-slate-700",
  rejected: "bg-red-500/15 text-red-700",
  deal_created: "bg-purple-500/15 text-purple-700",
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

  if (!proposal) return null;

  const region = regions.find((r) => r.id === proposal.regionId);
  const team = teams.find((t) => t.id === proposal.teamId);
  const approver = proposal.approvedBy ? users.find((u) => u.id === proposal.approvedBy) : null;
  const canUpdate = can(me.role, "proposals", "update");
  const canApprove = can(me.role, "proposals", "approve");
  const canReject = can(me.role, "proposals", "reject");
  const canSend = can(me.role, "proposals", "send");
  const canEdit =
    (proposal.status === "draft" || proposal.status === "rejected" || proposal.status === "negotiation") &&
    (me.role === "super_admin" || proposal.assignedTo === me.id);
  const canOutcome = canUpdate && (me.role === "super_admin" || proposal.assignedTo === me.id) && !proposal.dealId;

  const activityLog: { at: string; text: string }[] = [];
  if (proposal.createdAt) activityLog.push({ at: proposal.createdAt, text: `Created by ${proposal.assignedToName}` });
  if (proposal.approvedAt) activityLog.push({ at: proposal.approvedAt, text: `Approved by ${approver?.name ?? "—"}` });
  if (proposal.sentAt) activityLog.push({ at: proposal.sentAt, text: "Sent to customer" });
  if (proposal.dealId) activityLog.push({ at: proposal.updatedAt, text: `Deal created (${proposal.dealId})` });
  activityLog.sort((a, b) => b.at.localeCompare(a.at));

  const dealValueInclGst = proposal.finalQuoteValue ?? proposal.grandTotal;
  const setupCharges = Number((proposal as unknown as { setupDeploymentCharges?: number }).setupDeploymentCharges) || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={sheetContentDetail}>
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2">
            <span>{proposal.proposalNumber}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDownloadPdf} title="Download PDF" disabled={isPdfLoading}>
                {isPdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              </Button>
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit">
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              {canSend && (proposal.status === "approved" || proposal.status === "draft" || proposal.status === "negotiation") && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSend} title="Send">
                  <Send className="w-4 h-4" />
                </Button>
              )}
              {canApprove && proposal.status === "approval_pending" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={onApprove} title="Approve">
                  <Check className="w-4 h-4" />
                </Button>
              )}
              {canReject && proposal.status === "approval_pending" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={onReject} title="Reject">
                  <X className="w-4 h-4" />
                </Button>
              )}
              {(canApprove || me.role === "super_admin") && proposal.status === "approved" && !proposal.dealId && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCreateDeal} title="Create Deal">
                  <FileText className="w-4 h-4" />
                </Button>
              )}
              {proposal.dealId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/deals?proposalId=${proposal.id}`);
                  }}
                  title="View Deal"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
              {canOutcome && proposal.status !== "negotiation" && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkNegotiation} title="Mark Negotiation">
                  <Handshake className="w-4 h-4" />
                </Button>
              )}
              {canOutcome && proposal.status !== "won" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={onMarkWon} title="Mark Won">
                  <Trophy className="w-4 h-4" />
                </Button>
              )}
              {canOutcome && proposal.status !== "cold" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={onMarkCold} title="Mark Cold">
                  <Snowflake className="w-4 h-4" />
                </Button>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="lineitems">Line Items</TabsTrigger>
            <TabsTrigger value="versions">Version History</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              <Badge className={STATUS_BADGE[proposal.status]}>
                <span className="whitespace-nowrap">{proposal.status.replace(/_/g, " ")}</span>
              </Badge>
              <span className="text-xs text-muted-foreground">Created {new Date(proposal.createdAt).toLocaleDateString()}</span>
              <span className="text-xs text-muted-foreground">Valid until {proposal.validUntil}</span>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Lead Name / Proposal Title" value={proposal.title} />
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Company Name</span>
                <button
                  type="button"
                  className="text-primary hover:underline text-right"
                  onClick={() => { onOpenChange(false); navigate(`/customers/${proposal.customerId}`); }}
                >
                  {proposal.customerName}
                </button>
              </div>
              <Row label="Deal Owner" value={proposal.assignedToName} />
              <Row label="Region" value={region?.name} />
              <Row label="Team" value={team?.name} />
              <Row label="Deal Value (Excl. GST)" value={formatINR(proposal.subtotal)} />
              <Row label="GST Amount" value={formatINR(proposal.totalTax)} />
              <Row label="Setup & Deployment Charges" value={formatINR(setupCharges)} />
              <Row label="Deal Value (Incl. GST)" value={formatINR(dealValueInclGst)} />
              {proposal.notes && <Row label="Internal notes" value={proposal.notes} />}
              {proposal.customerNotes && <Row label="Remark" value={proposal.customerNotes} />}
              {proposal.rejectionReason && <Row label="Rejection reason" value={proposal.rejectionReason} />}
            </div>
          </TabsContent>

          <TabsContent value="lineitems" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs">Item code</TableHead>
                  <TableHead className="text-xs">Qty</TableHead>
                  <TableHead className="text-xs text-right">Unit Price</TableHead>
                  <TableHead className="text-xs">Disc %</TableHead>
                  <TableHead className="text-xs text-right">Line Total</TableHead>
                  <TableHead className="text-xs">GST %</TableHead>
                  <TableHead className="text-xs text-right">GST Amt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposal.lineItems.map((li) => (
                  <TableRow key={li.id}>
                    <TableCell className="text-sm">{li.name}</TableCell>
                    <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                    <TableCell>{li.qty}</TableCell>
                    <TableCell className="text-right font-mono">{formatINR(li.unitPrice)}</TableCell>
                    <TableCell>{li.discount}%</TableCell>
                    <TableCell className="text-right font-mono">{formatINR(li.lineTotal)}</TableCell>
                    <TableCell>{li.taxRate}%</TableCell>
                    <TableCell className="text-right font-mono">{formatINR(li.taxAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 p-3 rounded-md bg-muted/50 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatINR(proposal.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Discount</span><span className="font-mono">-{formatINR(proposal.totalDiscount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total GST</span><span className="font-mono">{formatINR(proposal.totalTax)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Setup &amp; Deployment Charges</span><span className="font-mono">{formatINR(setupCharges)}</span></div>
              <div className="flex justify-between font-medium pt-1 border-t"><span>Grand Total</span><span className="font-mono">{formatINR(proposal.grandTotal)}</span></div>
              {proposal.finalQuoteValue != null && proposal.finalQuoteValue !== proposal.grandTotal && (
                <div className="flex justify-between font-medium text-primary"><span>Final Quote (overridden)</span><span className="font-mono">{formatINR(proposal.finalQuoteValue)}</span></div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="versions" className="mt-4 space-y-3">
            {proposal.versionHistory.map((v) => (
              <div key={v.version} className="p-3 border rounded-md">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">By {users.find((u) => u.id === v.createdBy)?.name ?? v.createdBy}</p>
                <p className="text-sm font-mono mt-1">Grand total: {formatINR(v.grandTotal)}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="activity" className="mt-4 space-y-2">
            {activityLog.map((a, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">{new Date(a.at).toLocaleString()}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-1 border-b border-border/50">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? "—"}</span>
    </div>
  );
}
