import { describe, expect, it } from 'vitest';
import { formatDate, toISODate, weekDays, weekEnd, weekStart } from './dates';

describe('weekStart / weekEnd', () => {
  it('week starts on Monday', () => {
    // Wed 2026-04-22
    const d = new Date('2026-04-22T12:00:00');
    expect(toISODate(weekStart(d))).toBe('2026-04-20');
    expect(toISODate(weekEnd(d))).toBe('2026-04-26');
  });
  it('handles ISO string input', () => {
    expect(toISODate(weekStart('2026-04-22'))).toBe('2026-04-20');
  });
});

describe('weekDays', () => {
  it('returns 7 dates Mon..Sun', () => {
    const days = weekDays('2026-04-22');
    expect(days).toHaveLength(7);
    expect(toISODate(days[0])).toBe('2026-04-20');
    expect(toISODate(days[6])).toBe('2026-04-26');
  });
});

describe('formatDate', () => {
  it('formats short', () => {
    expect(formatDate('2026-04-22')).toMatch(/Apr/);
  });
});
