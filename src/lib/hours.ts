export const DAILY_HOURS_HARD_CAP = 14;
export const DAILY_HOURS_WARN = 10;
export const DEFAULT_HOURS_PER_DAY = 7.6;

export function formatHours(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n.toFixed(2))}h`;
}

export function hoursToDays(hours: number, hoursPerDay = DEFAULT_HOURS_PER_DAY): number {
  if (!hours || !hoursPerDay) return 0;
  return hours / hoursPerDay;
}

export function labourCost(hours: number, rate: number): number {
  return Math.round(hours * rate * 100) / 100;
}

export interface HoursValidation {
  ok: boolean;
  warning?: string;
  error?: string;
}

export function validateHours(hours: number): HoursValidation {
  if (Number.isNaN(hours) || hours <= 0) return { ok: false, error: 'Hours must be greater than 0' };
  if (hours > DAILY_HOURS_HARD_CAP) return { ok: false, error: `Hours cannot exceed ${DAILY_HOURS_HARD_CAP}` };
  if (hours > DAILY_HOURS_WARN) {
    return { ok: true, warning: `${hours}h is above the ${DAILY_HOURS_WARN}h warning threshold` };
  }
  return { ok: true };
}
