import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { apiUrl } from "@/lib/api";
import { staggerItem } from "@/lib/motion";
import { useAppStore } from "@/store/useAppStore";
import type { SalesTargetsResponse } from "@/types/salesTargets";

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type TargetFields = {
  proposalsSentTarget: string;
  proposalsWonTarget: string;
  revenueExclGstTarget: string;
};

function toFields(values: {
  proposalsSentTarget: number;
  proposalsWonTarget: number;
  revenueExclGstTarget: number;
}): TargetFields {
  return {
    proposalsSentTarget: values.proposalsSentTarget ? String(values.proposalsSentTarget) : "",
    proposalsWonTarget: values.proposalsWonTarget ? String(values.proposalsWonTarget) : "",
    revenueExclGstTarget: values.revenueExclGstTarget ? String(values.revenueExclGstTarget) : "",
  };
}

function parseFields(fields: TargetFields) {
  return {
    proposalsSentTarget: Number(fields.proposalsSentTarget) || 0,
    proposalsWonTarget: Number(fields.proposalsWonTarget) || 0,
    revenueExclGstTarget: Number(fields.revenueExclGstTarget) || 0,
  };
}

function TargetInputs({
  values,
  onChange,
  idPrefix,
}: {
  values: TargetFields;
  onChange: (next: TargetFields) => void;
  idPrefix: string;
}) {
  const set =
    (key: keyof TargetFields) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...values, [key]: e.target.value });

  return (
    <div className="grid grid-cols-3 gap-1.5">
      <Input
        id={`${idPrefix}-sent`}
        type="number"
        min={0}
        step={1}
        placeholder="Shared"
        className="h-8 text-xs"
        value={values.proposalsSentTarget}
        onChange={set("proposalsSentTarget")}
      />
      <Input
        id={`${idPrefix}-won`}
        type="number"
        min={0}
        step={0.1}
        placeholder="Won"
        className="h-8 text-xs"
        value={values.proposalsWonTarget}
        onChange={set("proposalsWonTarget")}
      />
      <Input
        id={`${idPrefix}-rev`}
        type="number"
        min={0}
        step={1000}
        placeholder="Revenue"
        className="h-8 text-xs"
        value={values.revenueExclGstTarget}
        onChange={set("revenueExclGstTarget")}
      />
    </div>
  );
}

export function SalesTargetsMasterSection() {
  const me = useAppStore((s) => s.me);
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentYearMonth);
  const [org, setOrg] = useState<TargetFields>({
    proposalsSentTarget: "",
    proposalsWonTarget: "",
    revenueExclGstTarget: "",
  });
  const [executives, setExecutives] = useState<Record<string, TargetFields>>({});

  const query = useQuery<SalesTargetsResponse>({
    queryKey: ["masters", "sales-targets", month],
    queryFn: async () => {
      const qs = new URLSearchParams({
        month,
        actorRole: me.role,
        actorUserId: me.id,
      });
      const res = await fetch(apiUrl(`/api/masters/sales-targets?${qs}`));
      if (!res.ok) throw new Error("Failed to load sales targets");
      return res.json();
    },
    enabled: me.role === "super_admin",
  });

  useEffect(() => {
    if (!query.data) return;
    setOrg(toFields(query.data.org));
    setExecutives(
      Object.fromEntries(query.data.executives.map((e) => [e.userId, toFields(e)])),
    );
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/masters/sales-targets"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          org: parseFields(org),
          executives: (query.data?.executives ?? []).map((e) => ({
            userId: e.userId,
            ...parseFields(executives[e.userId] ?? toFields(e)),
          })),
          actorRole: me.role,
          actorUserId: me.id,
          actorUserName: me.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save sales targets");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masters", "sales-targets", month] });
      toast({ title: "Sales targets saved", description: `Targets for ${month} have been updated.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const execRows = query.data?.executives ?? [];
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }, [month]);

  if (me.role !== "super_admin") return null;

  return (
    <motion.section variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Sales Targets</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Monthly targets for proposals shared, won, and revenue (excl. GST). Used on Executive Performance.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Month</p>
            <Input
              type="month"
              className="h-8 w-[9.5rem] text-xs"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button
            className="h-8 text-xs"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || query.isLoading}
          >
            {saveMutation.isPending ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading targets…</p>
      ) : (
        <div className="space-y-4 p-3 sm:p-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold text-foreground">Organization · {monthLabel}</p>
            <p className="mt-0.5 mb-2 text-[11px] text-muted-foreground">
              Default targets when viewing all executives. Individual overrides below apply when an executive is
              filtered.
            </p>
            <div className="hidden gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-3">
              <span>Proposals shared</span>
              <span>Won</span>
              <span>Revenue excl. GST</span>
            </div>
            <div className="mt-1.5">
              <TargetInputs values={org} onChange={setOrg} idPrefix="org" />
            </div>
          </div>

          {execRows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[10rem]">Executive</TableHead>
                    <TableHead className="min-w-[5rem] text-right">Shared</TableHead>
                    <TableHead className="min-w-[4rem] text-right">Won</TableHead>
                    <TableHead className="min-w-[6rem] text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {execRows.map((exec) => (
                    <TableRow key={exec.userId}>
                      <TableCell>
                        <p className="text-xs font-medium">{exec.name}</p>
                        <p className="text-[10px] capitalize text-muted-foreground">{exec.role.replace("_", " ")}</p>
                      </TableCell>
                      <TableCell colSpan={3} className="p-2">
                        <TargetInputs
                          values={executives[exec.userId] ?? toFields(exec)}
                          onChange={(next) =>
                            setExecutives((prev) => ({ ...prev, [exec.userId]: next }))
                          }
                          idPrefix={exec.userId}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">No active sales executives to assign targets.</p>
          )}
        </div>
      )}
    </motion.section>
  );
}
