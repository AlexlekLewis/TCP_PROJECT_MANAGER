# Tricoat Painting & Decorating — Project Manager (v1)

Mobile-first internal tool for a 4-person painting crew: log daily labour hours + materials, manage per-project budgets, calculate profit, export weekly payroll. Two users only (admin + on-site manager). AI-assisted voice logging is the primary daily flow.

**Owner**: Alex Lewis (admin). **Primary daily user**: Gavin (2IC, manager). **Workers** (labour entities, not auth users): Jerry, Pierce, Gavin, Alex.

**Business website**: https://www.tricoatpainting.com.au/ — reference for platinum/silver brand theme.

## Status

**v1 core build is runnable in demo mode.** `npm install && npm run dev` serves the full app at http://localhost:5173 with in-memory fixtures — no Supabase or Anthropic account needed. To go live: [README.md → Going live](README.md#going-live-5-commands).

## Canonical docs
- [PRD](docs/PRD.md) — full spec
- [PRD Challenge](docs/PRD-CHALLENGE.md) — self-review + deferred features
- [Testing Strategy](docs/testing/STRATEGY.md)
- [ADR 001 — Tech stack](docs/decisions/001-tech-stack.md)
- [ADR 002 — Schema + RLS](docs/decisions/002-schema-rls.md)
- [ADR 003 — Claude voice parse](docs/decisions/003-claude-voice-parse.md)
- [ADR 004 — Deployment topology](docs/decisions/004-deployment.md)
- [CHANGELOG](CHANGELOG.md) — append-only session log

## Stack (shipped)

- **Frontend**: React 19 · Vite 6 · TypeScript · Tailwind 3 · shadcn-style UI primitives · lucide-react icons · sonner toasts
- **State/data**: TanStack Query · supabase-js
- **Forms**: React Hook Form + Zod (ready; used lightly in v1)
- **Backend**: Supabase (Postgres + Auth + RLS + Edge Functions + Storage reserved)
- **AI**: Anthropic Claude Haiku 4.5 via Supabase Edge Function `parse-voice-log`
- **Voice**: Web Speech API (browser-native, on-device)
- **Hosting**: Vercel
- **Testing**: Vitest (unit) — 33 green · Playwright (E2E smoke)
- **CI**: GitHub Actions (lint + typecheck + test + build + secret-scan + Playwright)

## Data model (Postgres)

Tables: `profiles`, `workers`, `projects`, `time_entries`, `material_entries`, `voice_logs`, `week_locks`, `audit_log`, `settings`. Full schema + RLS in [supabase/migrations/](supabase/migrations).

Key invariants enforced by RLS / triggers (not UI):
- `time_entries.hours` CHECK between 0 and 14 (inclusive).
- Manager cannot INSERT/UPDATE/DELETE entries inside a locked week.
- Admin writes inside locked weeks are allowed but write to `audit_log` via trigger.
- Service-role key never touches user-input code paths.

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run build` — production build to `dist/`
- `npm run lint` / `npm run typecheck`
- `npm run test` (or `test:watch`) — Vitest
- `npm run e2e` — Playwright
- `supabase start` / `supabase stop` — local Postgres for integration tests
- `supabase migration new <name>` / `supabase db reset` / `supabase db push`
- `supabase secrets set ANTHROPIC_API_KEY=...`
- `supabase functions deploy parse-voice-log`
- `vercel` / `vercel --prod`

## Environment variables

Client (`.env.local`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DEMO_MODE` (set `true` to use in-memory fixtures — default for local dev)
- `VITE_SENTRY_DSN` (optional)

Supabase secrets (server-side only, never in repo):
- `SUPABASE_SERVICE_ROLE_KEY` (implicit in Supabase env)
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY` (for weekly-backup Edge Function)
- `BACKUP_RECIPIENT` (Alex's email)

## Project layout (short)

```
src/
  App.tsx                 Router
  main.tsx                Providers (Query, Router, Auth, Toaster, ErrorBoundary)
  components/ui/          shadcn-style primitives
  components/layout/      AppLayout (top bar, mobile nav, floating mic)
  components/features/    DayEntryDialog, ProjectForm, VoiceReview
  context/AuthContext.tsx
  hooks/                  TanStack Query hooks per entity + useVoiceLog
  lib/                    supabase, env, dates (Mon-start), currency (AUD),
                          hours (14h cap), fuzzyMatch, aggregations,
                          claudePrompt (shared with Edge Function),
                          voiceParser, demo + demoStore, csv
  pages/                  Dashboard, WeekCalendar, Projects, ProjectDetail,
                          Workers, VoiceLog, Reports, Admin, Login
  routes/guards.tsx       RequireAuth, RequireRole

supabase/
  config.toml
  migrations/             4 files: schema · functions · rls · seed
  functions/parse-voice-log/    Claude Haiku tool-use parse
  functions/weekly-backup/      CSV export email (Sun 23:00)

e2e/                      Playwright specs (smoke suite)
docs/                     PRD, challenge, ADRs, testing strategy
```

## Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`…)
- Every non-trivial decision → new ADR under `docs/decisions/`
- Every session that changes code/config → CHANGELOG entry + PR
- Never commit secrets; CI has a grep gate
- Week always starts Monday (AU convention, date-fns `weekStartsOn: 1`)
- Money: `numeric(10,2)` / `numeric(12,2)` in DB; AUD everywhere in UI
- Hours: `numeric(5,2)`, validated `0 < h ≤ 14`
- Prefer demo-mode-safe code paths: every hook short-circuits via `env.demoMode`

## Persistent memory workflow

Three persistence layers to survive context compaction:

1. **This file (`CLAUDE.md`)** — architectural source of truth; stays current
2. **`CHANGELOG.md`** — one entry per substantive session, newest first
3. **`~/.claude/projects/.../memory/`** — cross-session memories

Every session that changes code, config, or scope must update (1) and (2) before wrapping.

## Branding

Platinum / silver / high-end grey palette. Reference: https://www.tricoatpainting.com.au/. Tokens in [src/index.css](src/index.css) use HSL neutrals; final theme extraction remains as v1.5 polish.
