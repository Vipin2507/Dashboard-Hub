import { useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { can } from "@/lib/rbac";
import { InventoryPaymentCenter } from "@/components/InventoryPaymentCenter";
import { PaymentPlanCatalogPanel } from "@/components/PaymentPlanCatalogPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, Layers } from "lucide-react";

export default function PaymentsPage() {
  const me = useAppStore((s) => s.me);
  const [searchParams] = useSearchParams();
  const initialCustomerId = searchParams.get("customerId") ?? undefined;

  if (!can(me.role, "payments", "view")) {
    return (
      <>
        <Topbar title="Payments" subtitle="Customer billing & receipts" />
        <div className="p-6 text-sm text-muted-foreground">You don&apos;t have access to Payments.</div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Payments"
        subtitle="Proposal decisions, plans, collections, history & plan templates"
      />
      <div className="p-6 space-y-4">
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
