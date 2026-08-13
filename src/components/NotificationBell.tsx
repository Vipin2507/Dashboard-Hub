import { useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, FileText, Handshake, IndianRupee, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type UnifiedNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  entityType: "proposal" | "deal" | "payment" | "customer" | "other";
  href?: string;
};

const READS_KEY = (userId: string) => `buildesk:notif-reads:${userId}`;

function loadLocalReads(userId: string): Set<string> {
  if (!userId || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(READS_KEY(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveLocalReads(userId: string, ids: Set<string>) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(READS_KEY(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

function inferEntityType(n: Notification): UnifiedNotification["entityType"] {
  const hay = `${n.type} ${n.subject} ${n.entityId}`.toLowerCase();
  if (hay.includes("proposal")) return "proposal";
  if (hay.includes("deal")) return "deal";
  if (hay.includes("payment") || hay.includes("invoice") || hay.includes("estimate")) return "payment";
  if (hay.includes("customer")) return "customer";
  return "other";
}

function inferHref(n: Notification): string | undefined {
  const id = n.entityId?.trim();
  if (!id) return undefined;
  const kind = inferEntityType(n);
  if (kind === "proposal") return "/proposals";
  if (kind === "deal") return "/deals";
  if (kind === "payment") return "/payments";
  if (kind === "customer") return `/customers/${id}`;
  return undefined;
}

function mapNotification(n: Notification, readIds: Set<string>): UnifiedNotification {
  return {
    id: n.id,
    title: n.subject,
    message: n.to,
    createdAt: n.at,
    isRead: readIds.has(n.id),
    entityType: inferEntityType(n),
    href: inferHref(n),
  };
}

function relativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

const ENTITY_ICON = {
  proposal: FileText,
  deal: Handshake,
  payment: IndianRupee,
  customer: Building2,
  other: Bell,
} as const;

const ENTITY_TONE = {
  proposal: "bg-primary/15 text-primary",
  deal: "bg-success/15 text-success",
  payment: "bg-warning/15 text-warning",
  customer: "bg-info/15 text-info",
  other: "bg-muted text-muted-foreground",
} as const;

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useAppStore((s) => s.me.id);
  const zustandNotifs = useAppStore((s) => s.notifications);

  const { data: apiRows = [] } = useQuery({
    queryKey: QK.notifications(),
    queryFn: () => api.get<Notification[]>("/notifications"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: storedReadIds } = useQuery({
    queryKey: QK.notificationReads(meId),
    queryFn: async () => {
      const local = loadLocalReads(meId);
      try {
        const res = await api.get<{ ids: string[] }>(`/notifications/reads?userId=${encodeURIComponent(meId)}`);
        for (const id of res.ids ?? []) local.add(id);
        saveLocalReads(meId, local);
      } catch {
        /* keep local if API is unavailable */
      }
      return [...local];
    },
    enabled: Boolean(meId),
    placeholderData: () => [...loadLocalReads(meId)],
    staleTime: 15_000,
    retry: 1,
  });

  const readIds = useMemo(() => new Set(storedReadIds ?? loadLocalReads(meId)), [meId, storedReadIds]);

  const allNotifs = useMemo(() => {
    const byId = new Map<string, UnifiedNotification>();
    for (const n of [...apiRows, ...zustandNotifs]) {
      if (!byId.has(n.id)) byId.set(n.id, mapNotification(n, readIds));
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [apiRows, zustandNotifs, readIds]);

  const unread = useMemo(() => allNotifs.filter((n) => !n.isRead).slice(0, 40), [allNotifs]);
  const unreadCount = allNotifs.filter((n) => !n.isRead).length;

  const persistReads = useCallback(
    (ids: string[]) => {
      const merged = new Set(readIds);
      for (const id of ids) merged.add(id);
      saveLocalReads(meId, merged);
      queryClient.setQueryData<string[]>(QK.notificationReads(meId), [...merged]);
    },
    [meId, queryClient, readIds],
  );

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.post("/notifications/read", { userId: meId, ids }),
    onError: () => undefined,
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.post("/notifications/read-all", { userId: meId }),
    onError: () => undefined,
  });

  const markRead = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      persistReads(ids);
      markReadMutation.mutate(ids);
    },
    [markReadMutation, persistReads],
  );

  const markAllRead = useCallback(() => {
    const ids = allNotifs.filter((n) => !n.isRead).map((n) => n.id);
    persistReads(ids);
    markAllMutation.mutate();
  }, [allNotifs, markAllMutation, persistReads]);

  const openItem = (n: UnifiedNotification) => {
    markRead([n.id]);
    if (n.href) navigate(n.href);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0" type="button" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount === 0 ? "All caught up" : `${unreadCount} unread`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={unreadCount === 0 || markAllMutation.isPending}
            onClick={markAllRead}
          >
            <CheckCheck className="mr-1 h-3.5 w-3.5" />
            Mark all
          </Button>
        </div>
        <div className="scrollbar-soft max-h-[min(24rem,70vh)] overflow-y-auto">
          {unread.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No new notifications</p>
          ) : (
            unread.map((n) => {
              const Icon = ENTITY_ICON[n.entityType];
              return (
                <button
                  key={n.id}
                  type="button"
                  className="flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/40"
                  onClick={() => openItem(n)}
                >
                  <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", ENTITY_TONE[n.entityType])}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{n.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{relativeTime(n.createdAt)}</p>
                  </div>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
