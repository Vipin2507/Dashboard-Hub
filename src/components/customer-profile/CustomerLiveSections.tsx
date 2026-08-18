import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import { dealsActorQuery } from "@/lib/dealsApi";
import { formatINR, can } from "@/lib/rbac";
import { canEditDeal } from "@/lib/dealPermissions";
import { normalizeDealStatus } from "@/lib/dealStatus";
import { proposalStatusLabel } from "@/lib/proposalStatus";
import { useAppStore } from "@/store/useAppStore";
import type { Deal, Proposal } from "@/types";
import type { CustomerPaymentSummary } from "@/types/payments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
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

import { DEFAULT_SALES_STAGES, dealStageLabel, normalizeDealStage } from "@/lib/dealStage";

const DEFAULT_STAGES = [...DEFAULT_SALES_STAGES];

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

  const { data = [], isLoading, isError } = useQuery({
    queryKey: QK.customerProposals(customerId),
    queryFn: () =>
      api.get<Proposal[]>(`/proposals?customerId=${encodeURIComponent(customerId)}`),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
    enabled: !!customerId,
  });

  const sorted = useMemo(() => [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading proposals…
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-sm text-destructive">Could not load proposals.</p>;
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
                  {proposalStatusLabel(p.status)}
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
  const { data: summary, isLoading, isError } = useQuery({
    queryKey: QK.paymentSummary(customerId),
    queryFn: () =>
      api.get<CustomerPaymentSummary>(`/payments/customer/${encodeURIComponent(customerId)}/summary-v2`),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
    enabled: !!customerId,
  });

  const rows = useMemo(() => {
    const installments = (summary?.plans ?? []).flatMap((plan) =>
      (plan.installments ?? []).map((inst) => ({
        ...inst,
        planName: plan.plan_name,
        dealId: plan.deal_id,
      })),
    );
    return installments.sort((a, b) => String(b.due_date ?? "").localeCompare(String(a.due_date ?? "")));
  }, [summary]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-sm text-destructive">Could not load payments.</p>;
  }

  const totalPaid = summary?.summary?.totalPaid ?? 0;
  const totalPending = summary?.summary?.totalPending ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {(can(me.role, "customers", "view") && (me.role === "finance" || me.role === "super_admin")) && (
          <Button size="sm" variant="outline" onClick={onRecordPayment}>
            Record payment
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <StatusPill tone="success">Paid {formatINR(totalPaid)}</StatusPill>
          <StatusPill tone={totalPending > 0 ? "warning" : "muted"}>Pending {formatINR(totalPending)}</StatusPill>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Due</TableHead>
              <TableHead className="text-xs">Installment</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Paid</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((pay) => (
              <TableRow key={pay.id}>
                <TableCell className="text-xs">{pay.due_date || "—"}</TableCell>
                <TableCell className="text-sm">{pay.label || pay.planName}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatINR(Number(pay.amount ?? 0))}</TableCell>
                <TableCell>
                  <StatusPill
                    tone={
                      pay.status === "paid"
                        ? "success"
                        : pay.status === "overdue"
                          ? "danger"
                          : pay.status === "partial"
                            ? "warning"
                            : "muted"
                    }
                  >
                    {pay.status}
                  </StatusPill>
                </TableCell>
                <TableCell className="text-xs">{pay.paid_date || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{pay.transaction_reference || "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No payment plan yet. Convert a proposal to a deal with a plan to see installments here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
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

  const { data = [], isLoading, isError } = useQuery({
    queryKey: QK.customerDeals(customerId),
    queryFn: () => api.get<Deal[]>(`/deals?${dealsActorQuery(me, { customerId })}`),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
    enabled: !!customerId,
  });

  const filteredDeals = useMemo(() => {
    if (!dealIdAllowlist) return data;
    if (dealIdAllowlist.size === 0) return [];
    return data.filter((d) => dealIdAllowlist.has(d.id));
  }, [data, dealIdAllowlist]);

  const stageOptions = useMemo(() => {
    const s = new Set([
      ...DEFAULT_STAGES,
      ...filteredDeals.map((d) => normalizeDealStage(d.stage)),
    ]);
    return Array.from(s);
  }, [filteredDeals]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading deals…
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-sm text-destructive">Could not load deals.</p>;
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
                    value={normalizeDealStage(d.stage)}
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
                          {dealStageLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {dealStageLabel(d.stage)}
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => navigate(`/deals?q=${encodeURIComponent(d.id)}`)}
                >
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
  const me = useAppStore((s) => s.me);
  const { data: proposals = [], isLoading: lp } = useQuery({
    queryKey: QK.customerProposals(customerId),
    queryFn: () => api.get<Proposal[]>(`/proposals?customerId=${encodeURIComponent(customerId)}`),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
    enabled: !!customerId,
  });
  const { data: deals = [], isLoading: ld } = useQuery({
    queryKey: QK.customerDeals(customerId),
    queryFn: () => api.get<Deal[]>(`/deals?${dealsActorQuery(me, { customerId })}`),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
    enabled: !!customerId,
  });
  const { data: summary, isLoading: ls } = useQuery({
    queryKey: QK.paymentSummary(customerId),
    queryFn: () =>
      api.get<CustomerPaymentSummary>(`/payments/customer/${encodeURIComponent(customerId)}/summary-v2`),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
    enabled: !!customerId,
  });

  const entries = useMemo(() => {
    const rows: { id: string; label: string; sub: string; at: string; kind: "proposal" | "deal" | "payment" }[] = [];
    for (const p of proposals) {
      rows.push({
        id: `p-${p.id}`,
        label: `Proposal ${p.proposalNumber}`,
        sub: `${p.title} — ${proposalStatusLabel(p.status)}`,
        at: p.updatedAt || p.createdAt,
        kind: "proposal",
      });
    }
    const visibleDeals = !dealIdAllowlist ? deals : deals.filter((d) => dealIdAllowlist.has(d.id));
    for (const d of visibleDeals) {
      rows.push({
        id: `d-${d.id}`,
        label: `Deal ${d.id}`,
        sub: `${d.name} — ${normalizeDealStatus(d.dealStatus)} · ${dealStageLabel(d.stage)}`,
        at: d.updatedAt || d.lastActivityAt || "",
        kind: "deal",
      });
    }
    const pays = (summary?.plans ?? []).flatMap((plan) => plan.installments ?? []);
    for (const pay of pays) {
      rows.push({
        id: `pay-${pay.id}`,
        label: "Payment",
        sub: `${formatINR(Number(pay.amount ?? 0))} · ${pay.label ?? ""} · ${pay.status ?? ""}`,
        at: String(pay.paid_date || pay.due_date || ""),
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
