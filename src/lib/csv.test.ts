import { describe, expect, it } from 'vitest';
import { slugify, toCSV, variationWorksheetCSV } from './csv';
import type { VariationLine } from './aggregations';

describe('toCSV', () => {
  it('renders header and rows', () => {
    const out = toCSV(
      [
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
      ],
      ['a', 'b'],
    );
    expect(out).toBe('a,b\n1,x\n2,y');
  });

  it('escapes commas and quotes', () => {
    const out = toCSV([{ a: 'hello, world', b: 'she said "hi"' }], ['a', 'b']);
    expect(out).toBe('a,b\n"hello, world","she said ""hi"""');
  });

  it('handles null/undefined', () => {
    const out = toCSV(
      [{ a: null, b: undefined }] as unknown as Record<string, unknown>[],
      ['a', 'b'],
    );
    expect(out).toBe('a,b\n,');
  });

  // The payroll-integrity edge cases — Gavin will type apostrophes into
  // notes, suppliers will have commas in their legal names, and a task
  // description that runs across lines will hit Excel's CR/LF parser.
  // All three must round-trip clean.

  it('preserves apostrophes (e.g. O\'Brien) un-quoted', () => {
    const out = toCSV([{ name: "O'Brien" }], ['name']);
    expect(out).toBe('name\nO\'Brien');
  });

  it('quotes a task value containing a comma', () => {
    const out = toCSV([{ task: 'paint, undercoat' }], ['task']);
    expect(out).toBe('task\n"paint, undercoat"');
  });

  it('quotes a value containing a newline', () => {
    const out = toCSV([{ notes: 'line1\nline2' }], ['notes']);
    expect(out).toBe('notes\n"line1\nline2"');
  });

  it('quotes a value containing a carriage return', () => {
    const out = toCSV([{ notes: 'line1\rline2' }], ['notes']);
    expect(out).toBe('notes\n"line1\rline2"');
  });

  it('numeric values render unquoted', () => {
    const out = toCSV([{ hours: 4.5, rate: 65 }], ['hours', 'rate']);
    expect(out).toBe('hours,rate\n4.5,65');
  });
});

describe('variationWorksheetCSV', () => {
  const lines: VariationLine[] = [
    { id: 't1', date: '2026-08-11', workerId: 'w1', workerName: 'Jerry',  task: 'Prep + patch',  notes: null, hours: 6,   cost: 180, revenue: 390 },
    { id: 't2', date: '2026-08-12', workerId: 'w2', workerName: 'Pierce', task: 'Two coats',     notes: null, hours: 4.5, cost: 157.5, revenue: 292.5 },
  ];

  it('gives the manager date/worker/task/hours and no money', () => {
    const out = variationWorksheetCSV(lines, false);
    expect(out).toBe(
      'date,worker,task,hours\n' +
        '2026-08-11,Jerry,Prep + patch,6.00\n' +
        '2026-08-12,Pierce,Two coats,4.50\n' +
        'TOTAL,,,10.50',
    );
    expect(out).not.toContain('390');
  });

  it('gives the admin rate and amount columns', () => {
    const out = variationWorksheetCSV(lines, true);
    expect(out.split('\n')[0]).toBe('date,worker,task,hours,rate,amount');
    expect(out).toContain('2026-08-11,Jerry,Prep + patch,6.00,65.00,390.00');
    expect(out.split('\n').at(-1)).toBe('TOTAL,,,10.50,,682.50');
  });

  it('falls back to notes when a line has no task label', () => {
    const out = variationWorksheetCSV(
      [{ ...lines[0], task: null, notes: 'Made good after the sparky' }],
      false,
    );
    expect(out).toContain('Made good after the sparky');
  });

  it('handles a zero-hour line without dividing by zero', () => {
    const out = variationWorksheetCSV(
      [{ ...lines[0], hours: 0, cost: 0, revenue: 0 }],
      true,
    );
    expect(out).toContain('0.00,0.00');
    expect(out).not.toContain('NaN');
  });
});

describe('slugify', () => {
  it('makes a filename-safe slug', () => {
    expect(slugify('Sick bay — repaint walls + trim')).toBe('sick-bay-repaint-walls-trim');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  ...Corridor B!  ')).toBe('corridor-b');
  });

  it('falls back rather than producing an empty filename', () => {
    expect(slugify('!!!')).toBe('export');
  });
});
