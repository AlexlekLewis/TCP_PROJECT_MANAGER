# ADR 003 — Claude prompt + tool-use schema for voice parsing

**Date**: 2026-04-21
**Status**: Accepted

## Decision

The voice-log parse flow uses a single `parse_voice_log` tool definition with a strict JSON schema. The prompt system instructions live in `src/lib/claudePrompt.ts` (shared with the Edge Function) and require:
- Every time entry to include date, worker_name, project_name, hours, confidence, source_phrase
- Unknown workers/projects surfaced in an `unresolved` array, never guessed
- Relative dates resolved against a supplied `today`
- Hours > 14 rejected and surfaced in `unresolved`
- Confidence score per entry so the review UI can flag <0.9 matches

## Context

Gavin will speak 200–500 words of mixed Australian English end-of-day: worker names, project names, hours, and materials. The parser must:
1. Reliably split a worker's day across multiple sites ("Pierce at Preston 3 hours then Belmore for 4.5")
2. Never invent workers/projects that don't exist
3. Never silently accept nonsense hours (voice-to-text often drops decimals or hears "16" for "6")
4. Keep latency low (target <3.5s mic → review)

## Options considered

1. **Free-text prose output, regex-parsed client-side** — rejected, brittle and repeats prompt engineering on the client.
2. **JSON mode with a loose schema** — rejected, no per-field validation.
3. **Tool use with strict schema** — chosen. Claude's tool-use returns validated JSON; Claude's docs recommend this shape for structured extraction.

## Chosen model

**`claude-haiku-4-5`** — ~1.5s p50 response, $1/MTok in / $5/MTok out. A 500-word transcript + 300-token context fits in <1k input tokens; <300 output tokens. Per-log cost is well under $0.01.

Fallback: if Haiku proves unreliable on real transcripts, escalate to Sonnet 4.6 for problematic logs only (the review screen lets Gavin flag "wrong parse" and we can re-run with a stronger model).

## Confidence thresholds

- Claude returns a self-assessed `confidence` per entry
- Server-side fuzzy-match adds a `resolution_confidence` (worker/project name → ID)
- Review screen marks an entry **needs review** if either < 0.9 or either ID is null

## Consequences

### Easier
- Shared prompt/tool schema between Edge Function and unit tests (they build exact same string)
- Deterministic failure mode: unresolved → UI prompts Gavin
- Review screen is the ground truth; no silent "autosave" of AI output

### Harder
- Claude may occasionally invent a project name even with clear "use only from list" instructions — fuzzy match + `needs_review` catches it but isn't bulletproof
- Tool-use JSON can fail to validate; Edge Function returns 502 with a clear error (the client offers manual entry fallback)

## Follow-ups

- Quality regression suite: 20 fixture transcripts with expected parses, run monthly against live Claude (~$0.50/run) per `docs/testing/STRATEGY.md`
- Prompt tuning once we have real Gavin transcripts — likely to add a few-shot example set
