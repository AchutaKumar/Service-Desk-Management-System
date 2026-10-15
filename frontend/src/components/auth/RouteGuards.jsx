import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../ui/States';
import { ShieldAlert } from 'lucide-react';

/** Blocks unauthenticated access; redirects to /login preserving destination. */
export function ProtectedRoute() {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Spinner className="size-8" />
          <p className="text-sm">Restoring session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

/** Restricts a subtree to specific roles (e.g. admin-only pages). */
export function RoleRoute({ roles }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <span className="rounded-full bg-red-50 p-3 text-red-500 ring-1 ring-red-100">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Access restricted</h1>
        <p className="max-w-sm text-sm text-slate-500">
          Your account does not have permission to view this page. Contact an administrator if
          you believe this is a mistake.
        </p>
      </div>
    );
  }
  return <Outlet />;
}

/** Keeps authenticated users out of auth pages (login/register/…). */
export function GuestRoute() {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}
