import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
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
} from './schedule';
import type { Project } from '@/types/db';

const project = (over: Partial<Project> & { id: string }): Project => ({
  name: over.id,
  client_name: null,
  address: null,
  quoted_price: null,
  quoted_hours: null,
  materials_budget: null,
  daily_hours_warning: null,
  target_profit: null,
  quote_type: 'fixed_quote',
  needs_admin_review: false,
  status: 'active',
  color_tag: null,
  start_date: null,
  end_date: null,
  notes: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
});

describe('scales', () => {
  it('are whole weeks so Monday gridlines stay true', () => {
    for (const s of ['30d', '60d', '6m', '12m'] as const) {
      expect(getScale(s).days % 7).toBe(0);
    }
  });

  it('falls back to the shortest scale for an unknown id', () => {
    expect(getScale('nope' as never).id).toBe('30d');
  });
});

describe('buildMonthBands', () => {
  // 2026-06-01 is a Monday.
  const start = parseISO('2026-06-01');

  it('covers the window exactly once', () => {
    const bands = buildMonthBands(start, 63);
    const total = bands.reduce((s, b) => s + b.widthPct, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(bands[0].leftPct).toBe(0);
  });

  it('splits at month boundaries', () => {
    const bands = buildMonthBands(start, 63); // Jun 1 – Aug 2
    expect(bands.map((b) => b.label)).toEqual(['June 2026', 'July 2026', 'Aug']);
  });

  it('drops to short labels when the bands get narrow', () => {
    // A 12-month window: each month is ~8% of the track, so "September 2026"
    // would only truncate.
    const bands = buildMonthBands(parseISO('2026-09-01'), 364);
    expect(bands[0].label).toBe("Sep '26");
    expect(bands[1].label).toBe('Oct');
    // The year is carried again at the January rollover.
    expect(bands.find((b) => b.key.startsWith('2027-01'))?.label).toBe("Jan '27");
  });

  it('starts mid-month without leaking days before the window', () => {
    const bands = buildMonthBands(parseISO('2026-06-15'), 30);
    expect(bands[0].leftPct).toBe(0);
    // Jun 15–30 is 16 of the 30 days.
    expect(bands[0].widthPct).toBeCloseTo((16 / 30) * 100, 5);
  });
});

describe('buildTicks', () => {
  const start = parseISO('2026-06-01'); // Monday

  it('emits one column per day at day scale and flags weekends', () => {
    const ticks = buildTicks(start, 14, 'day');
    expect(ticks).toHaveLength(14);
    expect(ticks.filter((t) => t.weekend)).toHaveLength(4);
    expect(ticks[0].label).toBe('1');
  });

  it('emits one column per Monday at week scale', () => {
    const ticks = buildTicks(start, 63, 'week');
    expect(ticks).toHaveLength(9);
    expect(ticks[0].label).toBe('1 Jun');
    expect(ticks[1].label).toBe('8 Jun');
  });

  it('returns nothing at month scale — the month bands are the grid', () => {
    expect(buildTicks(start, 364, 'month')).toEqual([]);
  });

  it('never runs a tick past the end of the window', () => {
    const ticks = buildTicks(start, 10, 'week');
    const total = ticks.reduce((s, t) => s + t.widthPct, 0);
    expect(total).toBeCloseTo(100, 5);
  });
});

describe('barGeometry', () => {
  const start = parseISO('2026-06-01');

  it('places a bar inside the window inclusively', () => {
    const g = barGeometry('2026-06-01', '2026-06-07', start, 35);
    expect(g.leftPct).toBe(0);
    expect(g.widthPct).toBeCloseTo((7 / 35) * 100, 5); // 7 days inclusive
    expect(g.clippedStart).toBe(false);
    expect(g.clippedEnd).toBe(false);
  });

  it('gives a single day a one-day width, not zero', () => {
    const g = barGeometry('2026-06-10', '2026-06-10', start, 35);
    expect(g.widthPct).toBeCloseTo((1 / 35) * 100, 5);
  });

  it('clips a job that started before the window', () => {
    const g = barGeometry('2026-05-01', '2026-06-05', start, 35);
    expect(g.leftPct).toBe(0);
    expect(g.clippedStart).toBe(true);
    expect(g.clippedEnd).toBe(false);
  });

  it('clips a job running past the right edge', () => {
    const g = barGeometry('2026-06-20', '2026-12-01', start, 35);
    expect(g.clippedEnd).toBe(true);
    expect(g.leftPct + g.widthPct).toBeCloseTo(100, 5);
  });
});

describe('overlapsWindow', () => {
  const start = parseISO('2026-06-01'); // 35-day window → ends 2026-07-05

  it('includes a job touching only the last day', () => {
    expect(overlapsWindow('2026-07-05', '2026-08-01', start, 35)).toBe(true);
  });

  it('includes a job touching only the first day', () => {
    expect(overlapsWindow('2026-01-01', '2026-06-01', start, 35)).toBe(true);
  });

  it('excludes jobs entirely outside', () => {
    expect(overlapsWindow('2026-07-06', '2026-08-01', start, 35)).toBe(false);
    expect(overlapsWindow('2026-04-01', '2026-05-31', start, 35)).toBe(false);
  });
});

describe('daysFromPx', () => {
  it('converts pixels to days at day granularity', () => {
    // 350px / 35 days = 10px per day
    expect(daysFromPx(100, 350, 35, 1)).toBe(10);
    expect(daysFromPx(-100, 350, 35, 1)).toBe(-10);
    expect(daysFromPx(4, 350, 35, 1)).toBe(0);
  });

  it('snaps to whole weeks on coarse scales', () => {
    // 364px / 364 days = 1px per day
    expect(daysFromPx(10, 364, 364, 7)).toBe(7);
    expect(daysFromPx(3, 364, 364, 7)).toBe(0);
    expect(daysFromPx(-11, 364, 364, 7)).toBe(-14);
  });

  it('returns 0 before the track has been measured', () => {
    expect(daysFromPx(120, 0, 35, 1)).toBe(0);
  });
});

describe('applyDrag', () => {
  it('move preserves duration', () => {
    const r = applyDrag('2026-06-01', '2026-06-10', 'move', 5);
    expect(r).toEqual({ start: '2026-06-06', end: '2026-06-15' });
  });

  it('resize-start moves only the left edge', () => {
    expect(applyDrag('2026-06-01', '2026-06-10', 'resize-start', 3)).toEqual({
      start: '2026-06-04',
      end: '2026-06-10',
    });
  });

  it('resize-end moves only the right edge', () => {
    expect(applyDrag('2026-06-01', '2026-06-10', 'resize-end', -3)).toEqual({
      start: '2026-06-01',
      end: '2026-06-07',
    });
  });

  it('never lets a resize invert the job', () => {
    expect(applyDrag('2026-06-01', '2026-06-10', 'resize-start', 99).start).toBe('2026-06-10');
    expect(applyDrag('2026-06-01', '2026-06-10', 'resize-end', -99).end).toBe('2026-06-01');
  });

  it('is a no-op at zero delta', () => {
    expect(applyDrag('2026-06-01', '2026-06-10', 'move', 0)).toEqual({
      start: '2026-06-01',
      end: '2026-06-10',
    });
  });
});

describe('bucketJobs', () => {
  const today = parseISO('2026-06-15');
  const projects = [
    project({ id: 'running', start_date: '2026-06-10', end_date: '2026-06-20' }),
    project({ id: 'running-late', start_date: '2026-06-01', end_date: '2026-06-30' }),
    project({ id: 'starts-today', start_date: '2026-06-15', end_date: '2026-06-25' }),
    project({ id: 'soon', start_date: '2026-06-22', end_date: '2026-06-30' }),
    project({ id: 'later', start_date: '2026-11-02', end_date: '2026-11-20' }),
    project({ id: 'done', start_date: '2026-05-01', end_date: '2026-06-14' }),
    project({ id: 'no-dates' }),
    project({ id: 'archived', status: 'archived', start_date: '2026-06-22', end_date: '2026-06-30' }),
  ];

  const b = bucketJobs(projects, today, 35);

  it('counts a job starting today as on site', () => {
    expect(b.onSite.map((j) => j.project.id)).toEqual(['running', 'starts-today', 'running-late']);
  });

  it('sorts on-site jobs by soonest finish', () => {
    expect(b.onSite[0].project.id).toBe('running');
  });

  it('puts jobs inside the horizon in upcoming and the rest in later', () => {
    expect(b.upcoming.map((j) => j.project.id)).toEqual(['soon']);
    expect(b.later.map((j) => j.project.id)).toEqual(['later']);
  });

  it('drops finished jobs entirely', () => {
    const all = [...b.onSite, ...b.upcoming, ...b.later].map((j) => j.project.id);
    expect(all).not.toContain('done');
  });

  it('excludes archived projects from every bucket', () => {
    const all = [...b.onSite, ...b.upcoming, ...b.later].map((j) => j.project.id);
    expect(all).not.toContain('archived');
    expect(b.unscheduled.map((p) => p.id)).not.toContain('archived');
  });

  it('collects date-less projects as unscheduled', () => {
    expect(b.unscheduled.map((p) => p.id)).toEqual(['no-dates']);
  });

  it('reports inclusive duration and relative offsets', () => {
    const soon = b.upcoming[0];
    expect(soon.startsInDays).toBe(7);
    expect(soon.durationDays).toBe(9); // 22nd–30th inclusive
  });

  it('treats a project missing only an end date as unscheduled', () => {
    const b2 = bucketJobs([project({ id: 'half', start_date: '2026-06-20' })], today, 35);
    expect(b2.unscheduled.map((p) => p.id)).toEqual(['half']);
  });
});

describe('defaultSchedule', () => {
  it('drops an unscheduled job on next Mon–Fri', () => {
    // 2026-06-17 is a Wednesday.
    expect(defaultSchedule(parseISO('2026-06-17'))).toEqual({
      start: '2026-06-22',
      end: '2026-06-26',
    });
  });

  it('still moves a full week ahead when today is a Monday', () => {
    expect(defaultSchedule(parseISO('2026-06-15')).start).toBe('2026-06-22');
  });
});

describe('relativeDayLabel', () => {
  it('reads naturally either side of today', () => {
    expect(relativeDayLabel(0)).toBe('today');
    expect(relativeDayLabel(1)).toBe('tomorrow');
    expect(relativeDayLabel(-1)).toBe('yesterday');
    expect(relativeDayLabel(9)).toBe('in 9 days');
    expect(relativeDayLabel(-4)).toBe('4 days ago');
  });
});
