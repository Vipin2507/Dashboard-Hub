import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const RESTORE_TIMEOUT_MS = 12_000;

export function RequireAuth() {
  const authUserId = useAppStore((s) => s.authUserId);
  const users = useAppStore((s) => s.users);
  const me = useAppStore((s) => s.me);
  const logout = useAppStore((s) => s.logout);
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  const sessionUser = authUserId
    ? users.find((u) => u.id === authUserId && u.status === 'active')
    : undefined;
  // Ready once the persisted account exists in the user list and `me` is hydrated
  // (impersonation may set `me` to a different user — that is still a valid session).
  const sessionReady = Boolean(sessionUser && me.id !== '__guest__');

  useEffect(() => {
    if (!authUserId || sessionReady) {
      setTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setTimedOut(true), RESTORE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [authUserId, sessionReady]);

  useEffect(() => {
    if (timedOut && authUserId && !sessionReady) {
      logout();
    }
  }, [timedOut, authUserId, sessionReady, logout]);

  if (!authUserId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }

  return <Outlet />;
}
