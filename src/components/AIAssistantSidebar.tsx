import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Bot, CalendarClock, Handshake, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/StatusPill";
import { useAppStore } from "@/store/useAppStore";
import { formatINR } from "@/lib/rbac";
import type { Customer, Deal } from "@/types";

type AIAssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  alertCount: number;
  dueFollowUps: Deal[];
  overdueDeals: Deal[];
  recentCustomers: Customer[];
};

const AIAssistantContext = createContext<AIAssistantContextValue | null>(null);

function useAIAssistant() {
  return useContext(AIAssistantContext);
}

export function AIAssistantProvider({ children }: { children: ReactNode }) {
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const deals = useAppStore((s) => s.deals);
  const [open, setOpen] = useState(false);

  const dueFollowUps = useMemo(
    () =>
      deals
        .filter((d) => d.ownerUserId === me.id && d.nextFollowUpDate && !d.deletedAt)
        .filter((d) => new Date(String(d.nextFollowUpDate)) <= new Date())
        .slice(0, 6),
    [deals, me.id],
  );

  const overdueDeals = useMemo(
    () =>
      deals
        .filter(
          (d) =>
            d.ownerUserId === me.id &&
            !d.deletedAt &&
            d.dealStatus === "Active" &&
            (d.balanceAmount ?? 0) > 0,
        )
        .slice(0, 6),
    [deals, me.id],
  );

  const recentCustomers = useMemo(() => customers.slice(0, 4), [customers]);
  const alertCount = dueFollowUps.length + overdueDeals.length;

  const value = useMemo(
    () => ({ open, setOpen, alertCount, dueFollowUps, overdueDeals, recentCustomers }),
    [open, alertCount, dueFollowUps, overdueDeals, recentCustomers],
  );

  return (
    <AIAssistantContext.Provider value={value}>
      {children}
      <AIAssistantPanel />
    </AIAssistantContext.Provider>
  );
}

export function AIAssistantToggle() {
  const ctx = useAIAssistant();
  if (!ctx) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="relative h-9 w-9 p-0 text-muted-foreground"
      aria-label="Open AI assistant"
      title="AI Assistant"
      onClick={() => ctx.setOpen(true)}
    >
      <Bot className="h-4 w-4" />
      {ctx.alertCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground">
          {ctx.alertCount > 9 ? "9+" : ctx.alertCount}
        </span>
      )}
    </Button>
  );
}

function AIAssistantPanel() {
  const navigate = useNavigate();
  const ctx = useAIAssistant();
  if (!ctx) return null;
  const { open, setOpen, dueFollowUps, overdueDeals, recentCustomers } = ctx;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col bg-background p-0 sm:w-[22rem] sm:max-w-[22rem] md:w-[22rem] md:max-w-[22rem] lg:w-[22rem] lg:max-w-[22rem]"
      >
        <SheetHeader className="space-y-0 border-b border-border px-4 py-3 text-left">
          <div className="flex items-center gap-2.5 pr-8">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-sm font-semibold">AI Assistant</SheetTitle>
              <SheetDescription className="text-[11px]">Follow-ups, balances, and recent accounts</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="scrollbar-soft min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="card-kpi min-h-[3.25rem]">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/15">
                <CalendarClock className="h-3.5 w-3.5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Follow-ups</p>
                <p className="text-base font-semibold tabular-nums leading-tight">{dueFollowUps.length}</p>
              </div>
            </div>
            <div className="card-kpi min-h-[3.25rem]">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/15">
                <IndianRupee className="h-3.5 w-3.5 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Balances</p>
                <p className="text-base font-semibold tabular-nums leading-tight">{overdueDeals.length}</p>
              </div>
            </div>
          </div>

          <section className="card-soft overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Due follow-ups</p>
              <StatusPill tone={dueFollowUps.length ? "warning" : "muted"}>
                {dueFollowUps.length ? `${dueFollowUps.length} due` : "None"}
              </StatusPill>
            </div>
            {dueFollowUps.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No follow-ups due.</p>
            ) : (
              <ul className="divide-y divide-border">
                {dueFollowUps.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      onClick={() => go("/deals")}
                    >
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.nextFollowUpDate ? new Date(String(d.nextFollowUpDate)).toLocaleDateString("en-IN") : "—"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card-soft overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Open balances</p>
              <StatusPill tone={overdueDeals.length ? "danger" : "success"}>
                {overdueDeals.length ? "Pending" : "Clear"}
              </StatusPill>
            </div>
            {overdueDeals.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No pending balances.</p>
            ) : (
              <ul className="divide-y divide-border">
                {overdueDeals.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      onClick={() => go("/deals")}
                    >
                      <p className="min-w-0 truncate text-sm font-medium">{d.name}</p>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {formatINR(Number(d.balanceAmount ?? 0))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card-soft overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Recent customers</p>
            </div>
            {recentCustomers.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No customers yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentCustomers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      onClick={() => go(`/customers/${c.id}`)}
                    >
                      <Handshake className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="truncate text-sm">{c.companyName || c.customerName}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
