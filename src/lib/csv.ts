// CSV export helpers. Generic format that opens cleanly in Excel + Google Sheets.

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
