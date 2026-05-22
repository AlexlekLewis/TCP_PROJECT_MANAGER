import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  formatDate,
  formatDay,
  isDateInFuture,
  isDateInPast,
  toISODate,
  weekDays,
  weekEnd,
  weekLabel,
  weekStart,
} from './dates';

describe('weekStart — AU Monday-first', () => {
  it('returns the Monday for a midweek date', () => {
    // 2026-05-22 is a Friday → Mon = 2026-05-18
    expect(toISODate(weekStart('2026-05-22'))).toBe('2026-05-18');
  });

  it('returns the same date when called on a Monday', () => {
    expect(toISODate(weekStart('2026-05-18'))).toBe('2026-05-18');
  });

  it('returns the prior Monday when called on a Sunday', () => {
    // 2026-05-24 is a Sunday → Mon = 2026-05-18 (NOT 2026-05-25)
    expect(toISODate(weekStart('2026-05-24'))).toBe('2026-05-18');
  });

  it('handles year-boundary weeks', () => {
    // 2026-01-01 is a Thursday → Mon = 2025-12-29
    expect(toISODate(weekStart('2026-01-01'))).toBe('2025-12-29');
  });
});

describe('weekEnd', () => {
  it('returns Sunday for a Monday week_start', () => {
    expect(toISODate(weekEnd('2026-05-18'))).toBe('2026-05-24');
  });
});

describe('weekDays', () => {
  it('returns 7 dates Mon..Sun in order', () => {
    const days = weekDays('2026-05-22').map(toISODate);
    expect(days).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ]);
  });
});

describe('formatDay / formatDate / weekLabel', () => {
  it('formats short day label', () => {
    expect(formatDay('2026-05-22')).toMatch(/Fri/);
  });
  it('formats full date', () => {
    expect(formatDate('2026-05-22')).toMatch(/May/);
    expect(formatDate('2026-05-22')).toMatch(/2026/);
  });
  it('renders a week label spanning two days/months when needed', () => {
    const label = weekLabel('2025-12-29'); // → spans into 2026
    expect(label).toMatch(/Dec/);
    expect(label).toMatch(/2026/);
  });
});

describe('isDateInFuture / isDateInPast / daysBetween', () => {
  it('isDateInFuture rejects today and past', () => {
    const today = toISODate(new Date());
    expect(isDateInFuture(today)).toBe(false);
  });
  it('isDateInPast respects threshold offset', () => {
    expect(isDateInPast('2020-01-01', 0)).toBe(true);
  });
  it('daysBetween returns absolute calendar-day distance', () => {
    expect(daysBetween('2026-05-22', '2026-05-25')).toBe(3);
    expect(daysBetween('2026-05-25', '2026-05-22')).toBe(3);
    expect(daysBetween('2026-05-22', '2026-05-22')).toBe(0);
  });
});
