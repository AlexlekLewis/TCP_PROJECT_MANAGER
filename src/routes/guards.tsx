import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { Role } from '@/types/db';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <CenteredSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RequireRole({ role }: { role: Role }) {
  const { role: current, loading } = useAuth();
  if (loading) return <CenteredSpinner />;
  if (current !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
