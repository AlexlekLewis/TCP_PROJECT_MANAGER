import { describe, expect, it } from 'vitest';
import { fuzzyMatch, levenshtein, similarity } from './fuzzyMatch';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('jerry', 'jerry')).toBe(0);
  });
  it('returns length for empty other', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
  it('counts single-char edits', () => {
    expect(levenshtein('jerry', 'jerrt')).toBe(1);
    expect(levenshtein('gavin', 'kavin')).toBe(1);
  });
});

describe('similarity', () => {
  it('is 1 for exact normalised match', () => {
    expect(similarity('Jerry', 'jerry')).toBe(1);
    expect(similarity(' JERRY!', 'jerry')).toBe(1);
  });
  it('rewards substring containment', () => {
    expect(similarity('Preston High', 'Preston High School')).toBeGreaterThan(0.7);
  });
  it('distinguishes different names', () => {
    expect(similarity('Jerry', 'Pierce')).toBeLessThan(0.5);
  });
});

describe('fuzzyMatch', () => {
  const workers = [
    { id: 'j', name: 'Jerry' },
    { id: 'p', name: 'Pierce' },
    { id: 'g', name: 'Gavin' },
    { id: 'a', name: 'Alex' },
  ];

  it('matches exact name', () => {
    const r = fuzzyMatch('Jerry', workers);
    expect(r.match?.id).toBe('j');
    expect(r.confidence).toBe(1);
  });

  it('matches misspelled name when close', () => {
    const r = fuzzyMatch('Jery', workers);
    expect(r.match?.id).toBe('j');
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it('returns null when nothing is close', () => {
    const r = fuzzyMatch('Montgomery', workers, 0.8);
    expect(r.match).toBeNull();
  });
});
