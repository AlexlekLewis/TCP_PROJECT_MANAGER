import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
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
  const { profile, role, signOut, setDemoRole } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const items = nav.filter((n) => !n.role || n.role === role);

  return (
    <div className="flex min-h-screen w-full flex-col">
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

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center justify-around">
          {items.slice(0, 5).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-2 text-[11px]',
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
