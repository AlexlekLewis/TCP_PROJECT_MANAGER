// CSV export helpers. Generic format that opens cleanly in Excel + Google Sheets.

import type { VariationLine } from './aggregations';

function escapeField(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV<T extends Record<string, unknown>>(rows: T[], headers: Array<keyof T & string>): string {
  const headerLine = headers.map(escapeField).join(',');
  const body = rows.map((r) => headers.map((h) => escapeField(r[h])).join(',')).join('\n');
  return `${headerLine}\n${body}`;
}

/**
 * Variation worksheet — the itemised record of work done against one client
 * variation, in a form that can go out with an invoice or answer "what exactly
 * am I being charged for?".
 *
 * `withMoney` follows the app's central permission split: admin gets the rate
 * and dollar columns, the manager gets date/worker/task/hours only. Same rule
 * as the payroll export on the Reports page.
 */
export function variationWorksheetCSV(
  lines: VariationLine[],
  withMoney: boolean,
): string {
  type Row = { date: string; worker: string; task: string; hours: string; rate: string; amount: string };
  const headers: Array<keyof Row & string> = withMoney
    ? ['date', 'worker', 'task', 'hours', 'rate', 'amount']
    : ['date', 'worker', 'task', 'hours'];

  const rows: Row[] = lines.map((l) => ({
    date: l.date,
    worker: l.workerName,
    task: l.task ?? l.notes ?? '',
    hours: l.hours.toFixed(2),
    rate: l.hours > 0 ? (l.revenue / l.hours).toFixed(2) : '0.00',
    amount: l.revenue.toFixed(2),
  }));

  const totalHours = lines.reduce((s, l) => s + l.hours, 0);
  const totalRevenue = lines.reduce((s, l) => s + l.revenue, 0);
  rows.push({
    date: 'TOTAL',
    worker: '',
    task: '',
    hours: totalHours.toFixed(2),
    rate: '',
    amount: totalRevenue.toFixed(2),
  });

  return toCSV(rows, headers);
}

/** Filename-safe slug — "Sick bay — repaint walls" → "sick-bay-repaint-walls". */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'export'
  );
}

export function downloadCSV(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
