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
- [ADR 005 — Manager scopes/variations + hours editing](docs/decisions/005-manager-scopes-variations.md)
- [ADR 006 — Variation labour (who/when/how many hours per variation)](docs/decisions/006-variation-labour.md)
- [ADR 007 — Schedule board (drag/resize jobs, 30d–12m underlay)](docs/decisions/007-schedule-board.md)
- [ADR 008 — Schedule parts (a job as several date blocks)](docs/decisions/008-schedule-parts.md)
- [ADR 009 — Integration tests against a real Postgres](docs/decisions/009-integration-tests.md)
- [CHANGELOG](CHANGELOG.md) — append-only session log

## Stack (shipped)

- **Frontend**: React 19 · Vite 6 · TypeScript · Tailwind 3 · shadcn-style UI primitives · lucide-react icons · sonner toasts
- **State/data**: TanStack Query · supabase-js
- **Forms**: React Hook Form + Zod (ready; used lightly in v1)
- **Backend**: Supabase (Postgres + Auth + RLS + Edge Functions + Storage reserved)
- **AI**: Anthropic Claude Haiku 4.5 via Supabase Edge Function `parse-voice-log`
- **Voice**: Web Speech API (browser-native, on-device)
- **Hosting**: Vercel
- **Testing**: Vitest (unit) — 149 green · Vitest + local Supabase ([tests/integration](tests/integration/README.md)) — 44, of which 4 are red on purpose · Playwright (E2E smoke, demo mode)
- **CI**: GitHub Actions (lint + typecheck + test + build + secret-scan + Playwright). The integration suite needs Docker and isn't wired into CI yet — [job YAML ready to paste](tests/integration/README.md#ci)

## Data model (Postgres)

Tables: `profiles`, `workers`, `projects`, `time_entries`, `material_entries`, `voice_logs`, `week_locks`, `audit_log`, `settings`. Full schema + RLS in [supabase/migrations/](supabase/migrations).

Plus `project_scopes`, `project_variations` + `project_schedule_blocks` (child
tables under `projects`).

Time + material entries carry an optional `scope_id` (a priced area of the base
quote) **or** an optional `variation_id` (extra work the client added mid-job) —
never both. See [ADR 006](docs/decisions/006-variation-labour.md).

Key invariants enforced by RLS / triggers (not UI):
- `time_entries.hours` CHECK between 0 and 14 (inclusive).
- `scope_id` and `variation_id` are mutually exclusive (CHECK on both entry
  tables), and a trigger rejects an entry whose variation belongs to a different
  project. Hours are logged once: a variation hour is still a payroll hour, but
  it is excluded from the project's quoted-hours progress because it is billed
  on top of the quote.
- Manager cannot INSERT/UPDATE/DELETE entries inside a locked week. In an *unlocked* week the manager may edit + delete any entry (used by the on-site "fix a mistake" flow).
- Admin writes inside locked weeks are allowed but write to `audit_log` via trigger.
- Scheduling lives in `project_schedule_blocks` — a job is a **set of parts**
  ("Part A", "Part B"…), because jobs stop and come back. `projects.start_date`
  / `end_date` are a trigger-maintained **envelope** over the parts (earliest
  start, latest finish): read them freely, but schedule by writing parts or the
  trigger will overwrite you. Admin-write only, under RLS. Scheduling is a plan
  and is entirely independent of logged time: moving a bar never touches a time
  entry, and week locks don't apply. See [ADR 007](docs/decisions/007-schedule-board.md)
  + [ADR 008](docs/decisions/008-schedule-parts.md).
- Manager (Gavin) is financially blind: he can add scopes (hours only) + edit them, and log unpriced `pending` variations, but the $ columns are forced null/preserved by triggers and masked on read (`*_visible` views). Scope delete, variation pricing + approval are admin-only. See [ADR 005](docs/decisions/005-manager-scopes-variations.md).
- Service-role key never touches user-input code paths.

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run build` — production build to `dist/`
- `npm run lint` / `npm run typecheck`
- `npm run test` (or `test:watch`) — Vitest unit; skips `tests/integration` unless the local-stack env vars are set
- `npm run test:integration` — starts a disposable, port-shifted local stack and runs `tests/integration`
- `npm run stack:up` / `stack:down` — that stack, by hand (`stack:up` prints its env vars)
- `npm run e2e` — Playwright
- `supabase start` / `supabase stop` — local Postgres (the *default-port* stack; the integration suite runs its own)
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
  components/features/    DayEntryDialog, ProjectForm, VoiceReview,
                          ScopesSection, VariationsSection, SchedulePartDialog
  context/AuthContext.tsx
  hooks/                  TanStack Query hooks per entity + useVoiceLog
  lib/                    supabase, env, dates (Mon-start), currency (AUD),
                          hours (14h cap), fuzzyMatch, aggregations,
                          claudePrompt (shared with Edge Function),
                          voiceParser, demo + demoStore, csv,
                          schedule (board geometry, drag maths, parts)
  pages/                  Dashboard, WeekCalendar, Timeline, Projects,
                          ProjectDetail, Workers, VoiceLog, Reports, Admin,
                          Login
  routes/guards.tsx       RequireAuth, RequireRole

supabase/
  config.toml
  migrations/             4 files: schema · functions · rls · seed
  functions/parse-voice-log/    Claude Haiku tool-use parse
  functions/weekly-backup/      CSV export email (Sun 23:00)

e2e/                      Playwright specs (smoke suite, demo mode)
tests/integration/        The app's own hooks against a real Postgres.
                          Signs in an admin + a manager for real; exercises
                          RLS, column grants and the guard triggers. Skipped
                          by `npm run test` without a local stack.
scripts/
  integration-stack.mjs   Generates + runs that stack (own ports, own
                          project_id, prod-like default privileges)
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
- …which is exactly why a hook's Postgres path can be broken with every suite green. Anything touching RLS, grants or a trigger needs a case in [tests/integration](tests/integration/README.md)

## Persistent memory workflow

Three persistence layers to survive context compaction:

1. **This file (`CLAUDE.md`)** — architectural source of truth; stays current
2. **`CHANGELOG.md`** — one entry per substantive session, newest first
3. **`~/.claude/projects/.../memory/`** — cross-session memories

Every session that changes code, config, or scope must update (1) and (2) before wrapping.

## Branding

Platinum / silver / high-end grey palette. Reference: https://www.tricoatpainting.com.au/. Tokens in [src/index.css](src/index.css) use HSL neutrals; final theme extraction remains as v1.5 polish.
