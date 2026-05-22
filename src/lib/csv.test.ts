import { describe, expect, it } from 'vitest';
import { toCSV } from './csv';

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
