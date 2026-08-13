import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Topbar } from "@/components/Topbar";
import { FilterPanel } from "@/components/FilterPanel";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { hoverLift, pageEnter, staggerContainer, staggerItem, tapPress } from "@/lib/motion";
import { useSmUp } from "@/hooks/useSmUp";
import type { MasterItem } from "@/types";
import {
  CreditCard,
  FileStack,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";

type SectionKey = "products" | "subscriptions" | "formats";

function useMaster(endpoint: string) {
  const queryClient = useQueryClient();

  const query = useQuery<MasterItem[]>({
    queryKey: ["masters", endpoint],
    queryFn: async () => {
      const res = await fetch(apiUrl(endpoint));
      if (!res.ok) throw new Error("Failed to load master data");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masters", endpoint] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`${endpoint}/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masters", endpoint] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(apiUrl(`${endpoint}/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to update item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masters", endpoint] });
    },
  });

  return { query, addMutation, deleteMutation, updateMutation };
}

function MasterKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={staggerItem}
      whileHover={hoverLift}
      whileTap={tapPress}
      className={cn(
        "card-kpi min-h-[3.25rem] w-full text-left hover:border-primary/30 sm:min-h-0",
        active && "border-primary/40 bg-primary/5",
      )}
    >
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight sm:text-lg">
          <CountUp value={Number(value)} />
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </motion.button>
  );
}

export default function MastersPage() {
  const smUp = useSmUp();
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<SectionKey | "all">("all");

  const productMaster = useMaster("/api/masters/product-categories");
  const subscriptionMaster = useMaster("/api/masters/subscription-types");
  const formatMaster = useMaster("/api/masters/proposal-formats");

  const productCount = productMaster.query.data?.length ?? 0;
  const subscriptionCount = subscriptionMaster.query.data?.length ?? 0;
  const formatCount = formatMaster.query.data?.length ?? 0;
  const totalCount = productCount + subscriptionCount + formatCount;

  const sections: {
    key: SectionKey;
    title: string;
    description: string;
    placeholder: string;
    master: ReturnType<typeof useMaster>;
  }[] = [
    {
      key: "products",
      title: "Product Categories",
      description: "Used to classify proposals and deals.",
      placeholder: "e.g. CRM Suite",
      master: productMaster,
    },
    {
      key: "subscriptions",
      title: "Subscription Types",
      description: "Available billing/subscription models.",
      placeholder: "e.g. Annual",
      master: subscriptionMaster,
    },
    {
      key: "formats",
      title: "Proposal Formats",
      description: "Document formats/layouts for proposals.",
      placeholder: "e.g. Enterprise",
      master: formatMaster,
    },
  ];

  const visibleSections = sectionFilter === "all" ? sections : sections.filter((s) => s.key === sectionFilter);
  const hasActiveFilters = search.trim() !== "" || sectionFilter !== "all";

  return (
    <>
      <Topbar title="Masters" subtitle={smUp ? `${totalCount} items across catalogs` : undefined} />
      <motion.div {...pageEnter} className="space-y-3">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2"
        >
          <MasterKpiCard
            label="Categories"
            value={String(productCount)}
            sub="Product types"
            icon={Layers}
            iconColor="text-primary"
            iconBg="bg-primary/15"
            active={sectionFilter === "products"}
            onClick={() => setSectionFilter((s) => (s === "products" ? "all" : "products"))}
          />
          <MasterKpiCard
            label="Subscriptions"
            value={String(subscriptionCount)}
            sub="Billing models"
            icon={CreditCard}
            iconColor="text-info"
            iconBg="bg-info/15"
            active={sectionFilter === "subscriptions"}
            onClick={() => setSectionFilter((s) => (s === "subscriptions" ? "all" : "subscriptions"))}
          />
          <MasterKpiCard
            label="Formats"
            value={String(formatCount)}
            sub="Proposal layouts"
            icon={FileStack}
            iconColor="text-success"
            iconBg="bg-success/15"
            active={sectionFilter === "formats"}
            onClick={() => setSectionFilter((s) => (s === "formats" ? "all" : "formats"))}
          />
        </motion.div>

        <FilterPanel
          title="Filters"
          storageKey="ui:masters:filtersOpen"
          defaultOpen={smUp}
          headerActions={
            hasActiveFilters ? (
              <div className="scrollbar-none flex min-w-0 flex-wrap items-center justify-end gap-1 overflow-x-auto">
                {search.trim() ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    “{search.trim()}”
                  </span>
                ) : null}
                {sectionFilter !== "all" ? (
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {sections.find((s) => s.key === sectionFilter)?.title}
                  </span>
                ) : null}
              </div>
            ) : null
          }
        >
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8 text-sm"
                  placeholder="Search catalog items…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1">
                {(
                  [
                    { value: "all" as const, label: "All" },
                    { value: "products" as const, label: "Categories" },
                    { value: "subscriptions" as const, label: "Subscriptions" },
                    { value: "formats" as const, label: "Formats" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSectionFilter(s.value)}
                    className={cn(
                      "h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors",
                      sectionFilter === s.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 px-2.5 text-xs sm:flex-none"
                onClick={() => {
                  setSearch("");
                  setSectionFilter("all");
                }}
                disabled={!hasActiveFilters}
              >
                Clear
              </Button>
            </div>
          </div>
        </FilterPanel>

        {visibleSections.map((section) => (
          <MasterSection
            key={section.key}
            title={section.title}
            description={section.description}
            placeholder={section.placeholder}
            master={section.master}
            search={search}
            smUp={smUp}
          />
        ))}
      </motion.div>
    </>
  );
}

function MasterSection({
  title,
  description,
  placeholder,
  master,
  search,
  smUp,
}: {
  title: string;
  description: string;
  placeholder: string;
  master: ReturnType<typeof useMaster>;
  search: string;
  smUp: boolean;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const { query, addMutation, deleteMutation, updateMutation } = master;

  const items = query.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const handleAdd = () => {
    if (!name.trim()) return;
    addMutation.mutate(name.trim(), {
      onSuccess: () => {
        toast({ title: `${title} updated`, description: `"${name.trim()}" has been added.` });
        setName("");
      },
      onError: () => {
        toast({ title: "Error", description: `Unable to add ${title.toLowerCase()}.`, variant: "destructive" });
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: `${title} updated`, description: "Item has been removed." });
        if (editingId === id) {
          setEditingId(null);
          setEditingName("");
        }
      },
      onError: () => {
        toast({ title: "Error", description: "Unable to delete item.", variant: "destructive" });
      },
    });
  };

  const handleEdit = (item: MasterItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) return;
    updateMutation.mutate(
      { id: editingId, name: editingName.trim() },
      {
        onSuccess: () => {
          toast({ title: `${title} updated`, description: "Item has been updated." });
          setEditingId(null);
          setEditingName("");
        },
        onError: () => {
          toast({ title: "Error", description: "Unable to update item.", variant: "destructive" });
        },
      },
    );
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const renderActions = (item: MasterItem) =>
    editingId === item.id ? (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={handleSaveEdit}
          disabled={updateMutation.isPending}
        >
          Save
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleCancelEdit}>
          Cancel
        </Button>
      </>
    ) : (
      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => handleEdit(item)}>
        {smUp ? (
          "Edit"
        ) : (
          <>
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </>
        )}
      </Button>
    );

  return (
    <motion.section variants={staggerItem} initial="initial" animate="animate" className="card-soft overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        </div>
        <div className="flex w-full items-end gap-1.5 sm:w-auto sm:max-w-sm">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Add new</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <Button
            className="h-8 shrink-0 px-2.5 text-xs"
            size="sm"
            onClick={handleAdd}
            disabled={addMutation.isPending}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "No items configured yet." : "No items match your search."}
        </p>
      ) : !smUp ? (
        <div className="divide-y divide-border">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-start gap-2 px-2.5 py-2.5">
              <div className="min-w-0 flex-1">
                {editingId === item.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    autoFocus
                  />
                ) : (
                  <p className="truncate text-sm font-medium">{item.name}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {renderActions(item)}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="scrollbar-soft overflow-x-auto">
          <Table responsiveShell={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wide">Name</TableHead>
                <TableHead className="w-[180px] text-right text-[10px] uppercase tracking-wide">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    {editingId === item.id ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-8 max-w-sm text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        autoFocus
                      />
                    ) : (
                      item.name
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {renderActions(item)}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </motion.section>
  );
}
