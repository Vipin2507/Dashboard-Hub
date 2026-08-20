import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { ProposalLineItem } from "@/types";

function formatLineSummary(li: ProposalLineItem) {
  const qty = Number(li.qty) || 0;
  const label = (li.qtyLabel || "qty").trim();
  const name = (li.name || "").trim() || "Untitled item";
  if (qty > 0) return `${name} × ${qty} ${label}`;
  return name;
}

export function ProposalLineItemsPreview({
  lineItems,
  className,
}: {
  lineItems: ProposalLineItem[] | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const items = (lineItems ?? []).filter((li) => (li.name || "").trim());

  if (items.length === 0) {
    return <p className={cn("truncate text-[11px] text-muted-foreground", className)}>No line items</p>;
  }

  const preview = formatLineSummary(items[0]);
  const extra = items.length - 1;

  return (
    <div className={cn("max-w-[240px]", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="group flex w-full min-w-0 items-center gap-1 rounded-md text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 truncate">
          {preview}
          {!open && extra > 0 ? (
            <span className="text-muted-foreground/80"> +{extra} more</span>
          ) : null}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="inline-flex shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="mt-1 space-y-0.5 overflow-hidden border-l border-border/70 pl-2"
          >
            {items.map((li, i) => (
              <motion.li
                key={li.id || `${li.name}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, ease: EASE, delay: i * 0.04 }}
                className="truncate text-[11px] text-muted-foreground"
              >
                {formatLineSummary(li)}
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
