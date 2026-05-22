# ADR 001 — Tech stack for Tricoat PM (v2)

**Date**: 2026-04-21
**Status**: Proposed (awaiting sign-off)
**Supersedes**: N/A (original Firebase scaffold is being wiped)

## Decision

The rebuild will use:

- **Frontend**: React 19 + Vite + TypeScript + Tailwind + shadcn/ui
- **State/data**: TanStack Query + supabase-js
- **Forms**: React Hook Form + Zod
- **Backend**: Supabase (Postgres + Auth + RLS + Edge Functions + Storage)
- **AI**: Anthropic Claude Haiku 4.5 via Supabase Edge Function
- **Voice transcription**: Web Speech API (browser-native)
- **Hosting**: Vercel
- **Testing**: Vitest (unit + integration), Playwright (E2E)
- **CI**: GitHub Actions
- **Monitoring**: Sentry

## Context

The original Firebase-based scaffold tracked "elements through paint phases", which is not the workflow the business needs. Alex's real requirement is a time + materials + budget tracker with AI-assisted voice logging and role-gated week locks for payroll accuracy.

The rebuild is a greenfield opportunity. The domain mismatch between the original and the real need means carrying forward the old domain code would be a drag, not an asset.

## Options considered

### Backend

1. **Firebase (Auth + Firestore)** — original choice. Rejected because:
   - NoSQL hinders the relational queries (worker × project × week aggregations) this app needs
   - Firestore 1MB doc limit is a real ceiling for historical data
   - No SQL → CSV export is awkward; payroll is the killer feature
   - Row-level security in Firestore rules is less ergonomic than Postgres RLS
2. **Supabase (Postgres + Auth + RLS + Edge Functions)** — chosen.
   - Real SQL = clean weekly reports and CSV export
   - RLS policies enforce week lock at the database layer (structural, not UI-level)
   - Edge Functions (Deno) host the Claude API call, keeping the API key server-side
3. **Custom Node/Express + Postgres** — rejected. More infra to manage, slower to ship, no benefit for a 2-user app.
4. **Turso + Edge API** — interesting but less mature Auth story.

### Frontend framework

1. **React 19 + Vite** — chosen. Familiar, fast builds, large ecosystem.
2. **Next.js** — rejected. Server-rendering overkill for an internal 2-user app; adds deployment complexity for zero benefit here.
3. **Remix / Astro** — rejected for similar reason; this app is all CSR.

### Language

1. **TypeScript** — chosen. Payroll-adjacent code. Type safety on DB query results + form validation shared with backend = fewer production bugs.
2. **JavaScript** — rejected. Original scaffold was JS; the cost of bugs outweighs the ramp cost of TS.

### Styling

1. **Tailwind + shadcn/ui** — chosen. Fast to build, accessible components out of the box, trivial to theme to platinum/silver.
2. **Inline styles + custom primitives** (old scaffold's approach) — rejected. Slow to build, inconsistent.
3. **MUI / Chakra** — rejected. Heavier runtime, harder to reach the premium look.

### Voice transcription

1. **Web Speech API (browser-native)** — chosen for v1. Free, on-device, zero latency.
2. **OpenAI Whisper via an Edge Function** — fallback if Web Speech proves unreliable on Gavin's phone (v1.5 if needed). Costs ~$0.006/min, still negligible.
3. **AssemblyAI / Deepgram** — more accurate but paid and unnecessary for v1.

### AI model

1. **Claude Haiku 4.5** — chosen. Structured output via tool use, ~1–2 s response, cheap ($1/MTok input, $5/MTok output). A typical voice log (≈500 input + 200 output tokens) costs well under $0.01.
2. **Claude Sonnet 4.6** — overkill for this parsing task.
3. **GPT-4o-mini** — roughly comparable, but we standardise on Anthropic for consistency with ecosystem and preference.

### Hosting

1. **Vercel** — chosen. Already set up; edge-cached SPA; automatic preview deploys per PR are valuable for Playwright E2E; free tier covers this app indefinitely.
2. **Netlify / Cloudflare Pages** — comparable, no reason to switch.

### Testing

1. **Vitest + Playwright** — chosen.
   - Vitest: fast ESM-native unit + integration runner; Supabase local via Docker for RLS matrix testing.
   - Playwright: best-in-class E2E, runs against both local dev and Vercel preview URLs.
2. **Jest + Cypress** — rejected. Older, slower, less aligned with the Vite ecosystem.

## Rationale

Supabase reframes the whole architecture around Postgres, which matches the domain (relational data, aggregations, exports). RLS enforcing the week-lock is the right primitive for this rule. Edge Functions keep the Claude API key server-side — a non-negotiable security property.

TypeScript + Tailwind + shadcn is the lowest-friction path to a polished, accessible, typed UI for a one-developer build.

Claude Haiku via tool use gives us structured output with high reliability at negligible cost. Web Speech API is free and sufficient for Chrome/Safari; we preserve an upgrade path to Whisper if real-world audio quality proves lower than expected.

## Consequences

### Easier
- Payroll CSV export is a SQL query + CSV shim
- Week lock is a single RLS policy
- Type safety from DB → UI via generated Supabase types
- Previews-per-PR lets Playwright gate merges on real browser behaviour

### Harder
- TypeScript ramp cost (~2 h of build-time lost but faster after)
- Supabase local requires Docker (minor dev-setup ask)
- Web Speech API works differently on iOS Safari vs Chrome Android; QA on both devices required
- Edge Functions (Deno) have a slightly different runtime than frontend (Node/Vite); code sharing requires care

### New risks
- Supabase service-role key handling: must never land in Edge Function code paths that return to client
- Anthropic API key: Supabase secrets only, never committed, rotated if leaked
- Web Speech API not available on some older browsers; graceful fallback to text input required

## Follow-ups

- ADR 002 — Schema + RLS design (Phase 2)
- ADR 003 — Claude prompt + tool-use schema for voice log (Phase 6)
- ADR 004 — Deployment topology: Vercel + Supabase + Sentry (Phase 9)
