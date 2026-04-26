import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { formatINR } from '@/lib/rbac';
import { Bot, Bell, CalendarClock, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AIAssistantSidebar() {
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const deals = useAppStore((s) => s.deals);
  const [open, setOpen] = useState(false);

  const insights = useMemo(() => {
    const dueFollowUps = deals
      .filter((d) => d.ownerUserId === me.id && d.nextFollowUpDate)
      .filter((d) => new Date(String(d.nextFollowUpDate)) <= new Date())
      .slice(0, 5)
      .map((d) => `Follow-up due: ${d.name}`);

    const overdueDeals = deals
      .filter((d) => d.ownerUserId === me.id && d.dealStatus === 'Active' && (d.balanceAmount ?? 0) > 0)
      .slice(0, 5)
      .map((d) => `Balance pending on ${d.name}: ${formatINR(Number(d.balanceAmount ?? 0))}`);

    const recentCustomers = customers.slice(0, 3).map((c) => `Recent: ${c.companyName}`);

    return [...dueFollowUps, ...overdueDeals, ...recentCustomers].slice(0, 8);
  }, [customers, deals, me.id]);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full shadow-lg',
          'bg-[#4B2E83] hover:bg-[#3d256a] text-white',
        )}
        title="AI Assistant"
      >
        <Bot className="h-5 w-5" />
      </Button>

      <aside
        aria-hidden={!open}
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-[22rem] max-w-[90vw] border-l bg-white dark:bg-gray-900',
          'border-gray-200 dark:border-gray-800 shadow-xl',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4B2E83]/10 text-[#4B2E83]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Assistant</p>
              <p className="text-[11px] text-muted-foreground">Memory-driven guidance</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setOpen(false)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-3.5rem)]">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Today</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 border border-emerald-200 dark:border-emerald-900">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <CalendarClock className="h-4 w-4" />
                  <p className="text-xs font-semibold">Success</p>
                </div>
                <p className="mt-1 text-[11px] text-emerald-700/90 dark:text-emerald-300/90">
                  Keep delivery moving.
                </p>
              </div>
              <div className="rounded-lg bg-[#4B2E83]/10 p-3 border border-[#4B2E83]/20 dark:border-[#4B2E83]/30">
                <div className="flex items-center gap-2 text-[#4B2E83]">
                  <Bell className="h-4 w-4" />
                  <p className="text-xs font-semibold">Reminders</p>
                </div>
                <p className="mt-1 text-[11px] text-[#4B2E83]/90">
                  Check overdue items.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Insights</p>
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">No insights yet.</p>
            ) : (
              <ul className="space-y-2">
                {insights.map((t, idx) => (
                  <li key={idx} className="text-sm text-gray-800 dark:text-gray-200">
                    - {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

