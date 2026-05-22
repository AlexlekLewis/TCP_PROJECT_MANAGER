import { describe, expect, it } from 'vitest';
import { DAILY_HOURS_HARD_CAP, formatHours, hoursToDays, labourCost, validateHours } from './hours';

describe('formatHours', () => {
  it('formats round numbers', () => {
    expect(formatHours(8)).toBe('8h');
  });
  it('formats fractional', () => {
    expect(formatHours(4.5)).toBe('4.5h');
  });
  it('returns em-dash for null', () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(undefined)).toBe('—');
  });
});

describe('hoursToDays', () => {
  it('uses default 7.6h/day', () => {
    expect(hoursToDays(7.6)).toBeCloseTo(1);
    expect(hoursToDays(15.2)).toBeCloseTo(2);
  });
  it('handles zero safely', () => {
    expect(hoursToDays(0)).toBe(0);
  });
});

describe('labourCost', () => {
  it('multiplies and rounds to 2dp', () => {
    expect(labourCost(3, 45)).toBe(135);
    expect(labourCost(4.5, 55.5)).toBe(249.75);
  });
});

describe('validateHours', () => {
  it('rejects zero and negative', () => {
    expect(validateHours(0).ok).toBe(false);
    expect(validateHours(-1).ok).toBe(false);
  });
  it('rejects above hard cap', () => {
    expect(validateHours(DAILY_HOURS_HARD_CAP + 0.1).ok).toBe(false);
  });
  it('warns above soft cap', () => {
    const r = validateHours(12);
    expect(r.ok).toBe(true);
    expect(r.warning).toBeTruthy();
  });
  it('accepts normal day', () => {
    const r = validateHours(8);
    expect(r.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });
});
