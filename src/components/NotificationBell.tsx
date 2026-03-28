import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, RefreshCw, FileText, Handshake, IndianRupee, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import { useAppStore } from "@/store/useAppStore";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type UnifiedNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  entityType?: "proposal" | "deal" | "payment" | "customer" | "other";
};

function mapApiNotification(n: Notification): UnifiedNotification {
  return {
    id: n.id,
    title: n.subject,
    message: n.subject,
    createdAt: n.at,
    isRead: false,
    entityType: n.type.includes("CUSTOMER") ? "customer" : "other",
  };
}

function mapZustandNotification(n: Notification): UnifiedNotification {
  return {
    id: n.id,
    title: n.subject,
    message: n.subject,
    createdAt: n.at,
    isRead: false,
    entityType: "other",
  };
}

function relativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function NotificationList({
  notifications,
  onRefetch,
  onDismiss,
}: {
  notifications: UnifiedNotification[];
  onRefetch: () => void;
  onDismiss: (id: string) => void;
}) {
  const ENTITY_ICONS = {
    proposal: <FileText className="h-4 w-4 text-blue-500" />,
    deal: <Handshake className="h-4 w-4 text-purple-500" />,
    payment: <IndianRupee className="h-4 w-4 text-emerald-500" />,
    customer: <Building2 className="h-4 w-4 text-sky-500" />,
    other: <Bell className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold">Notifications</span>
        <Button variant="ghost" size="sm" className="text-xs h-7" type="button" onClick={() => onRefetch()}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">All caught up</p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            className="flex gap-3 w-full text-left px-4 py-3 hover:bg-muted/60 border-b border-border/60 last:border-0"
            onClick={() => onDismiss(n.id)}
          >
            <div className="flex-shrink-0 mt-0.5">{ENTITY_ICONS[n.entityType ?? "other"]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{n.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
              <p className="text-xs text-muted-foreground/80 mt-1">{relativeTime(n.createdAt)}</p>
            </div>
            {!n.isRead && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NotificationBell() {
  const zustandNotifs = useAppStore((s) => s.notifications);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const queryClient = useQueryClient();

  const { data: apiRows = [], refetch } = useQuery({
    queryKey: QK.notifications(),
    queryFn: () => api.get<Notification[]>("/notifications"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const apiMapped = useMemo(() => apiRows.map(mapApiNotification), [apiRows]);
  const zMapped = useMemo(() => zustandNotifs.map(mapZustandNotification), [zustandNotifs]);

  const allNotifs = useMemo(() => {
    const byId = new Map<string, UnifiedNotification>();
    for (const n of [...apiMapped, ...zMapped]) {
      if (!byId.has(n.id)) byId.set(n.id, n);
    }
    return Array.from(byId.values())
      .filter((n) => !dismissed.has(n.id))
      .filter((n) => !n.isRead)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [apiMapped, zMapped, dismissed]);

  const unreadCount = allNotifs.length;

  const handleDismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => new Set([...prev, id]));
      void queryClient.invalidateQueries({ queryKey: QK.notifications() });
    },
    [queryClient],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0" type="button" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 bg-destructive text-destructive-foreground rounded-full text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <NotificationList notifications={allNotifs} onRefetch={() => refetch()} onDismiss={handleDismiss} />
      </PopoverContent>
    </Popover>
  );
}
