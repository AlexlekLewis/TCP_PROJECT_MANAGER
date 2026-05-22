const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 2,
});

const AUD_WHOLE = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

export function formatCurrency(n: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return '—';
  return opts.whole ? AUD_WHOLE.format(n) : AUD.format(n);
}

export function parseCurrency(input: string): number | null {
  const stripped = input.replace(/[^0-9.-]/g, '');
  if (!stripped) return null;
  const n = Number.parseFloat(stripped);
  return Number.isFinite(n) ? n : null;
}
