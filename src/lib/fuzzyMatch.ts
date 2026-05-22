// Lightweight fuzzy matcher for mapping Claude's free-text worker/project names
// to database rows. Prefers exact lowercased match, falls back to Levenshtein.

export interface Named {
  id: string;
  name: string;
}

export interface MatchResult<T extends Named> {
  match: T | null;
  confidence: number; // 0..1
  candidates: Array<{ item: T; score: number }>;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Iterative Levenshtein
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return curr[b.length];
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na.length && !nb.length) return 1;
  if (!na.length || !nb.length) return 0;
  if (na === nb) return 1;
  // Contains-bonus: "Preston High" matches "Preston High School"
  if (na.includes(nb) || nb.includes(na)) {
    const minLen = Math.min(na.length, nb.length);
    const maxLen = Math.max(na.length, nb.length);
    // Soft penalty for length mismatch — a fully contained shorter query gets ~0.85+
    return 1 - 0.3 * (1 - minLen / maxLen);
  }
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - d / maxLen;
}

export function fuzzyMatch<T extends Named>(
  query: string,
  candidates: T[],
  minConfidence = 0.6,
): MatchResult<T> {
  const scored = candidates
    .map((item) => ({ item, score: similarity(query, item.name) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score < minConfidence) {
    return { match: null, confidence: top?.score ?? 0, candidates: scored };
  }
  return { match: top.item, confidence: top.score, candidates: scored };
}
