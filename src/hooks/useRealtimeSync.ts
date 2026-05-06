import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";

type SyncState = {
  connected: boolean;
  lastUpdatedAt: string | null;
};

function wsUrl(): string {
  const { protocol, host } = window.location;
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}/ws`;
}

export function useRealtimeSync(): SyncState {
  const qc = useQueryClient();
  const [connected, setConnected] = React.useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let retryTimer: number | null = null;

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        ws = null;
      }
      if (!ws) return;

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(30_000, 1_000 * Math.pow(2, retry++));
        retryTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        // Close triggers reconnect via onclose.
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
      ws.onmessage = (ev) => {
        let msg: any = null;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          msg = null;
        }
        if (!msg) return;
        if (msg.at) setLastUpdatedAt(String(msg.at));
        if (msg.type !== "change") return;

        const entity = String(msg.entity ?? "");

        // Keep it broad: invalidate lists so all pages refresh.
        if (entity === "customers") qc.invalidateQueries({ queryKey: ["customers"] });
        if (entity === "proposals") qc.invalidateQueries({ queryKey: ["proposals"] });
        if (entity === "deals") qc.invalidateQueries({ queryKey: ["deals"] });
        if (entity === "payments") qc.invalidateQueries({ queryKey: ["payments"] });
        if (entity === "inventory") qc.invalidateQueries({ queryKey: ["inventory"] });
        if (entity === "notifications") qc.invalidateQueries({ queryKey: QK.notifications() });
        if (entity === "subscriptions") qc.invalidateQueries({ queryKey: QK.subscriptionTracker() });
        if (entity === "delivery") qc.invalidateQueries({ queryKey: ["deals"] });
        if (entity === "users") qc.invalidateQueries({ queryKey: QK.users() });
        if (entity === "teams") qc.invalidateQueries({ queryKey: QK.teams() });
        if (entity === "regions") qc.invalidateQueries({ queryKey: QK.regions() });

        // Dashboard aggregates depend on everything.
        qc.invalidateQueries({ queryKey: QK.dashboard() });
      };
    };

    connect();
    return () => {
      stopped = true;
      setConnected(false);
      if (retryTimer) window.clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [qc]);

  return { connected, lastUpdatedAt };
}

