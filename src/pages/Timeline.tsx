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
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/useProjects';
import {
  useCreateScheduleBlock,
  useDeleteScheduleBlock,
  useScheduleBlocks,
  useUpdateScheduleBlock,
} from '@/hooks/useScheduleBlocks';
import {
  SchedulePartDialog,
  type PartDraft,
} from '@/components/features/SchedulePartDialog';
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
  nextPartSpan,
  overlapsWindow,
  partLabel,
  partsByProject,
  relativeDayLabel,
  SCALES,
  splitPart,
  type DragMode,
  type ScaleId,
  type ScheduledJob,
  type Span,
} from '@/lib/schedule';
import { cn } from '@/lib/utils';
import type { Project, ProjectScheduleBlock } from '@/types/db';

const ROW_HEIGHT = 52;
/**
 * Label gutter. Narrower on phones, where 11rem would eat half the screen.
 * `LABEL_COL` and `UNDERLAY_INSET` must stay in step — the underlay and the
 * today line are absolutely positioned against the same offset.
 */
const LABEL_COL = 'w-32 shrink-0 md:w-44';
const UNDERLAY_INSET = 'left-32 md:left-44';
const FALLBACK_COLOR = '#8b8b94';

export default function TimelinePage() {
  const [scaleId, setScaleId] = useState<ScaleId>('30d');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const scale = getScale(scaleId);

  const { data: projects = [] } = useProjects();
  const { data: blocks = [] } = useScheduleBlocks();
  const { data: workers = [] } = useWorkers();
  const { data: timeEntries = [] } = useAllTimeEntries();
  const { role } = useAuth();
  const createPart = useCreateScheduleBlock();
  const updatePart = useUpdateScheduleBlock();
  const deletePart = useDeleteScheduleBlock();

  // Only the admin may write the schedule (RLS: project_schedule_blocks_admin_write),
  // so the manager gets the same board read-only rather than drags that 403 on drop.
  const editable = role === 'admin';

  const rangeStart = weekStart(anchor);
  const totalDays = scale.days;
  const rangeEnd = addDays(rangeStart, totalDays - 1);
  const today = new Date();

  /** Part being edited by hand, if any. */
  const [editing, setEditing] = useState<string | null>(null);

  // Spans we've sent but not yet seen back from the server, keyed by part id.
  // Keeps a dragged bar where it was dropped instead of snapping back for one
  // refetch and reading as a failed drag.
  const [pending, setPending] = useState<Record<string, Span>>({});
  useEffect(() => {
    setPending((cur) => {
      if (Object.keys(cur).length === 0) return cur;
      const next = { ...cur };
      let changed = false;
      for (const b of blocks) {
        const q = next[b.id];
        if (q && b.start_date === q.start && b.end_date === q.end) {
          delete next[b.id];
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [blocks]);

  /** A part's dates, with any in-flight edit applied. */
  const spanOf = useCallback(
    (b: ProjectScheduleBlock): Span =>
      pending[b.id] ?? { start: b.start_date, end: b.end_date },
    [pending],
  );

  const savePart = useCallback(
    (part: ProjectScheduleBlock, next: Span, label?: string | null) => {
      setPending((cur) => ({ ...cur, [part.id]: next }));
      updatePart.mutate(
        {
          id: part.id,
          patch: {
            start_date: next.start,
            end_date: next.end,
            ...(label === undefined ? {} : { label }),
          },
        },
        {
          onError: (err) => {
            setPending((cur) => {
              const c = { ...cur };
              delete c[part.id];
              return c;
            });
            toast.error(err instanceof Error ? err.message : 'Could not save the new dates');
          },
        },
      );
    },
    [updatePart],
  );

  /** Drag/nudge commit — same as savePart, plus an Undo affordance. */
  const commitDrag = useCallback(
    (project: Project, part: ProjectScheduleBlock, next: Span, name: string) => {
      const prev = spanOf(part);
      savePart(part, next);
      toast.success(
        `${project.name} · ${name} — ${format(parseISO(next.start), 'd MMM')} to ${format(
          parseISO(next.end),
          'd MMM',
        )}`,
        {
          // Longer than the 4s default: a fat-fingered drag is exactly the
          // mistake this button exists for, and 4s isn't long enough to notice
          // the bar landed wrong and reach for it.
          duration: 10_000,
          action: { label: 'Undo', onClick: () => savePart(part, prev) },
        },
      );
    },
    [spanOf, savePart],
  );

  const partsFor = useMemo(() => partsByProject(blocks), [blocks]);

  // Rows: every non-archived job with at least one part touching the window.
  const rows = useMemo(() => {
    return projects
      .filter((p) => p.status !== 'archived')
      .map((project) => ({ project, parts: partsFor.get(project.id) ?? [] }))
      .filter((row) =>
        row.parts.some((b) => {
          const span = spanOf(b);
          return overlapsWindow(span.start, span.end, rangeStart, totalDays);
        }),
      )
      .sort((a, b) => {
        const as = a.parts[0]?.start_date ?? '';
        const bs = b.parts[0]?.start_date ?? '';
        return as === bs ? a.project.name.localeCompare(b.project.name) : as < bs ? -1 : 1;
      });
  }, [projects, partsFor, spanOf, rangeStart, totalDays]);

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

  const addPart = (project: Project) => {
    const existing = partsFor.get(project.id) ?? [];
    const span = existing.length ? nextPartSpan(existing, new Date()) : defaultSchedule(new Date());
    createPart.mutate(
      {
        project_id: project.id,
        label: null,
        start_date: span.start,
        end_date: span.end,
        scope_id: null,
        order_index: existing.length,
        notes: null,
      },
      {
        onSuccess: () =>
          toast.success(
            `${project.name} — new part on ${format(parseISO(span.start), 'd MMM')}. Drag it to where it belongs.`,
          ),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Could not add the part'),
      },
    );
  };

  // --- Manual edit dialog --------------------------------------------------
  const editingPart = blocks.find((b) => b.id === editing) ?? null;
  const editingProject = editingPart
    ? (projects.find((p) => p.id === editingPart.project_id) ?? null)
    : null;
  const editingSiblings = editingPart ? (partsFor.get(editingPart.project_id) ?? []) : [];
  const editingIndex = editingPart ? editingSiblings.findIndex((b) => b.id === editingPart.id) : 0;

  const handleSave = (draft: PartDraft) => {
    if (!editingPart) return;
    savePart(editingPart, { start: draft.start, end: draft.end }, draft.label.trim() || null);
    setEditing(null);
  };

  const handleSplit = (atIso: string) => {
    if (!editingPart || !editingProject) return;
    const cut = splitPart(editingPart, atIso);
    if (!cut) return;
    savePart(editingPart, cut.first);
    createPart.mutate(
      {
        project_id: editingPart.project_id,
        label: null,
        start_date: cut.second.start,
        end_date: cut.second.end,
        scope_id: editingPart.scope_id,
        order_index: editingSiblings.length,
        notes: null,
      },
      {
        onSuccess: () =>
          toast.success(
            `${editingProject.name} split at ${format(parseISO(atIso), 'd MMM')} — drag the second part to when you come back.`,
          ),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Could not split the part'),
      },
    );
    setEditing(null);
  };

  const handleDelete = () => {
    if (!editingPart || !editingProject) return;
    const last = editingSiblings.length === 1;
    deletePart.mutate(editingPart.id, {
      onSuccess: () =>
        toast.success(
          last
            ? `${editingProject.name} taken off the calendar.`
            : `Part removed from ${editingProject.name}.`,
        ),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Could not remove the part'),
    });
    setEditing(null);
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
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Timeline range">
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
        spanOf={spanOf}
        rangeStart={rangeStart}
        totalDays={totalDays}
        tick={scale.tick}
        snapDays={scale.snapDays}
        editable={editable}
        hoursPctById={hoursPctById}
        onCommit={commitDrag}
        onEdit={setEditing}
        onAddPart={addPart}
      />

      {editable && rows.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Drag a bar to move it, drag either end to change its length, or click it to type the
            dates in.
            {scale.snapDays > 1 && ' Dragging snaps to whole weeks at this range — click the bar for exact days.'}{' '}
            A job that stops and comes back can be split into parts.
          </span>
        </p>
      )}

      <UpcomingJobs
        buckets={buckets}
        partsFor={partsFor}
        editable={editable}
        horizonLabel={scale.label}
        onSchedule={addPart}
      />

      <ThisWeekSchedule />

      <SchedulePartDialog
        open={!!editingPart}
        part={editingPart}
        index={editingIndex < 0 ? 0 : editingIndex}
        projectName={editingProject?.name ?? ''}
        partCount={editingSiblings.length}
        onSave={handleSave}
        onSplit={handleSplit}
        onDelete={handleDelete}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

// --- Board ----------------------------------------------------------------

interface Row {
  project: Project;
  parts: ProjectScheduleBlock[];
}

function ScheduleBoard({
  rows,
  spanOf,
  rangeStart,
  totalDays,
  tick,
  snapDays,
  editable,
  hoursPctById,
  onCommit,
  onEdit,
  onAddPart,
}: {
  rows: Row[];
  spanOf: (b: ProjectScheduleBlock) => Span;
  rangeStart: Date;
  totalDays: number;
  tick: 'day' | 'week' | 'month';
  snapDays: number;
  editable: boolean;
  hoursPctById: Map<string, number>;
  onCommit: (project: Project, part: ProjectScheduleBlock, next: Span, name: string) => void;
  onEdit: (partId: string) => void;
  onAddPart: (project: Project) => void;
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
    return overlapsWindow(iso, iso, rangeStart, totalDays)
      ? barGeometry(iso, iso, rangeStart, totalDays).leftPct
      : null;
  }, [rangeStart, totalDays]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No jobs scheduled in this window.
          <p className="mt-2 text-xs">
            Widen the range above, or put a job on the calendar from the list below.
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
              <div
                className={cn('pointer-events-none absolute inset-y-0 right-0', UNDERLAY_INSET)}
                aria-hidden
              >
                {months.map((m) => (
                  <div
                    key={m.key}
                    className={cn(
                      'absolute inset-y-0 border-r border-border',
                      m.alt && 'bg-muted/30',
                    )}
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

              {rows.map((row) => (
                <ScheduleRow
                  key={row.project.id}
                  row={row}
                  spanOf={spanOf}
                  rangeStart={rangeStart}
                  totalDays={totalDays}
                  snapDays={snapDays}
                  trackWidth={trackWidth}
                  editable={editable}
                  hoursUsedPct={hoursPctById.get(row.project.id) ?? 0}
                  onCommit={onCommit}
                  onEdit={onEdit}
                  onAddPart={onAddPart}
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

// --- One row: a job and all its parts ------------------------------------

function ScheduleRow({
  row,
  spanOf,
  rangeStart,
  totalDays,
  snapDays,
  trackWidth,
  editable,
  hoursUsedPct,
  onCommit,
  onEdit,
  onAddPart,
}: {
  row: Row;
  spanOf: (b: ProjectScheduleBlock) => Span;
  rangeStart: Date;
  totalDays: number;
  snapDays: number;
  trackWidth: number;
  editable: boolean;
  hoursUsedPct: number;
  onCommit: (project: Project, part: ProjectScheduleBlock, next: Span, name: string) => void;
  onEdit: (partId: string) => void;
  onAddPart: (project: Project) => void;
}) {
  const { project, parts } = row;
  const color = project.color_tag ?? FALLBACK_COLOR;

  return (
    <div className="group relative flex items-center border-b" style={{ height: ROW_HEIGHT }}>
      <div className={cn(LABEL_COL, 'z-10 flex items-center gap-1 border-r bg-card px-3 py-1.5')}>
        <Link to={`/projects/${project.id}`} className="min-w-0 flex-1 hover:underline">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <p className="truncate text-sm font-medium">{project.name}</p>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {parts.length > 1
              ? `${parts.length} parts`
              : (project.client_name ?? '—')}
          </p>
        </Link>
        {editable && (
          <button
            type="button"
            onClick={() => onAddPart(project)}
            title={`Add another part to ${project.name}`}
            aria-label={`Add another part to ${project.name}`}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative flex-1">
        {parts.map((part, i) => (
          <ScheduleBar
            key={part.id}
            project={project}
            part={part}
            index={i}
            isLast={i === parts.length - 1}
            multiPart={parts.length > 1}
            span={spanOf(part)}
            rangeStart={rangeStart}
            totalDays={totalDays}
            snapDays={snapDays}
            trackWidth={trackWidth}
            editable={editable}
            hoursUsedPct={hoursUsedPct}
            onCommit={onCommit}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

// --- One draggable part ---------------------------------------------------

function ScheduleBar({
  project,
  part,
  index,
  isLast,
  multiPart,
  span,
  rangeStart,
  totalDays,
  snapDays,
  trackWidth,
  editable,
  hoursUsedPct,
  onCommit,
  onEdit,
}: {
  project: Project;
  part: ProjectScheduleBlock;
  index: number;
  isLast: boolean;
  multiPart: boolean;
  span: Span;
  rangeStart: Date;
  totalDays: number;
  snapDays: number;
  trackWidth: number;
  editable: boolean;
  hoursUsedPct: number;
  onCommit: (project: Project, part: ProjectScheduleBlock, next: Span, name: string) => void;
  onEdit: (partId: string) => void;
}) {
  const navigate = useNavigate();
  const [drag, setDrag] = useState<{
    mode: DragMode;
    startX: number;
    deltaDays: number;
    moved: boolean;
  } | null>(null);

  const name = partLabel(part, index);
  const preview = drag ? applyDrag(span.start, span.end, drag.mode, drag.deltaDays) : span;
  const geo = barGeometry(preview.start, preview.end, rangeStart, totalDays);
  const color = project.color_tag ?? FALLBACK_COLOR;
  const burn = hoursUsedPct > 100 ? 'over' : hoursUsedPct > 85 ? 'near' : 'ok';

  // Nothing to draw when the part sits entirely outside the window — but its
  // siblings may still be visible, which is why this is per-part not per-row.
  const visible = overlapsWindow(preview.start, preview.end, rangeStart, totalDays);

  // A 6-week job is ~30px wide on the 12-month board. Drop the labels rather
  // than clip them into nonsense; the row header and the hover title still say
  // what it is.
  const barWidthPx = (geo.widthPct / 100) * trackWidth;
  const rangeText = `${format(parseISO(preview.start), 'd MMM')} – ${format(parseISO(preview.end), 'd MMM')}`;
  const primaryText = multiPart ? `${name} · ${rangeText}` : rangeText;
  const showText = barWidthPx >= (multiPart ? 130 : 96);
  const showPct = isLast && barWidthPx >= 44;

  // Set when a press turned into a real drag, so the click the browser fires
  // afterwards doesn't also open the editor. Cleared on the next press, in
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
    setDrag((d) => (d ? { ...d, deltaDays, moved: d.moved || Math.abs(dx) > 3 } : d));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // A press that never really moved falls through to onClick.
    if (!d.moved) return;
    draggedRef.current = true;
    const next = applyDrag(span.start, span.end, d.mode, d.deltaDays);
    if (next.start !== span.start || next.end !== span.end) {
      onCommit(project, part, next, name);
    }
  };

  // Admin clicks to type exact dates; the manager can't edit, so for him a
  // click is the only way onto the job from the board.
  const onClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (editable) onEdit(part.id);
    else navigate(`/projects/${project.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
      return;
    }
    if (!editable) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = (e.key === 'ArrowRight' ? 1 : -1) * snapDays;
    // Shift stretches the finish date; plain arrows slide the whole part.
    onCommit(
      project,
      part,
      applyDrag(span.start, span.end, e.shiftKey ? 'resize-end' : 'move', delta),
      name,
    );
  };

  if (!visible) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${project.name}${multiPart ? `, ${name}` : ''}, ${format(
        parseISO(preview.start),
        'd MMM',
      )} to ${format(parseISO(preview.end), 'd MMM yyyy')}${
        editable ? '. Drag to move, or press Enter to type the dates.' : ''
      }`}
      onPointerDown={beginDrag('move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={`${project.name} · ${multiPart ? `${name} · ` : ''}${rangeText} · ${Math.round(hoursUsedPct)}% of quoted hours`}
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
        {showText && <span className="truncate">{primaryText}</span>}
        {showPct && <span className="shrink-0 tabular-nums">{Math.round(hoursUsedPct)}%</span>}
      </div>

      {editable && !geo.clippedStart && (
        <ResizeHandle side="start" onPointerDown={beginDrag('resize-start')} />
      )}
      {editable && !geo.clippedEnd && (
        <ResizeHandle side="end" onPointerDown={beginDrag('resize-end')} />
      )}
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
  partsFor,
  editable,
  horizonLabel,
  onSchedule,
}: {
  buckets: ReturnType<typeof bucketJobs>;
  partsFor: Map<string, ProjectScheduleBlock[]>;
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
          partsFor={partsFor}
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
          partsFor={partsFor}
          note={(j) => `starts ${relativeDayLabel(j.startsInDays)}`}
        />

        {later.length > 0 && (
          <JobGroup
            title="Further out"
            empty=""
            jobs={later}
            partsFor={partsFor}
            note={(j) => format(parseISO(j.project.start_date!), 'd MMM yyyy')}
          />
        )}

        {unscheduled.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Not on the calendar yet
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              These have no dates, so they can't be plotted.
              {editable && ' Put one on next week and drag it to where it belongs.'}
            </p>
            <ul className="divide-y rounded-md border">
              {unscheduled.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: p.color_tag ?? FALLBACK_COLOR }}
                  />
                  <Link
                    to={`/projects/${p.id}`}
                    className="flex-1 truncate text-sm font-medium hover:underline"
                  >
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
  partsFor,
  note,
  overdue,
}: {
  title: string;
  empty: string;
  jobs: ScheduledJob[];
  partsFor: Map<string, ProjectScheduleBlock[]>;
  note: (j: ScheduledJob) => string;
  overdue?: (j: ScheduledJob) => boolean;
}) {
  if (jobs.length === 0 && !empty) return null;
  const todayIso = toISODate(new Date());

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {jobs.map((j) => {
            const parts = partsFor.get(j.project.id) ?? [];
            // For a split job the envelope is misleading on its own — "17 Aug
            // to 12 Oct" reads as eight solid weeks. Name the next block of
            // work so the gap is visible in the list too.
            const nextPart = parts.find((b) => b.end_date >= todayIso);
            const nextIndex = nextPart ? parts.indexOf(nextPart) : -1;
            return (
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
                    {parts.length > 1 && nextPart && (
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">
                          {parts.length} parts
                        </span>{' '}
                        · next: {partLabel(nextPart, nextIndex)},{' '}
                        {format(parseISO(nextPart.start_date), 'd MMM')} –{' '}
                        {format(parseISO(nextPart.end_date), 'd MMM')}
                      </p>
                    )}
                  </div>
                  <Badge variant={overdue?.(j) ? 'warning' : 'secondary'} className="shrink-0">
                    {note(j)}
                  </Badge>
                </Link>
              </li>
            );
          })}
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
