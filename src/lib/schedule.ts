// Geometry + date maths for the scheduling board (/timeline).
//
// Kept free of React so the fiddly parts — where a bar sits, what a drag of
// N pixels means in days, which jobs count as "upcoming" — are unit-testable
// without rendering anything.

import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns';
import type { Project } from '@/types/db';
import { toISODate, weekStart } from './dates';

// --- Scales ---------------------------------------------------------------

export type ScaleId = '30d' | '60d' | '6m' | '12m';

export interface Scale {
  id: ScaleId;
  /** Button label. */
  label: string;
  /** Window length in days. Always a whole number of weeks so the Monday
   *  gridlines stay true at every zoom level. */
  days: number;
  /** Granularity of the second header row + the vertical gridlines. */
  tick: 'day' | 'week' | 'month';
  /** Drag snapping. Coarse zooms snap to whole weeks — at ~2px/day a
   *  day-accurate drag is a lie. */
  snapDays: number;
  /** How far the ‹ › buttons pan. */
  panDays: number;
}

export const SCALES: Scale[] = [
  { id: '30d', label: '30 days', days: 35, tick: 'day', snapDays: 1, panDays: 14 },
  { id: '60d', label: '60 days', days: 63, tick: 'week', snapDays: 1, panDays: 28 },
  { id: '6m', label: '6 months', days: 182, tick: 'month', snapDays: 7, panDays: 84 },
  { id: '12m', label: '12 months', days: 364, tick: 'month', snapDays: 7, panDays: 182 },
];

export function getScale(id: ScaleId): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

// --- Header bands + gridlines --------------------------------------------

export interface Band {
  key: string;
  label: string;
  leftPct: number;
  widthPct: number;
  /** Alternating shade, used for the month underlay. */
  alt: boolean;
  /** Weekends get a heavier shade at day scale. */
  weekend?: boolean;
}

/**
 * Month labels have to survive a 12-month window, where each band is ~8% of
 * the track and "September 2026" just truncates to "Septem…". Below that
 * width fall back to "Sep", carrying the year only where it changes.
 */
function monthLabel(month: Date, spanDays: number, widthPct: number, isFirst: boolean): string {
  if (widthPct < 12) {
    const january = month.getMonth() === 0;
    return january || isFirst ? format(month, "MMM ''yy") : format(month, 'MMM');
  }
  // A stub month at either end of the window — no room for the long form.
  return spanDays < 20 ? format(month, 'MMM') : format(month, 'MMMM yyyy');
}

/** Month header bands spanning the window. Always the top header row. */
export function buildMonthBands(rangeStart: Date, totalDays: number): Band[] {
  const bands: Band[] = [];
  const rangeEnd = addDays(rangeStart, totalDays - 1);
  let cursor = rangeStart;
  let i = 0;
  while (cursor <= rangeEnd) {
    // Last calendar day of the month `cursor` falls in.
    const nextMonth = startOfMonth(addDays(startOfMonth(cursor), 40));
    const monthEnd = addDays(nextMonth, -1);
    const segEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    const offset = differenceInCalendarDays(cursor, rangeStart);
    const span = differenceInCalendarDays(segEnd, cursor) + 1;
    const widthPct = (span / totalDays) * 100;
    bands.push({
      key: toISODate(cursor),
      label: monthLabel(cursor, span, widthPct, i === 0),
      leftPct: (offset / totalDays) * 100,
      widthPct,
      alt: i % 2 === 1,
    });
    cursor = addDays(segEnd, 1);
    i += 1;
  }
  return bands;
}

/**
 * The second header row / gridline set. `day` gives one column per day,
 * `week` one per Monday, `month` returns [] (the month bands already are
 * the finest useful division at that zoom).
 */
export function buildTicks(rangeStart: Date, totalDays: number, unit: Scale['tick']): Band[] {
  if (unit === 'month') return [];
  const step = unit === 'day' ? 1 : 7;
  const ticks: Band[] = [];
  for (let offset = 0; offset < totalDays; offset += step) {
    const d = addDays(rangeStart, offset);
    const span = Math.min(step, totalDays - offset);
    const dow = d.getDay();
    ticks.push({
      key: toISODate(d),
      label: unit === 'day' ? format(d, 'd') : format(d, 'd MMM'),
      leftPct: (offset / totalDays) * 100,
      widthPct: (span / totalDays) * 100,
      alt: (offset / step) % 2 === 1,
      weekend: unit === 'day' && (dow === 0 || dow === 6),
    });
  }
  return ticks;
}

// --- Bar placement --------------------------------------------------------

export interface BarGeometry {
  leftPct: number;
  widthPct: number;
  /** True when the job actually starts before the window opens. */
  clippedStart: boolean;
  /** True when it runs past the window's right edge. */
  clippedEnd: boolean;
}

/** Where a start/end pair sits in the window, clipped to it. */
export function barGeometry(
  startIso: string,
  endIso: string,
  rangeStart: Date,
  totalDays: number,
): BarGeometry {
  const rawStart = differenceInCalendarDays(parseISO(startIso), rangeStart);
  const rawEnd = differenceInCalendarDays(parseISO(endIso), rangeStart);
  const start = Math.max(0, rawStart);
  const end = Math.min(totalDays - 1, rawEnd);
  return {
    leftPct: (start / totalDays) * 100,
    widthPct: (Math.max(0, end - start) + 1) / totalDays * 100,
    clippedStart: rawStart < 0,
    clippedEnd: rawEnd > totalDays - 1,
  };
}

/** Does this job overlap the visible window at all? */
export function overlapsWindow(
  startIso: string,
  endIso: string,
  rangeStart: Date,
  totalDays: number,
): boolean {
  const rangeEndIso = toISODate(addDays(rangeStart, totalDays - 1));
  const rangeStartIso = toISODate(rangeStart);
  return endIso >= rangeStartIso && startIso <= rangeEndIso;
}

// --- Drag maths -----------------------------------------------------------

export type DragMode = 'move' | 'resize-start' | 'resize-end';

/**
 * Convert a horizontal pointer delta into whole days, snapped to the scale's
 * granularity. Returns 0 when the track hasn't been measured yet.
 */
export function daysFromPx(
  dx: number,
  trackWidthPx: number,
  totalDays: number,
  snapDays: number,
): number {
  if (!trackWidthPx || totalDays <= 0) return 0;
  const pxPerDay = trackWidthPx / totalDays;
  const rawDays = dx / pxPerDay;
  const snap = Math.max(1, snapDays);
  return Math.round(rawDays / snap) * snap;
}

/**
 * Apply a drag of `deltaDays` to a start/end pair.
 * - `move` shifts both, preserving duration.
 * - `resize-start` / `resize-end` move one edge and never let the job
 *   collapse below a single day.
 */
export function applyDrag(
  startIso: string,
  endIso: string,
  mode: DragMode,
  deltaDays: number,
): { start: string; end: string } {
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  if (mode === 'move') {
    return { start: toISODate(addDays(s, deltaDays)), end: toISODate(addDays(e, deltaDays)) };
  }
  if (mode === 'resize-start') {
    const next = addDays(s, deltaDays);
    return { start: toISODate(next > e ? e : next), end: endIso };
  }
  const next = addDays(e, deltaDays);
  return { start: startIso, end: toISODate(next < s ? s : next) };
}

// --- Upcoming jobs --------------------------------------------------------

export interface ScheduledJob {
  project: Project;
  /** Negative once the job has started. */
  startsInDays: number;
  /** Inclusive calendar length. */
  durationDays: number;
  /** Days until the end date; negative once it has run over. */
  endsInDays: number;
}

export interface JobBuckets {
  /** Started, not yet finished — sorted by finish date (soonest first). */
  onSite: ScheduledJob[];
  /** Not started yet, within the horizon — sorted by start date. */
  upcoming: ScheduledJob[];
  /** Starts beyond the horizon. */
  later: ScheduledJob[];
  /** Missing a start or end date, so they can't be plotted. */
  unscheduled: Project[];
}

/**
 * Split the non-archived projects into the buckets the "Upcoming jobs" panel
 * renders. `horizonDays` matches the current zoom, so the list answers the
 * same question the board is showing.
 */
export function bucketJobs(projects: Project[], today: Date, horizonDays: number): JobBuckets {
  const todayIso = toISODate(today);
  const buckets: JobBuckets = { onSite: [], upcoming: [], later: [], unscheduled: [] };

  for (const project of projects) {
    if (project.status === 'archived') continue;
    if (!project.start_date || !project.end_date) {
      buckets.unscheduled.push(project);
      continue;
    }
    const startsInDays = differenceInCalendarDays(parseISO(project.start_date), today);
    const endsInDays = differenceInCalendarDays(parseISO(project.end_date), today);
    const job: ScheduledJob = {
      project,
      startsInDays,
      endsInDays,
      durationDays:
        differenceInCalendarDays(parseISO(project.end_date), parseISO(project.start_date)) + 1,
    };
    if (project.end_date < todayIso) continue; // finished — not "upcoming"
    if (project.start_date <= todayIso) buckets.onSite.push(job);
    else if (startsInDays <= horizonDays) buckets.upcoming.push(job);
    else buckets.later.push(job);
  }

  buckets.onSite.sort((a, b) => a.endsInDays - b.endsInDays);
  buckets.upcoming.sort((a, b) => a.startsInDays - b.startsInDays);
  buckets.later.sort((a, b) => a.startsInDays - b.startsInDays);
  buckets.unscheduled.sort((a, b) => a.name.localeCompare(b.name));
  return buckets;
}

/**
 * Dates to drop an unscheduled job onto the board with: next Monday through
 * that Friday. A deliberate placeholder — the point is to get it on the board
 * so it can be dragged to where it really belongs.
 */
export function defaultSchedule(today: Date): { start: string; end: string } {
  const nextMonday = addDays(weekStart(today), 7);
  return { start: toISODate(nextMonday), end: toISODate(addDays(nextMonday, 4)) };
}

/** "in 3 days" / "starts tomorrow" / "started 2 days ago" */
export function relativeDayLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}
