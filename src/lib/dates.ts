import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  formatISO,
  isAfter,
  isBefore,
  parseISO,
  startOfWeek,
} from 'date-fns';

const WEEK_OPTS = { weekStartsOn: 1 as const }; // Monday

export function toISODate(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return formatISO(date, { representation: 'date' });
}

export function weekStart(d: Date | string): Date {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return startOfWeek(date, WEEK_OPTS);
}

export function weekEnd(d: Date | string): Date {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return endOfWeek(date, WEEK_OPTS);
}

export function weekDays(d: Date | string): Date[] {
  const start = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDay(d: Date | string, pattern = 'EEE d MMM'): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return format(date, pattern);
}

export function formatDate(d: Date | string, pattern = 'd MMM yyyy'): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return format(date, pattern);
}

export function isDateInFuture(d: Date | string): boolean {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return isAfter(date, new Date());
}

export function isDateInPast(d: Date | string, daysAgo = 0): boolean {
  const date = typeof d === 'string' ? parseISO(d) : d;
  const threshold = addDays(new Date(), -daysAgo);
  return isBefore(date, threshold);
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === 'string' ? parseISO(a) : a;
  const d2 = typeof b === 'string' ? parseISO(b) : b;
  return Math.abs(differenceInCalendarDays(d1, d2));
}

export function weekLabel(weekStartDate: Date | string): string {
  const start = typeof weekStartDate === 'string' ? parseISO(weekStartDate) : weekStartDate;
  const end = endOfWeek(start, WEEK_OPTS);
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}
