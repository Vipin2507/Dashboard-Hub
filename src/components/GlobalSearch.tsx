import { Building2, FileText, Handshake, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getScope, visibleWithScope } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

type SearchHit = {
  id: string;
  kind: "customer" | "proposal" | "deal";
  title: string;
  subtitle: string;
  href: string;
};

export function GlobalSearch({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();

  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const proposals = useAppStore((s) => s.proposals);
  const deals = useAppStore((s) => s.deals);

  const query = q.trim().toLowerCase();

  const hits = useMemo(() => {
    if (query.length < 1) return [] as SearchHit[];

    const custScope = getScope(me.role, "customers");
    const propScope = getScope(me.role, "proposals");
    const dealScope = getScope(me.role, "deals");

    const visibleCustomers = visibleWithScope(custScope, me, customers);
    const visibleProposals = visibleWithScope(propScope, me, proposals);
    const visibleDeals = visibleWithScope(dealScope, me, deals);

    const customerHits: SearchHit[] = visibleCustomers
      .filter((c) => {
        const contactBits = (c.contacts ?? []).flatMap((x) => [x.name, x.email, x.phone]);
        const hay = [
          c.companyName,
          c.customerName,
          c.customerNumber,
          c.gstin,
          c.address?.city,
          ...contactBits,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        kind: "customer" as const,
        title: c.companyName || c.customerName || c.customerNumber,
        subtitle: [c.customerNumber, c.customerName, c.address?.city].filter(Boolean).join(" · "),
        href: `/customers/${c.id}`,
      }));

    const proposalHits: SearchHit[] = visibleProposals
      .filter((p) => {
        const hay = [p.proposalNumber, p.title, p.customerName, p.customerCompanyName, p.assignedToName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        kind: "proposal" as const,
        title: p.proposalNumber,
        subtitle: [p.title, p.customerCompanyName || p.customerName].filter(Boolean).join(" · "),
        href: `/proposals?detailId=${encodeURIComponent(p.id)}`,
      }));

    const dealHits: SearchHit[] = visibleDeals
      .filter((d) => {
        if (d.deletedAt) return false;
        const hay = [d.name, d.invoiceNumber, d.estimateNumber, d.serviceName, d.contactPhone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 4)
      .map((d) => ({
        id: d.id,
        kind: "deal" as const,
        title: d.name || d.invoiceNumber || d.id,
        subtitle: [d.dealStatus, d.serviceName].filter(Boolean).join(" · "),
        href: `/deals?q=${encodeURIComponent(d.name || d.id)}`,
      }));

    return [...customerHits, ...proposalHits, ...dealHits];
  }, [query, me, customers, proposals, deals]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const goCustomersList = () => {
    const text = q.trim();
    if (!text) return;
    setOpen(false);
    // range=all so Customers doesn't keep the default this_month filter and hide matches
    navigate(`/customers?q=${encodeURIComponent(text)}&range=all`);
  };

  const goHit = (hit: SearchHit) => {
    setOpen(false);
    setQ("");
    navigate(hit.href);
  };

  const showPanel = open && query.length > 0;

  return (
    <form
      ref={rootRef}
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (showPanel && hits[active]) {
          goHit(hits[active]);
          return;
        }
        goCustomersList();
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showPanel) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search customers, proposals, deals…"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 dark:bg-muted/40"
          aria-label="Global search"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          autoComplete="off"
        />
      </div>

      {showPanel ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-elevated"
        >
          {hits.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No matches. Press Enter to search customers.
            </div>
          ) : (
            <ul className="max-h-[min(22rem,70vh)] overflow-y-auto py-1">
              {hits.map((hit, idx) => {
                const Icon = hit.kind === "customer" ? Building2 : hit.kind === "proposal" ? FileText : Handshake;
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === active}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/60",
                        idx === active && "bg-muted/60",
                      )}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => goHit(hit)}
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{hit.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {hit.kind} · {hit.subtitle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            onClick={goCustomersList}
          >
            <Search className="h-3.5 w-3.5" />
            Search all customers for “{q.trim()}”
          </button>
        </div>
      ) : null}
    </form>
  );
}
