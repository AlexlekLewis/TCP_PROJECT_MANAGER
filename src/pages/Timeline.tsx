import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight, GanttChartSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/useProjects';
import { useWorkers } from '@/hooks/useWorkers';
import { useAllTimeEntries } from '@/hooks/useTimeEntries';
import { computeProjectTotals } from '@/lib/aggregations';
import { toISODate, weekDays, weekEnd, weekStart } from '@/lib/dates';
import { formatHours } from '@/lib/hours';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/db';

const WEEKS_VISIBLE = 10;
const ROW_HEIGHT = 56;

export default function TimelinePage() {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const { data: projects = [] } = useProjects();
  const { data: workers = [] } = useWorkers();
  const { data: timeEntries = [] } = useAllTimeEntries();

  const rangeStart = weekStart(anchor);
  const rangeEnd = addDays(rangeStart, WEEKS_VISIBLE * 7 - 1);
  const totalDays = WEEKS_VISIBLE * 7;
  const today = new Date();

  // Show active + complete projects; skip archived from the timeline
  const visibleProjects = useMemo(() => {
    return projects
      .filter((p) => p.status !== 'archived' && p.start_date && p.end_date)
      .filter((p) => {
        const s = parseISO(p.start_date!);
        const e = parseISO(p.end_date!);
        return !isBefore(e, rangeStart) && !isAfter(s, rangeEnd);
      })
      .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));
  }, [projects, rangeStart, rangeEnd]);

  const unscheduled = projects.filter(
    (p) => p.status !== 'archived' && (!p.start_date || !p.end_date),
  );

  // Build month headers spanning the range
  const monthSegments = useMemo(() => {
    const segments: Array<{ label: string; widthPct: number }> = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      const monthStart = startOfMonth(cursor) < rangeStart ? rangeStart : startOfMonth(cursor);
      const monthEndCalendar = addDays(startOfMonth(addDays(cursor, 32)), -1);
      const monthEnd = monthEndCalendar > rangeEnd ? rangeEnd : monthEndCalendar;
      const days = differenceInCalendarDays(monthEnd, monthStart) + 1;
      segments.push({
        label: format(cursor, 'MMM yyyy'),
        widthPct: (days / totalDays) * 100,
      });
      cursor = addDays(monthEnd, 1);
    }
    return segments;
  }, [rangeStart, rangeEnd, totalDays]);

  const todayOffsetPct =
    today >= rangeStart && today <= rangeEnd
      ? (differenceInCalendarDays(today, rangeStart) / totalDays) * 100
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <GanttChartSquare className="h-5 w-5" /> Timeline
        </h1>
        <Badge variant="secondary">
          {format(rangeStart, 'd MMM')} – {format(rangeEnd, 'd MMM yyyy')}
        </Badge>
        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => subWeeks(d, 4))}
            aria-label="Earlier"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => addWeeks(d, 4))}
            aria-label="Later"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {visibleProjects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No scheduled projects in this window.
            {unscheduled.length > 0 && (
              <p className="mt-2 text-xs">
                {unscheduled.length} project{unscheduled.length === 1 ? '' : 's'} without start /
                end dates — set dates in <Link to="/projects" className="underline">Projects</Link>{' '}
                to see them on the timeline.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Header: month labels */}
            <div className="flex border-b bg-muted/40 text-xs">
              <div className="w-44 shrink-0 border-r px-3 py-2 font-medium uppercase tracking-wide text-muted-foreground">
                Project
              </div>
              <div className="relative flex flex-1">
                {monthSegments.map((seg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'truncate border-r px-2 py-2 font-medium uppercase tracking-wide text-muted-foreground last:border-r-0',
                    )}
                    style={{ width: `${seg.widthPct}%` }}
                  >
                    {seg.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Week grid + rows */}
            <div className="relative">
              {/* week separators (background only) */}
              <div
                className="pointer-events-none absolute inset-y-0 left-44 right-0"
                aria-hidden
              >
                {Array.from({ length: WEEKS_VISIBLE - 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full w-px bg-border/60"
                    style={{ left: `${((i + 1) * 7) / totalDays * 100}%` }}
                  />
                ))}
              </div>

              {/* today vertical line */}
              {todayOffsetPct != null && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10"
                  style={{ left: `calc(11rem + ${todayOffsetPct}% * (1 - 11rem / 100%))` }}
                  aria-hidden
                />
              )}

              {/* rows */}
              {visibleProjects.map((p) => (
                <TimelineRow
                  key={p.id}
                  project={p}
                  rangeStart={rangeStart}
                  totalDays={totalDays}
                  hoursUsedPct={
                    computeProjectTotals(p, timeEntries, [], workers).hoursUsedPct ?? 0
                  }
                />
              ))}

              {/* today line — drawn over rows */}
              {todayOffsetPct != null && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-20 w-px bg-destructive/60"
                  style={{ left: `calc(11rem + (100% - 11rem) * ${todayOffsetPct / 100})` }}
                  aria-hidden
                >
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-destructive px-1.5 text-[10px] font-medium uppercase text-destructive-foreground">
                    today
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* This week — who's on what */}
      <ThisWeekSchedule />

      {unscheduled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unscheduled projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <p className="text-xs text-muted-foreground">
              These don't have both a start and end date so they can't be plotted. Click to set
              dates.
            </p>
            <ul className="divide-y rounded-md border">
              {unscheduled.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-accent"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: p.color_tag ?? 'hsl(var(--border))' }}
                    />
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <Badge variant="secondary">{p.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineRow({
  project,
  rangeStart,
  totalDays,
  hoursUsedPct,
}: {
  project: Project;
  rangeStart: Date;
  totalDays: number;
  hoursUsedPct: number;
}) {
  const s = parseISO(project.start_date!);
  const e = parseISO(project.end_date!);
  const startOffset = Math.max(0, differenceInCalendarDays(s, rangeStart));
  const endOffset = Math.min(totalDays - 1, differenceInCalendarDays(e, rangeStart));
  const leftPct = (startOffset / totalDays) * 100;
  const widthPct = ((endOffset - startOffset + 1) / totalDays) * 100;
  const burn = hoursUsedPct > 100 ? 'over' : hoursUsedPct > 80 ? 'near' : 'ok';
  const tagColor = project.color_tag ?? '#8b8b94';

  return (
    <Link
      to={`/projects/${project.id}`}
      className="relative flex items-center border-b hover:bg-accent/30"
      style={{ height: ROW_HEIGHT }}
    >
      <div className="z-10 w-44 shrink-0 border-r bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tagColor }} />
          <p className="truncate text-sm font-medium">{project.name}</p>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {project.client_name ?? '—'}
        </p>
      </div>
      <div className="relative flex-1">
        <div
          className="absolute top-1/2 h-7 -translate-y-1/2 overflow-hidden rounded-md border shadow-sm"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: `${tagColor}33`,
            borderColor: `${tagColor}99`,
          }}
        >
          {/* hours-used fill */}
          <div
            className={cn(
              'h-full',
              burn === 'over' && 'bg-destructive/70',
              burn === 'near' && 'bg-warning/70',
              burn === 'ok' && 'bg-[color:var(--bar)]',
            )}
            style={
              {
                width: `${Math.min(100, hoursUsedPct)}%`,
                ['--bar' as never]: tagColor,
              } as React.CSSProperties
            }
          />
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px] font-medium text-foreground/80">
            <span className="truncate">
              {format(parseISO(project.start_date!), 'd MMM')} –{' '}
              {format(parseISO(project.end_date!), 'd MMM')}
            </span>
            <span className="tabular-nums">{Math.round(hoursUsedPct)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ThisWeekSchedule() {
  const { data: workers = [] } = useWorkers();
  const { data: projects = [] } = useProjects();
  const { data: timeEntries = [] } = useAllTimeEntries();

  const today = new Date();
  const weekStartIso = toISODate(weekStart(today));
  const weekEndIso = toISODate(weekEnd(today));
  const days = weekDays(today);

  const entriesByWorkerByDay = useMemo(() => {
    const map = new Map<string, Map<string, { hours: number; projectIds: Set<string> }>>();
    timeEntries
      .filter((t) => t.entry_date >= weekStartIso && t.entry_date <= weekEndIso)
      .forEach((t) => {
        const inner = map.get(t.worker_id) ?? new Map();
        const cur = inner.get(t.entry_date) ?? { hours: 0, projectIds: new Set<string>() };
        cur.hours += Number(t.hours);
        cur.projectIds.add(t.project_id);
        inner.set(t.entry_date, cur);
        map.set(t.worker_id, inner);
      });
    return map;
  }, [timeEntries, weekStartIso, weekEndIso]);

  const colorByProject = useMemo(
    () => new Map(projects.map((p) => [p.id, p.color_tag ?? '#8b8b94'])),
    [projects],
  );

  const activeWorkers = workers.filter((w) => w.active);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Who's on what — this week</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Worker</th>
                {days.map((d) => (
                  <th key={toISODate(d)} className="px-2 py-2 text-center">
                    {format(d, 'EEE d')}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeWorkers.map((w) => {
                const innerMap = entriesByWorkerByDay.get(w.id);
                const total = days.reduce(
                  (s, d) => s + (innerMap?.get(toISODate(d))?.hours ?? 0),
                  0,
                );
                return (
                  <tr key={w.id}>
                    <td className="px-3 py-2 font-medium">{w.name}</td>
                    {days.map((d) => {
                      const cell = innerMap?.get(toISODate(d));
                      return (
                        <td key={toISODate(d)} className="px-2 py-2 text-center">
                          {cell ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-sm font-semibold tabular-nums">
                                {Number(cell.hours).toFixed(1)}h
                              </span>
                              <div className="flex gap-0.5">
                                {Array.from(cell.projectIds).map((pid) => (
                                  <span
                                    key={pid}
                                    className="h-1.5 w-3 rounded-full"
                                    style={{
                                      background:
                                        colorByProject.get(pid) ?? 'hsl(var(--border))',
                                    }}
                                    title={projects.find((p) => p.id === pid)?.name ?? ''}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatHours(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
