import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  GanttChartSquare,
  GripVertical,
  Hammer,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjects, useUpdateProject } from '@/hooks/useProjects';
import { useWorkers } from '@/hooks/useWorkers';
import { useAllTimeEntries } from '@/hooks/useTimeEntries';
import { useAuth } from '@/context/AuthContext';
import { computeProjectTotals } from '@/lib/aggregations';
import { toISODate, weekDays, weekEnd, weekStart } from '@/lib/dates';
import { formatHours } from '@/lib/hours';
import {
  applyDrag,
  barGeometry,
  bucketJobs,
  buildMonthBands,
  buildTicks,
  daysFromPx,
  defaultSchedule,
  getScale,
  overlapsWindow,
  relativeDayLabel,
  SCALES,
  type DragMode,
  type ScaleId,
  type ScheduledJob,
} from '@/lib/schedule';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/db';

const ROW_HEIGHT = 52;
/**
 * Label gutter. Narrower on phones, where 11rem would eat half the screen.
 * `LABEL_COL` and `UNDERLAY_INSET` must stay in step — the underlay and the
 * today line are absolutely positioned against the same offset.
 */
const LABEL_COL = 'w-32 shrink-0 md:w-44';
const UNDERLAY_INSET = 'left-32 md:left-44';
const FALLBACK_COLOR = '#8b8b94';

/** start/end pair, always both present — the board only plots scheduled jobs. */
type Span = { start: string; end: string };

export default function TimelinePage() {
  const [scaleId, setScaleId] = useState<ScaleId>('30d');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const scale = getScale(scaleId);

  const { data: projects = [] } = useProjects();
  const { data: workers = [] } = useWorkers();
  const { data: timeEntries = [] } = useAllTimeEntries();
  const { role } = useAuth();
  const updateProject = useUpdateProject();

  // Only the admin may write to `projects` (RLS: projects_admin_write), so the
  // manager gets the same board read-only rather than drags that 403 on drop.
  const editable = role === 'admin';

  const rangeStart = weekStart(anchor);
  const totalDays = scale.days;
  const rangeEnd = addDays(rangeStart, totalDays - 1);
  const today = new Date();

  // Dates we've sent but not yet seen back from the server. Keeps a dragged
  // bar where it was dropped instead of snapping back for one refetch.
  const [pending, setPending] = useState<Record<string, Span>>({});
  useEffect(() => {
    setPending((cur) => {
      const ids = Object.keys(cur);
      if (ids.length === 0) return cur;
      const next = { ...cur };
      let changed = false;
      for (const p of projects) {
        const q = next[p.id];
        if (q && p.start_date === q.start && p.end_date === q.end) {
          delete next[p.id];
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [projects]);

  /** A project's dates, with any in-flight edit applied. */
  const spanOf = useCallback(
    (p: Project): Span | null => {
      const s = pending[p.id];
      if (s) return s;
      if (!p.start_date || !p.end_date) return null;
      return { start: p.start_date, end: p.end_date };
    },
    [pending],
  );

  const commit = useCallback(
    (p: Project, next: Span) => {
      const prev = spanOf(p);
      setPending((cur) => ({ ...cur, [p.id]: next }));
      const save = (span: Span) =>
        updateProject.mutate(
          { id: p.id, patch: { start_date: span.start, end_date: span.end } },
          {
            onError: (err) => {
              setPending((cur) => {
                const c = { ...cur };
                delete c[p.id];
                return c;
              });
              toast.error(
                err instanceof Error ? err.message : `Could not reschedule ${p.name}`,
              );
            },
          },
        );
      save(next);
      toast.success(
        `${p.name} — ${format(parseISO(next.start), 'd MMM')} to ${format(parseISO(next.end), 'd MMM')}`,
        prev
          ? {
              // Longer than the 4s default: a fat-fingered drag is exactly the
              // mistake this button exists for, and 4s isn't long enough to
              // notice the bar landed in the wrong place and reach for it.
              duration: 10_000,
              action: {
                label: 'Undo',
                onClick: () => {
                  setPending((cur) => ({ ...cur, [p.id]: prev }));
                  save(prev);
                },
              },
            }
          : undefined,
      );
    },
    [spanOf, updateProject],
  );

  // Rows: everything scheduled that touches the window, earliest start first.
  const rows = useMemo(() => {
    return projects
      .filter((p) => p.status !== 'archived')
      .map((p) => ({ project: p, span: spanOf(p) }))
      .filter(
        (r): r is { project: Project; span: Span } =>
          r.span !== null && overlapsWindow(r.span.start, r.span.end, rangeStart, totalDays),
      )
      .sort((a, b) => (a.span.start === b.span.start ? 0 : a.span.start < b.span.start ? -1 : 1));
  }, [projects, spanOf, rangeStart, totalDays]);

  const buckets = useMemo(
    () => bucketJobs(projects, today, totalDays),
    // `today` is a fresh Date each render; key off the ISO day instead so this
    // doesn't recompute on every paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, totalDays, toISODate(today)],
  );

  const hoursPctById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(
        r.project.id,
        computeProjectTotals(r.project, timeEntries, [], workers).hoursUsedPct ?? 0,
      );
    }
    return map;
  }, [rows, timeEntries, workers]);

  const scheduleUnscheduled = (p: Project) => {
    const span = defaultSchedule(new Date());
    commit(p, span);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <GanttChartSquare className="h-5 w-5" /> Schedule
        </h1>
        <Badge variant="secondary">
          {format(rangeStart, 'd MMM')} – {format(rangeEnd, 'd MMM yyyy')}
        </Badge>
        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => addDays(d, -scale.panDays))}
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
            onClick={() => setAnchor((d) => addDays(d, scale.panDays))}
            aria-label="Later"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Zoom — how far ahead the underlay reaches. */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Timeline range"
      >
        <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
          Looking ahead
        </span>
        {SCALES.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={s.id === scaleId ? 'default' : 'outline'}
            aria-pressed={s.id === scaleId}
            onClick={() => setScaleId(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <ScheduleBoard
        rows={rows}
        rangeStart={rangeStart}
        totalDays={totalDays}
        tick={scale.tick}
        snapDays={scale.snapDays}
        editable={editable}
        hoursPctById={hoursPctById}
        onCommit={commit}
      />

      {editable && rows.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Drag a bar to move the job, drag either end to change its length.
          {scale.snapDays > 1 && ` At this range it snaps to whole weeks.`} Arrow keys nudge a
          focused bar; hold Shift to stretch it.
        </p>
      )}

      <UpcomingJobs
        buckets={buckets}
        editable={editable}
        horizonLabel={scale.label}
        onSchedule={scheduleUnscheduled}
      />

      <ThisWeekSchedule />
    </div>
  );
}

// --- Board ----------------------------------------------------------------

function ScheduleBoard({
  rows,
  rangeStart,
  totalDays,
  tick,
  snapDays,
  editable,
  hoursPctById,
  onCommit,
}: {
  rows: Array<{ project: Project; span: Span }>;
  rangeStart: Date;
  totalDays: number;
  tick: 'day' | 'week' | 'month';
  snapDays: number;
  editable: boolean;
  hoursPctById: Map<string, number>;
  onCommit: (p: Project, next: Span) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  // The drag maths needs the track's real pixel width. This has to be a
  // callback ref, not an effect: on the first paint the projects query is
  // still empty, so the board renders its empty state and the track node
  // doesn't exist yet. A `[]`-deps effect would measure null once and never
  // run again, leaving every drag worth zero days.
  const trackRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    setTrackWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    ro.observe(el);
    observerRef.current = ro;
  }, []);

  const months = useMemo(() => buildMonthBands(rangeStart, totalDays), [rangeStart, totalDays]);
  const ticks = useMemo(
    () => buildTicks(rangeStart, totalDays, tick),
    [rangeStart, totalDays, tick],
  );

  const todayPct = useMemo(() => {
    const iso = toISODate(new Date());
    const g = overlapsWindow(iso, iso, rangeStart, totalDays)
      ? barGeometry(iso, iso, rangeStart, totalDays)
      : null;
    return g ? g.leftPct : null;
  }, [rangeStart, totalDays]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No jobs scheduled in this window.
          <p className="mt-2 text-xs">
            Widen the range above, or give a job start and end dates below to put it on the
            board.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Header — month band, then the finer tick row */}
            <div className="flex border-b bg-muted/40">
              <div className={cn(LABEL_COL, 'border-r px-3 py-2')}>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Job
                </span>
              </div>
              <div ref={trackRef} className="relative flex-1">
                <div className="relative h-7 border-b">
                  {months.map((m) => (
                    <div
                      key={m.key}
                      className="absolute inset-y-0 truncate border-r px-2 py-1 text-xs font-medium text-foreground/80"
                      style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="relative h-6">
                  {ticks.map((t) => (
                    <div
                      key={t.key}
                      className={cn(
                        'absolute inset-y-0 flex items-center justify-center truncate text-[10px] tabular-nums text-muted-foreground',
                        t.weekend && 'bg-muted/70',
                      )}
                      style={{ left: `${t.leftPct}%`, width: `${t.widthPct}%` }}
                    >
                      {t.label}
                    </div>
                  ))}
                  {todayPct != null && (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-destructive/70"
                      style={{ left: `${todayPct}%` }}
                      aria-hidden
                    >
                      <span className="absolute bottom-0 left-0 whitespace-nowrap rounded-t bg-destructive px-1 text-[9px] font-medium uppercase leading-4 text-destructive-foreground">
                        today
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rows over a shared underlay */}
            <div className="relative">
              {/* Underlay: alternating months, weekend shading, gridlines */}
              <div className={cn('pointer-events-none absolute inset-y-0 right-0', UNDERLAY_INSET)} aria-hidden>
                {months.map((m) => (
                  <div
                    key={m.key}
                    className={cn('absolute inset-y-0 border-r border-border', m.alt && 'bg-muted/30')}
                    style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                  />
                ))}
                {ticks.map((t) => (
                  <div
                    key={t.key}
                    className={cn(
                      'absolute inset-y-0 border-r border-border/40',
                      t.weekend && 'bg-muted/50',
                    )}
                    style={{ left: `${t.leftPct}%`, width: `${t.widthPct}%` }}
                  />
                ))}
              </div>

              {rows.map((r) => (
                <ScheduleRow
                  key={r.project.id}
                  project={r.project}
                  span={r.span}
                  rangeStart={rangeStart}
                  totalDays={totalDays}
                  snapDays={snapDays}
                  trackWidth={trackWidth}
                  editable={editable}
                  hoursUsedPct={hoursPctById.get(r.project.id) ?? 0}
                  onCommit={onCommit}
                />
              ))}

              {/* Today line, drawn over the bars. Its label lives up in the
                  header so it doesn't sit on top of the first job. */}
              {todayPct != null && (
                <div
                  className={cn(
                    'pointer-events-none absolute inset-y-0 right-0 z-20',
                    UNDERLAY_INSET,
                  )}
                  aria-hidden
                >
                  <div
                    className="absolute inset-y-0 w-px bg-destructive/70"
                    style={{ left: `${todayPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- One row + its draggable bar -----------------------------------------

function ScheduleRow({
  project,
  span,
  rangeStart,
  totalDays,
  snapDays,
  trackWidth,
  editable,
  hoursUsedPct,
  onCommit,
}: {
  project: Project;
  span: Span;
  rangeStart: Date;
  totalDays: number;
  snapDays: number;
  trackWidth: number;
  editable: boolean;
  hoursUsedPct: number;
  onCommit: (p: Project, next: Span) => void;
}) {
  const navigate = useNavigate();
  const [drag, setDrag] = useState<{
    mode: DragMode;
    startX: number;
    deltaDays: number;
    moved: boolean;
  } | null>(null);

  const preview = drag ? applyDrag(span.start, span.end, drag.mode, drag.deltaDays) : span;
  const geo = barGeometry(preview.start, preview.end, rangeStart, totalDays);
  const color = project.color_tag ?? FALLBACK_COLOR;
  const burn = hoursUsedPct > 100 ? 'over' : hoursUsedPct > 85 ? 'near' : 'ok';

  // A 6-week job is ~30px wide on the 12-month board. Drop the labels rather
  // than clip them into nonsense; the row header and the hover title still say
  // what it is.
  const barWidthPx = (geo.widthPct / 100) * trackWidth;
  const showDates = barWidthPx >= 96;
  const showPct = barWidthPx >= 44;
  const rangeText = `${format(parseISO(preview.start), 'd MMM')} – ${format(parseISO(preview.end), 'd MMM')}`;

  // Set when a press turned into a real drag, so the click the browser fires
  // afterwards doesn't also open the project. Cleared on the next press, in
  // case that click landed outside the bar and never reached onClick.
  const draggedRef = useRef(false);

  const beginDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    draggedRef.current = false;
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode, startX: e.clientX, deltaDays: 0, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const deltaDays = daysFromPx(dx, trackWidth, totalDays, snapDays);
    setDrag((d) =>
      d ? { ...d, deltaDays, moved: d.moved || Math.abs(dx) > 3 } : d,
    );
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // A press that never really moved falls through to onClick and opens the
    // job; anything else is a reschedule.
    if (!d.moved) return;
    draggedRef.current = true;
    const next = applyDrag(span.start, span.end, d.mode, d.deltaDays);
    if (next.start !== span.start || next.end !== span.end) onCommit(project, next);
  };

  // Click opens the job for both roles — the manager never enters the drag
  // path at all, so this is his only way onto the project from the board.
  const onClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    navigate(`/projects/${project.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/projects/${project.id}`);
      return;
    }
    if (!editable) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = (e.key === 'ArrowRight' ? 1 : -1) * snapDays;
    // Shift stretches the finish date; plain arrows slide the whole job.
    onCommit(project, applyDrag(span.start, span.end, e.shiftKey ? 'resize-end' : 'move', delta));
  };

  return (
    <div className="relative flex items-center border-b" style={{ height: ROW_HEIGHT }}>
      <div className={cn(LABEL_COL, 'z-10 border-r bg-card px-3 py-1.5')}>
        <Link to={`/projects/${project.id}`} className="block hover:underline">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <p className="truncate text-sm font-medium">{project.name}</p>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {project.client_name ?? '—'}
          </p>
        </Link>
      </div>

      <div className="relative flex-1">
        <div
          role="button"
          tabIndex={0}
          aria-label={`${project.name}, ${format(parseISO(preview.start), 'd MMM')} to ${format(
            parseISO(preview.end),
            'd MMM yyyy',
          )}${editable ? '. Drag or use arrow keys to reschedule.' : ''}`}
          onPointerDown={beginDrag('move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onClick}
          onKeyDown={onKeyDown}
          title={`${project.name} · ${rangeText} · ${Math.round(hoursUsedPct)}% of quoted hours`}
          className={cn(
            'absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden rounded-md border shadow-sm outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            editable ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer',
            drag && 'z-30 shadow-lg ring-2 ring-ring',
            geo.clippedStart && 'rounded-l-none border-l-0',
            geo.clippedEnd && 'rounded-r-none border-r-0',
          )}
          style={{
            left: `${geo.leftPct}%`,
            width: `${geo.widthPct}%`,
            background: `${color}2e`,
            borderColor: `${color}99`,
          }}
        >
          {/* Hours-burn fill: how much of the quoted time is already spent. */}
          <div
            className={cn(
              'absolute inset-y-0 left-0',
              burn === 'over' && 'bg-destructive/60',
              burn === 'near' && 'bg-warning/60',
              burn === 'ok' && 'bg-[color:var(--bar)]/60',
            )}
            style={
              {
                width: `${Math.min(100, hoursUsedPct)}%`,
                ['--bar' as never]: color,
              } as React.CSSProperties
            }
            aria-hidden
          />

          <div className="pointer-events-none relative flex w-full items-center justify-between gap-2 px-2 text-[11px] font-medium text-foreground/85">
            {showDates && <span className="truncate">{rangeText}</span>}
            {showPct && (
              <span className="shrink-0 tabular-nums">{Math.round(hoursUsedPct)}%</span>
            )}
          </div>

          {editable && !geo.clippedStart && (
            <ResizeHandle side="start" onPointerDown={beginDrag('resize-start')} />
          )}
          {editable && !geo.clippedEnd && (
            <ResizeHandle side="end" onPointerDown={beginDrag('resize-end')} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResizeHandle({
  side,
  onPointerDown,
}: {
  side: 'start' | 'end';
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      aria-hidden
      className={cn(
        'absolute inset-y-0 flex w-3 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity hover:opacity-100',
        side === 'start' ? 'left-0' : 'right-0',
      )}
    >
      <GripVertical className="h-3.5 w-3.5 text-foreground/70" />
    </div>
  );
}

// --- Upcoming jobs --------------------------------------------------------

function UpcomingJobs({
  buckets,
  editable,
  horizonLabel,
  onSchedule,
}: {
  buckets: ReturnType<typeof bucketJobs>;
  editable: boolean;
  horizonLabel: string;
  onSchedule: (p: Project) => void;
}) {
  const { onSite, upcoming, later, unscheduled } = buckets;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hammer className="h-4 w-4" /> Jobs ahead
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <JobGroup
          title="On site now"
          empty="Nothing running today."
          jobs={onSite}
          note={(j) =>
            j.endsInDays < 0
              ? `over by ${Math.abs(j.endsInDays)} days`
              : `finishes ${relativeDayLabel(j.endsInDays)}`
          }
          overdue={(j) => j.endsInDays < 0}
        />

        <JobGroup
          title={`Starting in the next ${horizonLabel.toLowerCase()}`}
          empty="Nothing booked in this window."
          jobs={upcoming}
          note={(j) => `starts ${relativeDayLabel(j.startsInDays)}`}
        />

        {later.length > 0 && (
          <JobGroup
            title="Further out"
            empty=""
            jobs={later}
            note={(j) => format(parseISO(j.project.start_date!), 'd MMM yyyy')}
          />
        )}

        {unscheduled.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Not on the calendar yet
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              These have no start and end date, so they can't be plotted.
              {editable && ' Put one on next week and drag it to where it belongs.'}
            </p>
            <ul className="divide-y rounded-md border">
              {unscheduled.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: p.color_tag ?? FALLBACK_COLOR }}
                  />
                  <Link to={`/projects/${p.id}`} className="flex-1 truncate text-sm font-medium hover:underline">
                    {p.name}
                  </Link>
                  {editable && (
                    <Button size="sm" variant="outline" onClick={() => onSchedule(p)}>
                      <CalendarPlus className="h-3.5 w-3.5" /> Schedule
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobGroup({
  title,
  empty,
  jobs,
  note,
  overdue,
}: {
  title: string;
  empty: string;
  jobs: ScheduledJob[];
  note: (j: ScheduledJob) => string;
  overdue?: (j: ScheduledJob) => boolean;
}) {
  if (jobs.length === 0 && !empty) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {jobs.map((j) => (
            <li key={j.project.id}>
              <Link
                to={`/projects/${j.project.id}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: j.project.color_tag ?? FALLBACK_COLOR }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{j.project.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {format(parseISO(j.project.start_date!), 'd MMM')} –{' '}
                    {format(parseISO(j.project.end_date!), 'd MMM')} · {j.durationDays} days
                    {j.project.client_name ? ` · ${j.project.client_name}` : ''}
                  </p>
                </div>
                <Badge variant={overdue?.(j) ? 'warning' : 'secondary'} className="shrink-0">
                  {note(j)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- This week ------------------------------------------------------------

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
    () => new Map(projects.map((p) => [p.id, p.color_tag ?? FALLBACK_COLOR])),
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
                                      background: colorByProject.get(pid) ?? 'hsl(var(--border))',
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
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
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
