/**
 * Turning a failed write into something the person at the other end can read.
 *
 * Two separate ways a save can go wrong without the user hearing about it:
 *
 * 1. supabase-js rejects with a `PostgrestError`, which is a plain object
 *    (`{ message, details, hint, code }`) and *not* an `Error` instance. Every
 *    `e instanceof Error ? e.message : 'Save failed'` in the app therefore
 *    threw away the database's message and showed the fallback instead.
 * 2. RLS filters the row out of an UPDATE / DELETE. PostgREST answers 204 with
 *    no error and zero rows changed, so a hook that only checks `error` toasts
 *    success over a write that never happened.
 */

/** The shape supabase-js rejects with. Kept local — it's structural. */
interface MessageLike {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Text for a toast, from whatever a failed call threw.
 *
 * Reads `message`, then `details`, then `hint` off anything object-shaped —
 * which covers both a real `Error` and a `PostgrestError` — and falls back to
 * the caller's wording when there's nothing useful to show.
 */
export function errorMessage(value: unknown, fallback = 'Something went wrong'): string {
  if (typeof value === 'string') return firstString(value) ?? fallback;
  if (value && typeof value === 'object') {
    const e = value as MessageLike;
    const text = firstString(e.message, e.details, e.hint);
    if (text) return text;
  }
  return fallback;
}

/**
 * Guard for an UPDATE / DELETE that came back clean but changed nothing.
 *
 * Every write hook asks for `.select('id')` so PostgREST returns the rows it
 * touched; an empty array means the statement matched no row the caller is
 * allowed to see — an RLS policy filtered it out, or it's already gone. Either
 * way nothing was written, and the UI must not claim otherwise.
 *
 * @param rows   what `.select(...)` returned
 * @param what   the thing being written, for the message ("scope", "time entry")
 * @param action `save` (default) or `delete`, so the message matches the verb
 */
export function assertRowsAffected(
  rows: unknown[] | null | undefined,
  what: string,
  action: 'save' | 'delete' = 'save',
): void {
  if (rows && rows.length > 0) return;
  throw new Error(
    action === 'delete'
      ? `Nothing was deleted — the ${what} is already gone, or you don't have permission to delete it.`
      : `Nothing was saved — the ${what} is no longer there, or you don't have permission to change it.`,
  );
}
