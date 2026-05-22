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
    const out = toCSV([{ a: null, b: undefined }] as unknown as Record<string, unknown>[], ['a', 'b']);
    expect(out).toBe('a,b\n,');
  });
});
