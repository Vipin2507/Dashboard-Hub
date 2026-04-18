import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { formatINR, can } from "@/lib/rbac";
import { canEditDeal } from "@/lib/dealPermissions";
import { normalizeDealStatus } from "@/lib/dealStatus";
import { useAppStore } from "@/store/useAppStore";
import type { Deal, Proposal } from "@/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useApproveProposal,
  useRejectProposal,
  useSendProposal,
  useUpdateDealStage,
} from "@/hooks/useWorkflow";

const DEFAULT_STAGES = ["Prospecting", "Qualified", "Proposal", "Negotiation", "Closing"];

type PaymentSummary = {
  decision: unknown;
  plan: unknown;
  payments: Array<Record<string, unknown>>;
};

function formatWhen(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function CustomerProposalsLiveTable({
  customerId,
  onViewProposal,
}: {
  customerId: string;
  onViewProposal: (id: string) => void;
}) {
  const me = useAppStore((s) => s.me);
  const approve = useApproveProposal();
  const reject = useRejectProposal();
  const send = useSendProposal();
  const canApprove = can(me.role, "proposals", "approve");
  const canReject = can(me.role, "proposals", "reject");
  const canSend = can(me.role, "proposals", "send");

  const { data = [], isLoading } = useQuery({
    queryKey: QK.customerProposals(customerId),
    queryFn: () =>
      api.get<Proposal[]>(`/proposals?customerId=${encodeURIComponent(customerId)}`),
    staleTime: 30_000,
    enabled: !!customerId,
  });

  const sorted = useMemo(() => [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading proposals…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Proposal #</TableHead>
            <TableHead className="text-xs">Title</TableHead>
            <TableHead className="text-xs text-right">Value</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Created</TableHead>
            <TableHead className="text-xs">Valid Until</TableHead>
            <TableHead className="text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.proposalNumber}</TableCell>
              <TableCell className="text-sm">{p.title}</TableCell>
              <TableCell className="text-right font-mono text-sm">{formatINR(p.finalQuoteValue ?? p.grandTotal)}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[10px]">
                  {p.status.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{p.createdAt.slice(0, 10)}</TableCell>
              <TableCell className="text-xs">{p.validUntil}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => onViewProposal(p.id)}>
                    View
                  </Button>
                  {canApprove && p.status === "approval_pending" && (
                    <Button
                      size="sm"
                      className="h-7 bg-emerald-600 text-white"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate({ proposalId: p.id, approverId: me.id })}
                    >
                      Approve
                    </Button>
                  )}
                  {canReject && p.status === "approval_pending" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7"
                      disabled={reject.isPending}
                      onClick={() => {
                        const reason = window.prompt("Rejection reason (min 10 chars)?", "");
                        if (reason && reason.trim().length >= 10) reject.mutate({ proposalId: p.id, reason: reason.trim() });
                      }}
                    >
                      Reject
                    </Button>
                  )}
                  {canSend && (p.status === "approved" || p.status === "draft") && (
                    <Button size="sm" variant="outline" className="h-7" disabled={send.isPending} onClick={() => send.mutate(p.id)}>
                      Send
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                No proposals
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function CustomerPaymentsLiveSection({
  customerId,
  onRecordPayment,
}: {
  customerId: string;
  onRecordPayment: () => void;
}) {
  const me = useAppStore((s) => s.me);
  const { data: summary, isLoading } = useQuery({
    queryKey: QK.paymentSummary(customerId),
    queryFn: () => api.get<PaymentSummary>(`/payments/customer/${encodeURIComponent(customerId)}/summary`),
    staleTime: 30_000,
    enabled: !!customerId,
  });

  const payments = (summary?.payments as Array<Record<string, unknown>>) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
      </div>
    );
  }

  const totalPaid = payments
    .filter((p) => p.paymentStatus === "confirmed")
    .reduce((s, p) => s + Number(p.amountPaid ?? 0), 0);

  return (
    <div className="space-y-4">
      {(can(me.role, "customers", "view") && (me.role === "finance" || me.role === "super_admin")) && (
        <Button size="sm" variant="outline" onClick={onRecordPayment}>
          Record payment
        </Button>
      )}
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Mode</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((pay) => (
              <TableRow key={String(pay.id ?? pay.receiptNumber)}>
                <TableCell className="text-xs">{String(pay.paymentDate ?? "")}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(Number(pay.amountPaid ?? 0))}</TableCell>
                <TableCell className="text-xs">{String(pay.paymentMode ?? "—")}</TableCell>
                <TableCell className="text-xs">{String(pay.paymentStatus ?? "—")}</TableCell>
                <TableCell className="text-xs font-mono">{String(pay.transactionRef ?? "—")}</TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  No payments recorded
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {payments.length > 0 && <p className="text-sm font-medium">Confirmed total: {formatINR(totalPaid)}</p>}
    </div>
  );
}

export function CustomerDealsLiveTable({
  customerId,
  dealIdAllowlist,
}: {
  customerId: string;
  dealIdAllowlist?: Set<string> | null;
}) {
  const me = useAppStore((s) => s.me);
  const navigate = useNavigate();
  const updateStage = useUpdateDealStage();
  const canUpdate = canEditDeal(me.role);

  const { data = [], isLoading } = useQuery({
    queryKey: QK.customerDeals(customerId),
    queryFn: () => api.get<Deal[]>(`/deals?customerId=${encodeURIComponent(customerId)}`),
    staleTime: 30_000,
    enabled: !!customerId,
  });

  const filteredDeals = useMemo(() => {
    if (!dealIdAllowlist || dealIdAllowlist.size === 0) return data;
    return data.filter((d) => dealIdAllowlist.has(d.id));
  }, [data, dealIdAllowlist]);

  const stageOptions = useMemo(() => {
    const s = new Set([...DEFAULT_STAGES, ...filteredDeals.map((d) => d.stage)]);
    return Array.from(s);
  }, [filteredDeals]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading deals…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Deal #</TableHead>
            <TableHead className="text-xs">Title</TableHead>
            <TableHead className="text-xs text-right">Value</TableHead>
            <TableHead className="text-xs">Stage</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Updated</TableHead>
            <TableHead className="text-xs">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredDeals.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs">{d.id}</TableCell>
              <TableCell className="text-sm">{d.name}</TableCell>
              <TableCell className="text-right font-mono text-sm">{formatINR(d.value)}</TableCell>
              <TableCell>
                {canUpdate && !d.locked ? (
                  <Select
                    value={d.stage}
                    disabled={updateStage.isPending}
                    onValueChange={(v) =>
                      updateStage.mutate({
                        dealId: d.id,
                        stage: v,
                        prevDealStatus: normalizeDealStatus(d.dealStatus),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px] text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stageOptions.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {d.stage}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {normalizeDealStatus(d.dealStatus)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{d.updatedAt?.slice(0, 10) ?? "—"}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => navigate("/deals")}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {filteredDeals.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                No deals
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function CustomerActivityLiveFeed({
  customerId,
  dealIdAllowlist,
}: {
  customerId: string;
  dealIdAllowlist?: Set<string> | null;
}) {
  const { data: proposals = [], isLoading: lp } = useQuery({
    queryKey: QK.customerProposals(customerId),
    queryFn: () => api.get<Proposal[]>(`/proposals?customerId=${encodeURIComponent(customerId)}`),
    staleTime: 30_000,
    enabled: !!customerId,
  });
  const { data: deals = [], isLoading: ld } = useQuery({
    queryKey: QK.customerDeals(customerId),
    queryFn: () => api.get<Deal[]>(`/deals?customerId=${encodeURIComponent(customerId)}`),
    staleTime: 30_000,
    enabled: !!customerId,
  });
  const { data: summary, isLoading: ls } = useQuery({
    queryKey: QK.paymentSummary(customerId),
    queryFn: () =>
      api.get<PaymentSummary>(`/payments/customer/${encodeURIComponent(customerId)}/summary`),
    staleTime: 30_000,
    enabled: !!customerId,
  });

  const entries = useMemo(() => {
    const rows: { id: string; label: string; sub: string; at: string; kind: "proposal" | "deal" | "payment" }[] = [];
    for (const p of proposals) {
      rows.push({
        id: `p-${p.id}`,
        label: `Proposal ${p.proposalNumber}`,
        sub: `${p.title} — ${p.status.replace(/_/g, " ")}`,
        at: p.updatedAt || p.createdAt,
        kind: "proposal",
      });
    }
    const visibleDeals = !dealIdAllowlist || dealIdAllowlist.size === 0 ? deals : deals.filter((d) => dealIdAllowlist.has(d.id));
    for (const d of visibleDeals) {
      rows.push({
        id: `d-${d.id}`,
        label: `Deal ${d.id}`,
        sub: `${d.name} — ${normalizeDealStatus(d.dealStatus)} · ${d.stage}`,
        at: d.updatedAt || d.lastActivityAt || "",
        kind: "deal",
      });
    }
    const pays = (summary?.payments as Array<Record<string, unknown>>) ?? [];
    for (const pay of pays) {
      rows.push({
        id: `pay-${String(pay.id ?? pay.receiptNumber)}`,
        label: "Payment",
        sub: `${formatINR(Number(pay.amountPaid ?? 0))} · ${String(pay.paymentMode ?? "")} · ${String(pay.paymentStatus ?? "")}`,
        at: String(pay.paymentDate || pay.updatedAt || pay.createdAt || ""),
        kind: "payment",
      });
    }
    rows.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    return rows.slice(0, 40);
  }, [proposals, deals, summary, dealIdAllowlist]);

  if (lp || ld || ls) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity from API yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <div key={e.id} className="flex gap-3 items-start border-b border-border/60 pb-3 last:border-0">
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
            style={{
              backgroundColor:
                e.kind === "proposal"
                  ? "var(--color-blue-500)"
                  : e.kind === "deal"
                    ? "var(--color-purple-500)"
                    : "var(--color-teal-500)",
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{e.label}</p>
            <p className="text-xs text-muted-foreground">{e.sub}</p>
            {e.at && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{formatWhen(e.at)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
