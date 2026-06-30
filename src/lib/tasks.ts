// Task-name helpers for the "how long does <task> take" benchmarking.
//
// Tasks are free text on `time_entries.task` (e.g. "Sanding windows", "Gap
// filling skirts"). To answer "how long does sanding a window generally take"
// we need names to aggregate cleanly across jobs. Two cheap layers do that:
//   1. PROACTIVE — the day-entry form suggests existing task names (most-logged
//      first) so the crew re-picks one spelling instead of retyping a variant.
//   2. RETROACTIVE — group on a normalized key (`taskKey`) that folds case,
//      punctuation and a trailing plural, so the few stragglers still merge.
// No task table — the pool IS the distinct task strings already logged.

import { normalize } from './fuzzyMatch';

/**
 * Trim + collapse internal whitespace; empty/whitespace-only -> null. This is
 * the ONLY transform applied before a task is written to the DB — the worker's
 * own spelling and casing are preserved for display.
 */
export function cleanTask(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
}

/**
 * Grouping key for aggregation: lowercase + strip punctuation + collapse
 * whitespace (via the shared `normalize`), then singularize a trailing plural
 * on the LAST word ("windows" -> "window", "skirts" -> "skirt"). Returns '' for
 * empty input — callers skip those. Kept deliberately conservative (no stemming)
 * so unrelated tasks never wrongly merge.
 */
export function taskKey(raw: string | null | undefined): string {
  const base = normalize(raw ?? '');
  if (!base) return '';
  const words = base.split(' ');
  const last = words[words.length - 1];
  // Only depluralize words long enough that a trailing 's' is a plural, not part
  // of a short root, and never an "ss" ending ("gas", "pass" stay intact).
  if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(' ');
}

/**
 * Distinct task names already logged — the canonical (most-frequent) spelling
 * per key, ranked by how often the crew logs them. Powers the day-entry
 * type-ahead. `limit` keeps a phone datalist snappy.
 */
export function taskSuggestions(
  tasks: Array<string | null | undefined>,
  limit = 30,
): string[] {
  const groups = new Map<string, { spellings: Map<string, number>; total: number }>();
  for (const raw of tasks) {
    const display = cleanTask(raw);
    if (!display) continue;
    const key = taskKey(display);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), total: 0 };
    g.spellings.set(display, (g.spellings.get(display) ?? 0) + 1);
    g.total += 1;
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .sort((a, b) => b.total - a.total)
    .map((g) => mostFrequent(g.spellings))
    .slice(0, limit);
}

/**
 * The key with the highest count. Ties break lexicographically (by code unit)
 * so the chosen spelling is deterministic — independent of row/insertion order,
 * which otherwise depends on the dataset and would flip the report label + its
 * React key between renders.
 */
export function mostFrequent(counts: Map<string, number>): string {
  let best = '';
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN || (n === bestN && k < best)) {
      best = k;
      bestN = n;
    }
  }
  return best;
}
