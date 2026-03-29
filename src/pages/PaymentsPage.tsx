import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { can, formatINR } from "@/lib/rbac";
import { apiUrl } from "@/lib/api";
import { InventoryPaymentCenter } from "@/components/InventoryPaymentCenter";
import { PaymentPlanCatalogPanel } from "@/components/PaymentPlanCatalogPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, Layers } from "lucide-react";

type RemainingApiRow = {
  category: string;
  totalRemaining: number;
};

type HistoryRow = { amountPaid: number; paymentStatus: string };

export default function PaymentsPage() {
  const me = useAppStore((s) => s.me);
  const [searchParams] = useSearchParams();
  const initialCustomerId = searchParams.get("customerId") ?? undefined;

  const remainingQ = useQuery({
    queryKey: ["payments-remaining"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/payments/remaining"));
      if (!res.ok) throw new Error("Failed to load remaining");
      return res.json() as Promise<RemainingApiRow[]>;
    },
    enabled: can(me.role, "payments", "view"),
  });

  const historyConfirmedQ = useQuery({
    queryKey: ["payments-history", "confirmed-all"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/payments/history?status=confirmed"));
      if (!res.ok) throw new Error("Failed to load history");
      return res.json() as Promise<HistoryRow[]>;
    },
    enabled: can(me.role, "payments", "view"),
  });

  const portfolioSummary = useMemo(() => {
    const rows = remainingQ.data ?? [];
    const totalPlans = rows.length;
    const remaining = rows.reduce((s, r) => s + Number(r.totalRemaining ?? 0), 0);
    const overdue = rows.filter((r) => r.category === "overdue").length;
    const collected =
      historyConfirmedQ.data?.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0) ?? 0;
    return { totalPlans, remaining, overdue, collected };
  }, [remainingQ.data, historyConfirmedQ.data]);

  if (!can(me.role, "payments", "view")) {
    return (
      <>
        <Topbar title="Payments" subtitle="Customer billing & receipts" />
        <div className="text-sm text-muted-foreground">You don&apos;t have access to Payments.</div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Payments"
        subtitle="Proposal decisions, plans, collections, history & plan templates"
      />
      <div className="space-y-4">
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border border-border shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total plans</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{portfolioSummary.totalPlans}</p>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Collected</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(portfolioSummary.collected)}</p>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Remaining</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(portfolioSummary.remaining)}</p>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Overdue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">{portfolioSummary.overdue}</p>
            </CardContent>
          </Card>
        </div>
        <Tabs defaultValue="operations" className="w-full">
          <TabsList className="h-9 flex-wrap">
            <TabsTrigger value="operations" className="text-xs gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              Customer payments
            </TabsTrigger>
            <TabsTrigger value="catalog" className="text-xs gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Plan templates (CRUD)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="operations" className="mt-4">
            <InventoryPaymentCenter initialCustomerId={initialCustomerId} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-4">
            <PaymentPlanCatalogPanel />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
