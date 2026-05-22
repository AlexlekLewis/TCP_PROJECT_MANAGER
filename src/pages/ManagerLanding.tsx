// Manager (on-site supervisor) landing.
//
// Ergonomics-first: phone-in-hand, end-of-day, possibly with paint on the
// thumb. Stack from top to bottom:
//   1. Hero "Log today's work" CTA
//   2. Today panel — entries already logged for today, grouped by worker
//   3. Quick log chips — top worker+project combos from the last 7 days
//   4. This week — one-line summary, links to the calendar
//   5. Active projects strip — compact, hours-only (no $)

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/hooks/useProjects';
import { useWorkers } from '@/hooks/useWorkers';
import { useAllTimeEntries } from '@/hooks/useTimeEntries';
import { toISODate, weekEnd, weekStart } from '@/lib/dates';
import { formatHours } from '@/lib/hours';

export default function ManagerLanding() {
  const { data: projects = [] } = useProjects();
  const { data: workers = [] } = useWorkers();
  const { data: timeEntries = [] } = useAllTimeEntries();

  const todayIso = toISODate(new Date());
  const weekStartIso = toISODate(weekStart(new Date()));
  const weekEndIso = toISODate(weekEnd(new Date()));

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const todayEntries = timeEntries.filter((t) => t.entry_date === todayIso);
  const thisWeekEntries = timeEntries.filter(
    (t) => t.entry_date >= weekStartIso && t.entry_date <= weekEndIso,
  );
  const lastSevenDays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffIso = toISODate(cutoff);
    return timeEntries.filter((t) => t.entry_date >= cutoffIso);
  }, [timeEntries]);

  const weekHours = thisWeekEntries.reduce((s, e) => s + Number(e.hours), 0);
  const distinctWorkers = new Set(thisWeekEntries.map((t) => t.worker_id)).size;
  const distinctProjects = new Set(thisWeekEntries.map((t) => t.project_id)).size;

  // Top 5 worker × project combos from the last 7 days
  const topCombos = useMemo(() => {
    const freq = new Map<string, { workerId: string; projectId: string; count: number }>();
    for (const t of lastSevenDays) {
      const key = `${t.worker_id}|${t.project_id}`;
      const cur = freq.get(key) ?? { workerId: t.worker_id, projectId: t.project_id, count: 0 };
      cur.count += 1;
      freq.set(key, cur);
    }
    return [...freq.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c) => ({
        worker: workerById.get(c.workerId),
        project: projectById.get(c.projectId),
        count: c.count,
      }))
      .filter((c) => c.worker && c.project && c.worker.active);
  }, [lastSevenDays, workerById, projectById]);

  const active = projects.filter((p) => p.status === 'active');

  return (
    <div className="space-y-5">
      {/* Hero CTA */}
      <Card className="platinum-surface border-[hsl(var(--brand-accent))]/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-[hsl(var(--brand-accent-soft))] p-2 text-[hsl(var(--brand-accent))]">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Log today's work</p>
              <p className="text-xs text-muted-foreground">
                Hours per worker and any materials bought today
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

      {/* Today panel */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today — {format(parseISO(todayIso), 'EEE d MMM')}
        </h2>
        {todayEntries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No entries yet. Tap{' '}
              <Link to="/calendar?log=today" className="font-medium text-primary underline">
                Open day entry
              </Link>{' '}
              above to start.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {todayEntries.map((e) => {
                const w = workerById.get(e.worker_id);
                const p = projectById.get(e.project_id);
                return (
                  <Link
                    key={e.id}
                    to="/calendar?log=today"
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/40"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p?.color_tag ?? 'hsl(var(--border))' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{w?.name ?? '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p?.name ?? '—'}
                        {e.notes && ` · ${e.notes}`}
                      </p>
                    </div>
                    <span className="tabular-nums font-semibold">
                      {Number(e.hours).toFixed(1)}h
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Quick log chips */}
      {topCombos.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Quick log — your common combos
          </h2>
          <div className="flex flex-wrap gap-2">
            {topCombos.map((c) => (
              <Link
                key={`${c.worker!.id}|${c.project!.id}`}
                to={`/calendar?log=today&worker=${c.worker!.id}&project=${c.project!.id}`}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-sm hover:border-[hsl(var(--brand-accent))] hover:bg-accent/40"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: c.project!.color_tag ?? 'hsl(var(--border))' }}
                />
                {c.worker!.name} · {c.project!.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* This week */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          This week
        </h2>
        <Link to="/calendar" className="block">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between p-4 text-sm">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums">{formatHours(weekHours)}</span>
                <span className="text-muted-foreground">
                  · {distinctWorkers} worker{distinctWorkers === 1 ? '' : 's'} · {distinctProjects}{' '}
                  project{distinctProjects === 1 ? '' : 's'}
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </section>

      {/* Active projects strip */}
      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Active projects
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {active.map((p) => {
              const projectHours = timeEntries
                .filter((t) => t.project_id === p.id)
                .reduce((s, t) => s + Number(t.hours), 0);
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="block rounded-md border-l-4 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
                  style={{ borderLeftColor: p.color_tag ?? 'hsl(var(--border))' }}
                >
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatHours(projectHours)}
                    {p.quoted_hours ? ` / ${formatHours(p.quoted_hours)}` : ''}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
