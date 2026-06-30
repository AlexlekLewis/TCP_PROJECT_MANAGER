import { describe, expect, it } from 'vitest';
import { cleanTask, mostFrequent, taskKey, taskSuggestions } from './tasks';

describe('cleanTask', () => {
  it('trims + collapses internal whitespace', () => {
    expect(cleanTask('  Sanding   windows ')).toBe('Sanding windows');
    expect(cleanTask('a   b')).toBe('a b');
  });
  it('returns null for empty / whitespace / nullish', () => {
    expect(cleanTask(null)).toBe(null);
    expect(cleanTask(undefined)).toBe(null);
    expect(cleanTask('')).toBe(null);
    expect(cleanTask('   ')).toBe(null);
  });
});

describe('taskKey', () => {
  it('folds case + punctuation and singularizes the last word', () => {
    expect(taskKey('Sanding windows')).toBe('sanding window');
    expect(taskKey('sanding window')).toBe('sanding window');
    expect(taskKey('Gap filling skirts')).toBe('gap filling skirt');
    expect(taskKey('Ceilings')).toBe('ceiling');
    expect(taskKey('Trims!')).toBe('trim');
  });
  it('does NOT depluralize "ss" endings or short roots', () => {
    expect(taskKey('Glass')).toBe('glass');
    expect(taskKey('pass')).toBe('pass');
    expect(taskKey('access')).toBe('access');
    expect(taskKey('gas')).toBe('gas');
    expect(taskKey('bus')).toBe('bus');
  });
  it('returns "" for empty / whitespace / punctuation-only', () => {
    expect(taskKey('')).toBe('');
    expect(taskKey('   ')).toBe('');
    expect(taskKey('!!!')).toBe('');
    expect(taskKey(null)).toBe('');
  });
});

describe('mostFrequent', () => {
  it('returns the highest-count key', () => {
    expect(mostFrequent(new Map([['a', 1], ['b', 3], ['c', 2]]))).toBe('b');
  });
  it('breaks ties deterministically, independent of insertion order', () => {
    const a = mostFrequent(new Map([['Sanding window', 1], ['sanding window', 1]]));
    const b = mostFrequent(new Map([['sanding window', 1], ['Sanding window', 1]]));
    expect(a).toBe(b);
    expect(a).toBe('Sanding window'); // uppercase sorts before lowercase by code unit
  });
});

describe('taskSuggestions', () => {
  it('returns canonical spellings ranked by frequency, deduped by key', () => {
    const out = taskSuggestions([
      'Sanding windows',
      'Sanding windows',
      'sanding window', // folds into the group above -> total 3
      'Gap filling skirts',
      'Gap filling skirts', // total 2
      'Ceilings', // total 1
      null,
      '   ',
    ]);
    expect(out).toEqual(['Sanding windows', 'Gap filling skirts', 'Ceilings']);
  });
  it('caps the list to the limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => `task ${i}`);
    expect(taskSuggestions(many, 30)).toHaveLength(30);
  });
});
