// Takes raw Claude tool output and resolves worker/project names to IDs via
// fuzzy matching. Surfaces unresolved rows for the review screen.

import { fuzzyMatch } from './fuzzyMatch';
import type { ParsedEntry, ParsedMaterial, ParsedVoiceResult } from '@/types/db';

export interface ResolvedEntry extends ParsedEntry {
  worker_id: string | null;
  project_id: string | null;
  resolution_confidence: number; // 0..1 for the name match
  needs_review: boolean;
}

export interface ResolvedMaterial extends ParsedMaterial {
  project_id: string | null;
  resolution_confidence: number;
  needs_review: boolean;
}

export interface ResolvedVoiceResult {
  entries: ResolvedEntry[];
  materials: ResolvedMaterial[];
  unresolved: string[];
}

export function resolveParsedVoice(
  parsed: ParsedVoiceResult,
  workers: Array<{ id: string; name: string }>,
  projects: Array<{ id: string; name: string }>,
): ResolvedVoiceResult {
  const entries: ResolvedEntry[] = parsed.entries.map((e) => {
    const w = fuzzyMatch(e.worker_name, workers, 0.6);
    const p = fuzzyMatch(e.project_name, projects, 0.6);
    const resolutionConfidence = Math.min(w.confidence, p.confidence);
    return {
      ...e,
      worker_id: w.match?.id ?? null,
      project_id: p.match?.id ?? null,
      resolution_confidence: resolutionConfidence,
      needs_review: !w.match || !p.match || e.confidence < 0.9 || resolutionConfidence < 0.9,
    };
  });

  const materials: ResolvedMaterial[] = parsed.materials.map((m) => {
    const p = fuzzyMatch(m.project_name, projects, 0.6);
    return {
      ...m,
      project_id: p.match?.id ?? null,
      resolution_confidence: p.confidence,
      needs_review: !p.match || m.confidence < 0.9 || p.confidence < 0.9,
    };
  });

  return { entries, materials, unresolved: parsed.unresolved };
}
