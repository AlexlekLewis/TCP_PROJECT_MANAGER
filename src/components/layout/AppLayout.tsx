import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Eye,
  FolderKanban,
  GanttChartSquare,
  LayoutDashboard,
  Lock,
  LogOut,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { env } from '@/lib/env';
import type { Role } from '@/types/db';

const nav: Array<{ to: string; label: string; icon: React.ReactNode; role?: Role }> = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/calendar', label: 'Week', icon: <CalendarDays className="h-4 w-4" /> },
  { to: '/timeline', label: 'Timeline', icon: <GanttChartSquare className="h-4 w-4" /> },
  { to: '/projects', label: 'Projects', icon: <FolderKanban className="h-4 w-4" /> },
  { to: '/reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" /> },
  { to: '/workers', label: 'Workers', icon: <Users className="h-4 w-4" />, role: 'admin' },
  { to: '/admin', label: 'Admin', icon: <Lock className="h-4 w-4" />, role: 'admin' },
];

export function AppLayout() {
  const { profile, role, actualRole, isViewingAs, signOut, setDemoRole, setViewAsRole } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const items = nav.filter((n) => !n.role || n.role === role);

  // "View as manager" toggle is offered to real-mode admins. Clicking it
  // also navigates home so the next paint doesn't bounce off a now-
  // forbidden admin-only route guard.
  const enterManagerView = () => {
    if (!setViewAsRole) return;
    setViewAsRole('manager');
    navigate('/');
  };
  const exitManagerView = () => {
    if (!setViewAsRole) return;
    setViewAsRole(null);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      {/* "Viewing as" banner — only shown when admin is previewing as manager. */}
      {isViewingAs && (
        <div
          data-testid="view-as-banner"
          className="sticky top-0 z-50 flex items-center gap-3 border-b border-amber-300/50 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/70 dark:text-amber-100"
        >
          <Eye className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">
            <strong>Viewing as Gavin (manager)</strong> — UI preview only. The DB session is still your admin login; payload data is unchanged.
          </span>
          <Button
            data-testid="exit-view-as"
            variant="outline"
            size="sm"
            className="border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100"
            onClick={exitManagerView}
          >
            Back to admin
          </Button>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-3" aria-label="Tricoat home">
            <Logo size="sm" />
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:inline">
              · PM
            </span>
          </Link>
          <nav className="ml-6 hidden gap-1 md:flex">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {/* Demo-mode toggle: swap which DEMO_PROFILE is "you". */}
            {env.demoMode && setDemoRole && (
              <div
                data-testid="demo-role-toggle"
                className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs"
              >
                <span className="hidden text-muted-foreground sm:inline">demo</span>
                <button
                  data-testid="role-admin"
                  className={cn(
                    'rounded px-1.5 py-0.5',
                    role === 'admin' && 'bg-secondary font-medium',
                  )}
                  onClick={() => setDemoRole('admin')}
                >
                  admin
                </button>
                <button
                  data-testid="role-manager"
                  className={cn(
                    'rounded px-1.5 py-0.5',
                    role === 'manager' && 'bg-secondary font-medium',
                  )}
                  onClick={() => setDemoRole('manager')}
                >
                  manager
                </button>
              </div>
            )}
            {/* Real-mode "View as manager" — only available to actual admins. */}
            {!env.demoMode && actualRole === 'admin' && setViewAsRole && (
              <Button
                data-testid="view-as-toggle"
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={isViewingAs ? exitManagerView : enterManagerView}
                title={isViewingAs ? 'Return to admin view' : "Preview Gavin's manager view"}
              >
                <Eye className="h-3.5 w-3.5" />
                {isViewingAs ? 'Back to admin' : 'View as Gavin'}
              </Button>
            )}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {profile?.display_name}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav — render every authorised item; on tight screens
          (admin's 7 items at ~360 px) the row scrolls horizontally instead
          of silently dropping anything from view. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center justify-around overflow-x-auto px-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 flex-col items-center gap-1 px-2 text-[11px]',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
