import { describe, expect, it } from 'vitest';
import { assertRowsAffected, errorMessage } from './errors';

describe('errorMessage', () => {
  it('reads a real Error', () => {
    expect(errorMessage(new Error('Hours cannot exceed 14'))).toBe('Hours cannot exceed 14');
  });

  it('reads a PostgrestError, which is not an Error instance', () => {
    // The exact shape supabase-js rejects with — the case the dialogs missed.
    const pgError = {
      message: 'new row violates row-level security policy for table "project_variations"',
      details: null,
      hint: null,
      code: '42501',
    };
    expect(pgError instanceof Error).toBe(false);
    expect(errorMessage(pgError, 'Save failed')).toBe(
      'new row violates row-level security policy for table "project_variations"',
    );
  });

  it('falls back to details, then hint, when there is no message', () => {
    expect(errorMessage({ message: '', details: 'Key (id)=(abc) is not present' })).toBe(
      'Key (id)=(abc) is not present',
    );
    expect(errorMessage({ message: null, details: null, hint: 'Try again once unlocked' })).toBe(
      'Try again once unlocked',
    );
  });

  it('passes a plain string through', () => {
    expect(errorMessage('Week is locked')).toBe('Week is locked');
  });

  it('trims surrounding whitespace', () => {
    expect(errorMessage({ message: '  permission denied  ' })).toBe('permission denied');
  });

  it('uses the fallback for anything with nothing readable on it', () => {
    expect(errorMessage(null, 'Save failed')).toBe('Save failed');
    expect(errorMessage(undefined, 'Save failed')).toBe('Save failed');
    expect(errorMessage({}, 'Save failed')).toBe('Save failed');
    expect(errorMessage('', 'Save failed')).toBe('Save failed');
    expect(errorMessage('   ', 'Save failed')).toBe('Save failed');
    expect(errorMessage(404, 'Save failed')).toBe('Save failed');
    // A non-string `message` isn't text and must not be shown as one.
    expect(errorMessage({ message: { nested: true } }, 'Save failed')).toBe('Save failed');
  });

  it('has a fallback of its own', () => {
    expect(errorMessage(null)).toBe('Something went wrong');
  });
});

describe('assertRowsAffected', () => {
  it('passes when the write returned a row', () => {
    expect(() => assertRowsAffected([{ id: 'abc' }], 'scope')).not.toThrow();
  });

  it('throws when RLS filtered the row out (0 rows, no error)', () => {
    expect(() => assertRowsAffected([], 'scope')).toThrow(/Nothing was saved/);
    expect(() => assertRowsAffected([], 'scope')).toThrow(/permission/);
  });

  it('throws on a null body', () => {
    expect(() => assertRowsAffected(null, 'time entry')).toThrow(/time entry/);
    expect(() => assertRowsAffected(undefined, 'time entry')).toThrow(/time entry/);
  });

  it('words a failed delete as a delete', () => {
    expect(() => assertRowsAffected([], 'schedule part', 'delete')).toThrow(
      'Nothing was deleted — the schedule part is already gone, or you don\'t have permission to delete it.',
    );
  });

  it('throws an Error, so errorMessage can read it back', () => {
    try {
      assertRowsAffected([], 'variation');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(errorMessage(e, 'Save failed')).toMatch(/Nothing was saved — the variation/);
    }
  });
});
