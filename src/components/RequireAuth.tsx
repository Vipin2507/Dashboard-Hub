import { useAppStore } from '@/store/useAppStore';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function RequireAuth() {
  const authUserId = useAppStore((s) => s.authUserId);
  const location = useLocation();

  if (!authUserId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
