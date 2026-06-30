import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardList, DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/hooks/useProjects';
import { useWorkers } from '@/hooks/useWorkers';
import { useAllTimeEntries } from '@/hooks/useTimeEntries';
import { useMaterialEntries } from '@/hooks/useMaterialEntries';
import { computeProjectTotals } from '@/lib/aggregations';
import { formatCurrency } from '@/lib/currency';
import { formatHours } from '@/lib/hours';
import { toISODate, weekEnd, weekStart } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useCanSeeFinancials } from '@/lib/permissions';
import { useAuth } from '@/context/AuthContext';
import ManagerLanding from './ManagerLanding';

export default function DashboardPage() {
  const { role } = useAuth();
  // Managers get a recording-shaped landing; admin gets the monitoring view.
  if (role === 'manager') return <ManagerLanding />;
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { data: projects = [] } = useProjects();
  const { data: workers = [] } = useWorkers();
  const { data: timeEntries = [] } = useAllTimeEntries();
  const { data: materials = [] } = useMaterialEntries();
  const canSeeFinancials = useCanSeeFinancials();

  const active = projects.filter((p) => p.status === 'active');

  const weekStartIso = toISODate(weekStart(new Date()));
  const weekEndIso = toISODate(weekEnd(new Date()));
  const thisWeekEntries = timeEntries.filter(
    (t) => t.entry_date >= weekStartIso && t.entry_date <= weekEndIso,
  );

  const totals = useMemo(() => {
    const hours = thisWeekEntries.reduce((s, e) => s + Number(e.hours), 0);
    const rateById = new Map(workers.map((w) => [w.id, w.cost_rate]));
    const labourCost = thisWeekEntries.reduce(
      (s, e) => s + Number(e.hours) * Number(rateById.get(e.worker_id) ?? 0),
      0,
    );
    const materialCost = materials
      .filter((m) => m.entry_date >= weekStartIso && m.entry_date <= weekEndIso)
      .reduce((s, m) => s + Number(m.cost), 0);
    return { hours, labourCost, materialCost };
  }, [thisWeekEntries, workers, materials, weekStartIso, weekEndIso]);

  return (
    <div className="space-y-6">
      {/* Primary daily CTA — opens the Day Entry dialog on today's calendar */}
      <Card className="platinum-surface border-[hsl(var(--brand-accent))]/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-[hsl(var(--brand-accent-soft))] p-2 text-[hsl(var(--brand-accent))]">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Log today's work</p>
              <p className="text-xs text-muted-foreground">
                Add hours per worker and any materials bought today
              </p>
            </div>
          </div>
          <Button
            asChild
            className="bg-[hsl(var(--brand-accent))] text-white hover:brightness-110"
          >
            <Link to="/calendar?log=today">
              Open day entry <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Top stats */}
      <section
        className={cn(
          'grid gap-3',
          canSeeFinancials ? 'sm:grid-cols-3' : 'sm:grid-cols-1',
        )}
      >
        <StatCard
          label="Hours this week"
          value={formatHours(totals.hours)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="hours"
        />
        {canSeeFinancials && (
          <>
            <StatCard
              label="Labour cost this week"
              value={formatCurrency(totals.labourCost, { whole: true })}
              icon={<DollarSign className="h-4 w-4" />}
              tone="labour"
              muted={totals.labourCost === 0}
              hint={totals.labourCost === 0 ? 'Set hourly rates in Workers to see $' : undefined}
            />
            <StatCard
              label="Materials this week"
              value={formatCurrency(totals.materialCost, { whole: true })}
              icon={<DollarSign className="h-4 w-4" />}
              tone="materials"
            />
          </>
        )}
      </section>

      {/* Active projects */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Active projects</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/projects">
              All projects <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {active.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No active projects yet.{' '}
              <Link to="/projects/new" className="font-medium text-primary underline">
                Create one
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((p) => {
              const totals = computeProjectTotals(p, timeEntries, materials, workers);
              const hoursVariant: 'default' | 'warning' | 'danger' =
                (totals.hoursUsedPct ?? 0) > 100
                  ? 'danger'
                  : (totals.hoursUsedPct ?? 0) > 80
                    ? 'warning'
                    : 'default';
              const matsVariant: 'default' | 'warning' | 'danger' =
                (totals.materialsUsedPct ?? 0) > 100
                  ? 'danger'
                  : (totals.materialsUsedPct ?? 0) > 80
                    ? 'warning'
                    : 'default';
              const overBudget =
                (totals.hoursUsedPct ?? 0) > 80 ||
                (canSeeFinancials && (totals.materialsUsedPct ?? 0) > 80);
              return (
                <Card
                  key={p.id}
                  className="overflow-hidden border-l-4 transition-shadow hover:shadow-md"
                  style={{ borderLeftColor: p.color_tag ?? 'hsl(var(--border))' }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{p.name}</CardTitle>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {p.client_name ?? '—'}
                          {p.address && ` · ${p.address}`}
                        </p>
                      </div>
                      {overBudget && (
                        <Badge variant="warning" className="shrink-0">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Burn
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {p.quoted_hours != null && (
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between text-xs">
                          {/* Manager sees hours logged only — quoted_hours +
                              the % vs target are Alex's internal numbers. */}
                          <span className="text-muted-foreground">
                            Hours {formatHours(totals.labourHours)}
                            {canSeeFinancials && ` / ${formatHours(p.quoted_hours)}`}
                          </span>
                          {canSeeFinancials && (
                            <span
                              className={cn(
                                'font-medium tabular-nums',
                                hoursVariant === 'danger' && 'text-destructive',
                                hoursVariant === 'warning' && 'text-warning',
                              )}
                            >
                              {totals.hoursUsedPct?.toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {canSeeFinancials && (
                          <Progress value={totals.hoursUsedPct ?? 0} variant={hoursVariant} />
                        )}
                      </div>
                    )}
                    {canSeeFinancials && p.materials_budget != null && (
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-muted-foreground">
                            Materials {formatCurrency(totals.materialCost, { whole: true })} /{' '}
                            {formatCurrency(p.materials_budget, { whole: true })}
                          </span>
                          <span
                            className={cn(
                              'font-medium tabular-nums',
                              matsVariant === 'danger' && 'text-destructive',
                              matsVariant === 'warning' && 'text-warning',
                            )}
                          >
                            {totals.materialsUsedPct?.toFixed(0)}%
                          </span>
                        </div>
                        <Progress value={totals.materialsUsedPct ?? 0} variant={matsVariant} />
                      </div>
                    )}
                    {canSeeFinancials && (
                      <div className="flex items-center justify-between border-t pt-3 text-xs">
                        <span className="text-muted-foreground">Labour cost</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(totals.labourCost, { whole: true })}
                        </span>
                      </div>
                    )}
                    <Button variant="secondary" size="sm" className="w-full" asChild>
                      <Link to={`/projects/${p.id}`}>
                        Open project <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

type StatTone = 'default' | 'hours' | 'labour' | 'materials';

function StatCard({
  label,
  value,
  icon,
  muted,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  muted?: boolean;
  hint?: string;
  tone?: StatTone;
}) {
  const toneMap: Record<Exclude<StatTone, 'default'>, { bg: string; fg: string }> = {
    hours: { bg: 'bg-[hsl(var(--stat-hours-soft))]', fg: 'text-[hsl(var(--stat-hours))]' },
    labour: { bg: 'bg-[hsl(var(--stat-labour-soft))]', fg: 'text-[hsl(var(--stat-labour))]' },
    materials: {
      bg: 'bg-[hsl(var(--stat-materials-soft))]',
      fg: 'text-[hsl(var(--stat-materials))]',
    },
  };
  const iconClasses =
    tone === 'default'
      ? 'bg-secondary text-secondary-foreground'
      : `${toneMap[tone].bg} ${toneMap[tone].fg}`;
  return (
    <Card className={cn(muted && 'opacity-70')}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className={cn('rounded-md p-2', iconClasses)}>{icon}</div>}
      </CardContent>
    </Card>
  );
}
