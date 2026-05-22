import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addWeeks, format, parseISO, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toISODate, weekDays, weekEnd, weekLabel, weekStart } from '@/lib/dates';
import { formatHours } from '@/lib/hours';
import { useTimeEntriesForWeek } from '@/hooks/useTimeEntries';
import { useWorkers } from '@/hooks/useWorkers';
import { useProjects } from '@/hooks/useProjects';
import { useMaterialEntries } from '@/hooks/useMaterialEntries';
import { useWeekLocks } from '@/hooks/useWeekLocks';
import { DayEntryDialog } from '@/components/features/DayEntryDialog';
import { cn } from '@/lib/utils';
import { useCanSeeFinancials } from '@/lib/permissions';

export default function WeekCalendarPage() {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  // Optional seed values for the day-entry form (used by Quick Log chips
  // on the manager landing).
  const [seedWorkerId, setSeedWorkerId] = useState<string | undefined>(undefined);
  const [seedProjectId, setSeedProjectId] = useState<string | undefined>(undefined);
  const [searchParams, setSearchParams] = useSearchParams();

  // Allow other pages to deep-link here with ?log=today | ?log=<YYYY-MM-DD>
  // (+ optional ?worker=ID&project=ID) and have the entry dialog auto-open
  // + pre-fill.
  useEffect(() => {
    const logParam = searchParams.get('log');
    if (logParam) {
      const targetIso =
        logParam === 'today'
          ? toISODate(new Date())
          : /^\d{4}-\d{2}-\d{2}$/.test(logParam)
            ? logParam
            : null;
      if (targetIso) {
        setDayOpen(targetIso);
        setAnchor(new Date(targetIso + 'T12:00:00'));
        setSeedWorkerId(searchParams.get('worker') ?? undefined);
        setSeedProjectId(searchParams.get('project') ?? undefined);
        const next = new URLSearchParams(searchParams);
        next.delete('log');
        next.delete('worker');
        next.delete('project');
        setSearchParams(next, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startIso = toISODate(weekStart(anchor));
  const endIso = toISODate(weekEnd(anchor));
  const days = weekDays(anchor);
  const { data: entries = [] } = useTimeEntriesForWeek(anchor);
  const { data: materials = [] } = useMaterialEntries();
  const { data: workers = [] } = useWorkers();
  const { data: projects = [] } = useProjects();
  const { data: locks = [] } = useWeekLocks();
  const locked = locks.some((l) => l.week_start === startIso);
  const canSeeFinancials = useCanSeeFinancials();

  const materialsThisWeek = materials.filter(
    (m) => m.entry_date >= startIso && m.entry_date <= endIso,
  );

  const perDay = useMemo(() => {
    const map = new Map<string, { hours: number; workers: Set<string> }>();
    for (const e of entries) {
      const cur = map.get(e.entry_date) ?? { hours: 0, workers: new Set() };
      cur.hours += Number(e.hours);
      cur.workers.add(e.worker_id);
      map.set(e.entry_date, cur);
    }
    return map;
  }, [entries]);

  const weekTotal = entries.reduce((s, e) => s + Number(e.hours), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Week</h1>
        <Badge variant="secondary">{weekLabel(startIso)}</Badge>
        {locked && (
          <Badge variant="warning">
            <Lock className="mr-1 h-3 w-3" />
            Locked
          </Badge>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => subWeeks(d, 1))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => addWeeks(d, 1))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const iso = toISODate(d);
          const day = perDay.get(iso);
          const isToday = iso === toISODate(new Date());
          return (
            <Card
              key={iso}
              className={cn(
                'cursor-pointer transition-shadow hover:shadow-md',
                isToday && 'ring-1 ring-ring',
                locked && 'opacity-75',
              )}
              onClick={() => setDayOpen(iso)}
            >
              <CardContent className="p-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    {format(d, 'EEE')}
                  </div>
                  <div className="text-sm font-semibold">{format(d, 'd')}</div>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-semibold tabular-nums">
                    {day ? formatHours(day.hours) : '—'}
                  </span>
                  {day && (
                    <span className="text-xs text-muted-foreground">
                      {day.workers.size} worker{day.workers.size === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-md border bg-card p-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">Week total</span>
          <span className="font-semibold tabular-nums">{formatHours(weekTotal)}</span>
        </div>
        <Button size="sm" onClick={() => setDayOpen(toISODate(new Date()))}>
          <Plus className="h-4 w-4" /> Add today
        </Button>
      </div>

      {materialsThisWeek.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Materials this week</h2>
          <Card>
            <CardContent className="divide-y py-0">
              {materialsThisWeek.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(m.entry_date), 'EEE d MMM')} ·{' '}
                      {projects.find((p) => p.id === m.project_id)?.name ?? '—'}
                    </p>
                  </div>
                  {canSeeFinancials && (
                    <span className="font-semibold tabular-nums">
                      ${Number(m.cost).toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <DayEntryDialog
        date={dayOpen}
        locked={locked}
        workers={workers}
        projects={projects}
        onClose={() => {
          setDayOpen(null);
          setSeedWorkerId(undefined);
          setSeedProjectId(undefined);
        }}
        initialWorkerId={seedWorkerId}
        initialProjectId={seedProjectId}
      />
    </div>
  );
}
