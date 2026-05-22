# Product Requirements Document — Tricoat Painting & Decorating Project Manager

**Version**: 1.0 (draft for review)
**Date**: 2026-04-21
**Owner**: Alex Lewis
**Primary daily user**: Gavin (on-site 2IC / manager)
**Status**: Awaiting sign-off before Phase 1 implementation

---

## 1. Problem statement

A 4-person painting and decorating business (Tricoat, Melbourne) currently tracks daily labour hours and materials spend on a spreadsheet. The on-site manager (Gavin) maintains it manually: who was on which job, for how long, and what was bought. This creates:

- **Data entry friction** — 5–10 min/day of manual row-entry
- **No real-time profit visibility** — owner (Alex) only sees labour-cost vs quote at month-end
- **Payroll risk** — spreadsheets have no audit trail, no lock on submitted weeks
- **No mobile-first workflow** — the person logging the data is rarely at a desk

## 2. Vision

A mobile-first internal tool that:

1. Lets Gavin capture a full day's labour + materials across all active jobs in **under 30 seconds via voice**, with an AI parsing his conversational English into structured entries he reviews once.
2. Gives Alex a **live view** of every active project's labour $, materials $, and estimated profit vs the quoted price.
3. Guarantees **payroll accuracy** via week-level locks, role-based permissions, and a full audit log.
4. Runs on Gavin's phone, works on Alex's laptop, requires no training.

## 3. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Daily logging under 30 s | 90% of logs completed in ≤30 s (timer from mic tap to confirm) |
| G2 | Gavin adopts voice as primary path | ≥60% of time-entry volume comes via voice within 4 weeks of launch |
| G3 | Owner has live profit view | Dashboard surfaces labour $, materials $, profit vs quoted price for every active project |
| G4 | Payroll disputes traceable | Every mutation to a locked-week entry logged with user + before/after |
| G5 | Zero off-hours admin work | Weekly payroll export runs in ≤10 min end-to-end |

## 4. Non-goals (v1)

- Customer portal / client-facing views
- Invoicing, quoting, or Xero integration
- Multi-tenant SaaS (single business)
- Native iOS / Android app (PWA only)
- Receipt photo upload / OCR
- GPS-based clock-in
- Worker self-service portal
- Financial reporting beyond per-project profit (no P&L, no tax)

## 5. Users & roles

### Admin — Alex
- Creates and edits projects, sets budgets and quoted prices
- Manages workers and hourly rates
- Reviews weekly reports and exports CSV for payroll
- Locks and unlocks weeks
- Only role able to mutate entries inside a locked week (with audit)

### Manager — Gavin
- Logs time + materials daily via voice or manual entry
- Views all projects and reports
- Cannot lock weeks or mutate locked entries
- Cannot change worker hourly rates or project budgets

### Workers (non-users)
Jerry, Pierce, Gavin, Alex are recorded as `workers` rows (labour entities) independent of auth. Gavin and Alex happen to be both `users` and `workers`.

## 6. Primary user flows

### Flow A — Voice daily log (Gavin, primary)

**Happy path**
1. Gavin opens the PWA on his phone, taps **🎙️ Voice log** on the home screen
2. Speaks naturally: *"Jerry was at Northcote High on Monday for 10 hours. Pierce did Preston High Monday morning for 3 hours then drove to Belmore to finish the day, 4.5 hours."*
3. Browser transcribes on-device via Web Speech API
4. App POSTs transcript + current workers/projects list to Supabase Edge Function
5. Edge Function calls Claude Haiku 4.5 with structured-output tool use
6. Claude returns an array of time entries and materials, each tagged with a confidence score and the source phrase
7. Review screen appears: each entry is an inline-editable row with worker/project dropdowns pre-filled
8. Confidence badges on uncertain rows (e.g. worker name fuzzy-matched with score <0.9)
9. Gavin fixes any misheard names, confirms
10. Single Postgres transaction writes entries + a `voice_logs` audit row

**Edge cases**
- Worker or project unrecognised → Claude returns it as "unknown", UI prompts Gavin to map to an existing record or create a new one
- Daily hours for one worker exceeds 10 h → warning banner ("Pierce logged 14h Mon — confirm?"), blocks save until acknowledged
- Hours in the future → rejected client-side
- Multiple days in a single voice log → supported (each entry has its own date)
- Network fails during confirm → entries queued in IndexedDB, retry banner, sync on reconnect (v1.5 if not v1)

### Flow B — Manual day entry (both users, fallback + edits)

1. Tap a day in the week calendar
2. **+ Add time** → pick worker → project → hours → notes → save
3. Repeat per worker per project for the day
4. **+ Add materials** → project → description → $ → save
5. Day view shows all entries grouped by worker

### Flow C — Project creation (Alex)

1. Projects → **+ New**
2. Name, client, address, color tag (platinum/blue/green/amber)
3. Quoted price ($), quoted hours, materials budget ($)
4. Start date, expected end date
5. Save → project appears on dashboard

### Flow D — Week lock (Alex)

1. Reports → Week of [date] → **Review**
2. Scan weekly totals, spot anomalies
3. **Lock week** → confirm dialog → lock applied
4. Manager UI shows a lock icon on those days; attempts to edit produce a clear message
5. Alex can edit locked entries (audited) or **Unlock** entire week

### Flow E — Project profitability (Alex)

1. Project → **Financials** tab
2. See: quoted price, labour $ (hours × rate), materials $, **profit estimate** (quoted − labour − materials), profit %
3. Progress bars: hours used / quoted hours, $ spent / materials budget
4. Trend sparkline: hours added per day

### Flow F — Weekly payroll export (Alex)

1. Reports → current week
2. Table: worker × project grid of hours + $
3. **Export CSV** (payroll format: date, worker_name, project_name, hours, rate, amount)
4. Optionally **Lock week** after review

## 7. Functional requirements

### FR1 — Authentication
- Supabase Auth, email + password
- Hard allowlist: two accounts (admin, manager). Signup disabled; admin invites manager
- Role stored in `profiles.role`: `admin` | `manager`
- Session persisted; auto-logout on 30-day inactivity

### FR2 — Projects
- Fields: name (required), client_name, address, quoted_price, quoted_hours, materials_budget, start_date, end_date, status (`active` | `complete` | `archived`), color_tag
- Admin: full CRUD
- Manager: read all, no writes
- Archived projects hidden by default; still included in historical reports
- Soft-delete only (never hard delete — payroll history must remain valid)

### FR3 — Workers
- Fields: name (required), hourly_rate (required, numeric), active (boolean), created_at
- Admin: full CRUD (but worker rows referenced by time entries cannot be hard-deleted — set `active=false` instead)
- Manager: read only
- Seed: Jerry, Pierce, Gavin, Alex (rates to confirm)

### FR4 — Time entries
- Fields: entry_date (required), worker_id (required), project_id (required), hours (required, 0 < h ≤ 16), notes (optional), created_by, ai_source_id (nullable FK to voice_logs), created_at
- Writes: admin always; manager only if no `week_locks` row covers `entry_date`
- Validation (client + server):
  - hours > 0 and ≤ 16
  - entry_date not in the future
  - hours > 10 warns (does not block)
  - worker and project both `active` (warn if not)

### FR5 — Material entries
- Fields: entry_date (required), project_id (required), description (required), cost (required, > 0), created_by, ai_source_id (nullable), created_at
- Writes: same rules as time entries (week-lock gated)

### FR6 — Voice log
- Web Speech API (`SpeechRecognition`) for on-device transcription; no backend transcription cost
- Continuous recognition mode; auto-stops after 3 s of silence or user tap
- POST `/functions/v1/parse-voice-log` with payload: `{ transcript, workers, projects }`
- Edge Function:
  - Validates payload + auth
  - Builds Claude prompt with system instructions + workers/projects context
  - Calls `claude-haiku-4-5` with tool use, schema:
    ```ts
    {
      entries: Array<{
        date: string,       // YYYY-MM-DD
        worker_name: string,
        project_name: string,
        hours: number,
        notes?: string,
        confidence: number,  // 0..1
        source_phrase: string
      }>,
      materials: Array<{
        date: string,
        project_name: string,
        description: string,
        cost: number,
        confidence: number,
        source_phrase: string
      }>,
      unresolved: string[]   // phrases Claude couldn't map
    }
    ```
  - Fuzzy-matches returned names to IDs (Levenshtein distance ≤2 or lowercased exact); marks <0.8 confidence for review
  - Returns JSON to client
- Client review screen:
  - One row per entry with worker + project dropdowns, hours number input, notes text
  - Confidence < 0.8 highlighted amber
  - "Source phrase" shown on hover (what Claude thought Gavin said)
  - **Confirm & save** button disabled until all rows have worker + project resolved
- Server writes entries + `voice_logs` row atomically (single RPC call)
- `voice_logs` retains raw transcript + parsed JSON + confirmed IDs for 12 months

### FR7 — Week lock
- Admin action: select ISO week (Mon–Sun) → **Lock**
- Creates row in `week_locks` keyed by `week_start` (ISO Monday date)
- RLS policy on time_entries / material_entries rejects INSERT/UPDATE/DELETE from manager role if `entry_date` falls inside any `week_locks.week_start..week_start+6`
- Admin writes inside a locked week allowed but trigger writes `audit_log` row capturing: user, action, before, after, reason (required field on admin edit)
- Unlock: admin-only, creates an audit row

### FR8 — Weekly report
- Filter by ISO week (default: current)
- Per worker row: total hours + total $ (hours × rate)
- Per project row: total hours + labour $ + materials $
- Grand totals
- **Export CSV** (payroll format)
- Lock / Unlock button (admin only)

### FR9 — Dashboard (home)
- This-week summary: total hours, total labour $, total materials $
- Active projects list:
  - Name, client, color tag
  - Progress bar: hours used / quoted (color-coded: green <75%, amber 75–100%, red >100%)
  - Progress bar: materials $ used / budget
  - Tap → project detail
- Recent voice logs (last 5) with status (saved / partial / discarded)
- Big **🎙️ Voice log** CTA button (mobile-only)

### FR10 — Project detail
- Header: name, client, status, color
- Tabs: **Timeline** | **Financials** | **Materials** | **Notes**
- Timeline: all entries chronological, grouped by week; filter by worker
- Financials:
  - Quoted price $ | Labour $ | Materials $ | **Estimated profit $** | Profit %
  - Warning banner if projected to exceed quote at current burn rate
- Materials: chronological list of material entries; total at top
- Notes: project-level free text (admin edit)

### FR11 — Settings
- Admin: workers CRUD, change own password, view audit log
- Manager: change own password, view own profile

## 8. Non-functional requirements

### NFR1 — Performance
- First contentful paint ≤ 2.0 s on 4G (Vercel edge caching)
- Initial JS bundle ≤ 250 KB gzipped
- Voice log round-trip (mic tap → review screen): ≤ 3.5 s p50 / ≤ 6.0 s p95
- Dashboard render ≤ 500 ms on cached data

### NFR2 — Security
- Anthropic API key stored only in Supabase Edge Function secrets (`supabase secrets set ANTHROPIC_API_KEY=...`); never in frontend, never in repo
- RLS enabled on every table with explicit policies (no table bypasses RLS)
- Supabase service-role key used only in migrations / admin scripts, never in Edge Function runtime code paths that handle user input
- CORS on Edge Functions restricted to the Vercel production origin + localhost in dev
- Rate limit: 20 voice-log calls / user / hour (Edge Function gate)
- CI secret scan: GitHub Actions job greps for `sk-ant-`, `eyJ`, `SUPABASE_SERVICE` in every PR
- Session cookies: httpOnly, Secure, SameSite=Lax (Supabase defaults)
- Content Security Policy: `default-src 'self'`; `connect-src` whitelist for Supabase + Anthropic proxied via Edge Function only

### NFR3 — Reliability
- Weekly automated CSV export of all tables to owner's email (Supabase cron + Resend) — payroll data survives Supabase-level incidents
- Frontend error boundary at app root + per major route; last-resort "something went wrong, reload" screen
- Edge Function: one automatic retry on 5xx; structured JSON error surfaced to client on final failure
- Offline: service worker caches app shell; IndexedDB queue for time/material entries when offline, replay on reconnect (target v1; acceptable v1.5)
- Sentry for frontend + Edge Function error reporting (free tier)

### NFR4 — Accessibility
- WCAG 2.1 AA color contrast (especially important given platinum/silver palette — avoid low-contrast greys)
- Full keyboard navigation on every primary flow
- ARIA live region for voice-log state changes (recording → transcribing → review)
- Labels on every form input; error messages announced to screen readers

### NFR5 — Mobile / PWA
- Responsive from 320 px width upward
- Touch targets ≥ 44 × 44 px
- Installable PWA with manifest, service worker, app icon
- Works in Mobile Safari (iOS 16+) and Chrome Android
- Voice recording permission flow tested on both

### NFR6 — Observability
- Sentry error events tagged with user role, route, voice-log ID (if applicable)
- Edge Function logs structured JSON, viewable in Supabase logs dashboard
- Voice-log table acts as a user-facing audit of every AI-mediated entry

## 9. Technical architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 19 + Vite + TypeScript | Mature, fast, typed — payroll accuracy depends on type safety |
| Styling | Tailwind CSS + shadcn/ui | Fast to ship, accessible, easy to theme to platinum/silver |
| Routing | React Router v7 | Real URLs, back button works |
| Data fetching | TanStack Query + supabase-js | Proper cache invalidation |
| Forms | React Hook Form + Zod | Schema validation shared with backend types |
| Dates | date-fns (AU locale) | Small bundle, tree-shakes |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions + Storage) | Relational fits the domain; RLS enforces week lock |
| AI | Anthropic Claude Haiku 4.5 via Edge Function | Fast, cheap, structured output via tool use |
| Voice transcription | Web Speech API (browser-native) | Free, on-device, zero latency |
| Hosting | Vercel | Already set up; Edge-caching; free tier fine |
| CI | GitHub Actions | Lint, typecheck, test, build gates |
| E2E | Playwright | Best-in-class, matches user instruction |
| Monitoring | Sentry (free tier) | Frontend + Edge Function errors |
| Email (backups) | Resend (via Edge cron) | Simple, free tier for our volume |

### Voice log data flow

```
[Gavin's phone / Safari]          [Supabase Edge Function]        [Anthropic]
        |                                  |                            |
        |-- SpeechRecognition API -->      |                            |
        |   (on-device transcript)         |                            |
        |                                  |                            |
        |--- POST /parse-voice-log ------->|                            |
        |    { transcript, workers,        |                            |
        |      projects }                  |                            |
        |                                  |--- messages.create ------->|
        |                                  |    claude-haiku-4-5        |
        |                                  |    tool use: parse_log     |
        |                                  |                            |
        |                                  |<-- structured JSON --------|
        |                                  |                            |
        |                                  | fuzzy-match names → IDs    |
        |                                  | tag confidence             |
        |                                  |                            |
        |<-- 200 { entries, materials,     |                            |
        |        unresolved }              |                            |
        |                                  |                            |
        | review UI → user confirms        |                            |
        |                                  |                            |
        |--- RPC save_voice_log_entries -->|                            |
        |    (atomic txn)                  |                            |
        |<-- 200                           |                            |
```

### Environment variables

| Var | Where | Scope |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel + `.env.local` | Client |
| `VITE_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Client (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | Edge Functions + migrations only |
| `ANTHROPIC_API_KEY` | Supabase secrets | Edge Functions only |
| `RESEND_API_KEY` | Supabase secrets | Edge cron only |
| `VITE_SENTRY_DSN` | Vercel + `.env.local` | Client |

## 10. Data model (Postgres)

```sql
-- Extends Supabase auth.users
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','manager')),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE project_status AS ENUM ('active','complete','archived');

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  address text,
  quoted_price numeric(12,2),
  quoted_hours numeric(10,2),
  materials_budget numeric(12,2),
  status project_status NOT NULL DEFAULT 'active',
  color_tag text,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE voice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript text NOT NULL,
  parsed_json jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  worker_id uuid NOT NULL REFERENCES workers(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 16),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  ai_source_id uuid REFERENCES voice_logs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_time_entries_worker_date ON time_entries(worker_id, entry_date);
CREATE INDEX idx_time_entries_project_date ON time_entries(project_id, entry_date);
CREATE INDEX idx_time_entries_date ON time_entries(entry_date);

CREATE TABLE material_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id),
  description text NOT NULL,
  cost numeric(10,2) NOT NULL CHECK (cost > 0),
  supplier text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  ai_source_id uuid REFERENCES voice_logs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_material_entries_project_date ON material_entries(project_id, entry_date);

CREATE TABLE week_locks (
  week_start date PRIMARY KEY,  -- ISO Monday
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid NOT NULL REFERENCES auth.users(id)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor uuid NOT NULL REFERENCES auth.users(id),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  before jsonb,
  after jsonb,
  reason text  -- required on admin writes inside locked week
);
```

### RLS policies (all tables RLS-enabled)

```sql
-- Helpers
CREATE FUNCTION current_role() RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;

CREATE FUNCTION is_week_locked(d date) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM week_locks
    WHERE d BETWEEN week_start AND week_start + 6
  );
$$ LANGUAGE sql STABLE;

-- profiles
CREATE POLICY profiles_select_own ON profiles FOR SELECT
  USING (id = auth.uid() OR current_role() = 'admin');

-- workers / projects
CREATE POLICY workers_select_all ON workers FOR SELECT TO authenticated USING (true);
CREATE POLICY workers_admin_write ON workers FOR ALL TO authenticated
  USING (current_role() = 'admin') WITH CHECK (current_role() = 'admin');
-- (same shape for projects)

-- time_entries
CREATE POLICY time_entries_select_all ON time_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY time_entries_insert ON time_entries FOR INSERT TO authenticated
  WITH CHECK (
    current_role() = 'admin'
    OR (current_role() = 'manager' AND NOT is_week_locked(entry_date))
  );
CREATE POLICY time_entries_update ON time_entries FOR UPDATE TO authenticated
  USING (
    current_role() = 'admin'
    OR (current_role() = 'manager' AND NOT is_week_locked(entry_date) AND created_by = auth.uid())
  );
CREATE POLICY time_entries_delete ON time_entries FOR DELETE TO authenticated
  USING (current_role() = 'admin' OR (current_role() = 'manager' AND NOT is_week_locked(entry_date)));
-- (same shape for material_entries)

-- voice_logs: own + admin
CREATE POLICY voice_logs_select ON voice_logs FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR current_role() = 'admin');
CREATE POLICY voice_logs_insert ON voice_logs FOR INSERT TO authenticated WITH CHECK (true);

-- week_locks: admin only
CREATE POLICY week_locks_admin_all ON week_locks FOR ALL TO authenticated
  USING (current_role() = 'admin') WITH CHECK (current_role() = 'admin');

-- audit_log: admin read only; writes via trigger
CREATE POLICY audit_log_admin_read ON audit_log FOR SELECT TO authenticated USING (current_role() = 'admin');
```

## 11. Testing strategy

### 11.1 Unit tests — Vitest
- `lib/fuzzyMatch` — worker/project name → ID matcher, confidence scoring
- `lib/dates` — ISO week math, week_start for any date, AU locale rendering
- `lib/currency` + `lib/hours` — formatting
- `lib/claudePrompt` — prompt builder produces expected shape
- `lib/voiceParser` — normaliser on Claude JSON response
- Reducers / selectors for dashboard aggregations

### 11.2 Integration tests — Vitest + Supabase local (Docker)
**RLS matrix** (from Shared Protocols):
- Unauth read → 0 rows
- Manager read → all active data
- Manager insert time entry in unlocked week → succeeds
- Manager insert time entry in locked week → fails with RLS error
- Manager update time entry in locked week → fails
- Admin insert in locked week → succeeds + audit_log row written
- Admin insert in locked week without `reason` → fails validation
- Cross-user access: manager cannot see another manager's voice_logs (v2+ concern)

**Edge Function**:
- Canned transcript fixtures → assert structured output shape
- Mocked Anthropic client returns known JSON → assert normaliser output
- Auth header missing → 401
- Rate limit exceeded → 429

### 11.3 E2E tests — Playwright
Run against local dev server + against Vercel preview URL on every PR.

Spec suite:
- `auth.spec.ts` — login, route guard, logout
- `projects.spec.ts` — admin creates/edits/archives project
- `workers.spec.ts` — admin CRUD
- `manual-entry.spec.ts` — manager adds time + materials for a day
- `voice-log.spec.ts` — mocks SpeechRecognition with canned transcripts, asserts review screen renders + save succeeds
- `week-lock.spec.ts` — admin locks → manager sees lock UI → manager save attempt 403 → admin edits with reason → audit row present
- `reports.spec.ts` — weekly report math matches fixture; CSV export file shape
- `dashboard.spec.ts` — progress bars reflect recent writes
- `financials.spec.ts` — profit math matches fixture

### 11.4 Production smoke tests — Playwright (post-deploy)
Run automatically after every production deploy and nightly via cron:
- Homepage loads, login screen renders
- Login as synthetic test account, dashboard loads
- Canned voice log flow (mocked mic) → save → appears in timeline
- Zero console errors, zero Sentry new events

### 11.5 Manual QA checklist (pre-launch)
- Mobile Safari iOS 16+: mic permission, full voice log flow, PWA install
- Chrome Android: same
- Offline: disconnect mid-entry → IndexedDB queue → reconnect → entries sync
- Accessibility: keyboard-only run through every screen + screen reader sanity check (VoiceOver + NVDA)
- Payroll export format opens cleanly in Excel + Google Sheets

### 11.6 CI gates
Every PR:
- `npm run lint` (ESLint)
- `npm run typecheck` (tsc --noEmit)
- `npm run test:unit` (Vitest)
- `npm run test:integration` (Vitest + Supabase local Docker)
- `npm run build`
- `npx playwright test` against Vercel preview URL
- Secret scan (grep for forbidden patterns)

PR cannot merge red. Main → Vercel production → post-deploy Playwright smoke.

## 12. Build phases

Each phase is a shippable increment. CHANGELOG entry + PR required per phase. Acceptance criteria listed; no phase is "done" until criteria pass.

### Phase 1 — Scaffold (2 h)
- Wipe existing domain code, keep git history
- New Vite + TS + React template
- Tailwind + shadcn/ui configured with platinum/silver tokens
- ESLint + Prettier + Husky pre-commit
- `.env.example` documents every required var
- GitHub Actions CI: lint + typecheck + build
- ADR: tech stack choice
- **Accept**: `npm run dev` serves a themed placeholder; CI green on first PR

### Phase 2 — Supabase + schema (3 h)
- Supabase project provisioned (Alex does this; I provide click-path)
- `supabase/migrations/` with all tables, RLS, functions, triggers
- Seed script: four workers (Jerry/Pierce/Gavin/Alex) — rates TBD
- Integration tests for full RLS matrix
- ADR: schema + RLS design
- **Accept**: local Supabase `supabase start` + `npm run test:integration` green

### Phase 3 — Auth + roles + **API key acquisition** (2 h)
- Login/logout UI
- Allowlist enforcement
- Route guards, role-aware nav
- **Obtain Anthropic API key** (I will drive this via Claude-in-Chrome MCP → console.anthropic.com) and set `supabase secrets set ANTHROPIC_API_KEY=...`
- **Accept**: E2E login happy path green; Edge Function stub call with key succeeds

### Phase 4 — Projects & Workers CRUD (3 h)
- Admin UIs for both
- React Hook Form + Zod validation
- Color tag picker (presets on platinum palette)
- Soft delete / archive
- **Accept**: E2E spec for projects + workers green

### Phase 5 — Week calendar + manual entry (6 h)
- Week view (Mon–Sun) with daily totals
- Day entry drawer
- Multi-worker multi-project per day
- Materials section per day
- **Accept**: `manual-entry.spec.ts` green; mobile Safari smoke pass

### Phase 6 — Voice log + Claude Edge Function (8 h)
- Web Speech API integration with recording UI
- `parse-voice-log` Edge Function (Deno + Anthropic SDK)
- Review screen with confidence badges, inline edits
- `save_voice_log_entries` atomic RPC
- **Accept**: `voice-log.spec.ts` green (with mocked mic); end-to-end on Gavin's phone with real Claude call

### Phase 7 — Project detail + financials (3 h)
- Tabs, timeline, financials with profit calc, progress bars
- Materials tab
- **Accept**: `financials.spec.ts` green; profit math verified by hand on 3 fixtures

### Phase 8 — Reports, CSV, week lock (4 h)
- Weekly report view
- CSV export (payroll format confirmed with Alex)
- Week lock UX (admin) + lock-enforcement UX (manager)
- Audit log viewer (admin)
- **Accept**: `week-lock.spec.ts` green; manual payroll export opens cleanly in Excel

### Phase 9 — Theme, PWA, deploy, production smoke (4 h)
- Final platinum/silver theme pass (after branding artefacts received)
- PWA manifest + service worker + offline cache for app shell
- Sentry wiring
- Weekly backup Edge cron
- Vercel production deploy
- Post-deploy Playwright smoke green
- **Accept**: Lighthouse PWA ≥90, A11y ≥95, Perf ≥90 on mobile

**Total**: ~35 h (estimate). Calendar time with review cycles: ~3 weeks.

## 13. Success metrics (first 30 days post-launch)

| Metric | Target |
|---|---|
| Days Gavin logs entries | ≥ 20 / 22 working days |
| % entries via voice | ≥ 60% by end of week 4 |
| Median voice-log round-trip | ≤ 3.5 s |
| % voice entries requiring correction | ≤ 5% |
| Weekly payroll export time | ≤ 10 min |
| Payroll disputes traced to app bug | 0 |
| Uptime | ≥ 99.5% |

## 14. Risks & mitigations

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| AI misparses worker name → wrong payroll | High | Medium | Mandatory review screen; confidence badges; fuzzy-match threshold; audit log; >10h warning |
| Web Speech API unreliable on Gavin's phone | High | Medium | Fallback: record audio → upload → Whisper via separate Edge Function (v1.5 if needed) |
| Supabase outage | Medium | Low | Weekly CSV backup by email; Vercel status-monitored |
| Anthropic API outage | Medium | Low | Manual entry always functional; clear error surfaced |
| Signal loss mid-voice-log | Medium | High (tradies) | IndexedDB queue + sync (target v1) |
| Week lock bypass bug | Critical | Low | RLS enforces; E2E test gates; audit log proves |
| Claude API cost spiral | Low | Low | Haiku pricing < $2/mo expected; rate limit; Sentry alert on > $10/mo |
| Gavin rejects the tool | Critical | Medium | Voice-log must be genuinely <30s; fast manual fallback; Alex champions |
| Data loss from DB migration | High | Low | Every migration tested on shadow DB; backups before prod migrations |

## 15. Open questions

1. **Worker hourly rates** — exact $/hr for Jerry, Pierce, Gavin, Alex?
2. **Website URL** — so I can lift the exact platinum/silver tokens and logo
3. **Emails for the two accounts** — admin + manager Supabase Auth
4. **Payroll CSV format** — are there specific columns your payroll software needs, or is generic OK?
5. **Week start day** — Monday (AU default) or a different cutoff?
6. **Daily-hours cap** — is 10 h / 16 h warn/block right, or different for your ops?
7. **Allowlist** — admin-creates-manager flow, or magic-link invite?

## 16. Out of scope / future roadmap

### v1.5 (first 3 months post-launch)
- Offline-first PWA with full sync (if not shipped in v1)
- Whisper fallback for voice transcription if Web Speech API unreliable
- Start-of-day voice "plan for today" entry (provisional entries, reconciled EOD)
- Daily brief auto-generation (Claude-written morning SMS/push)

### v2
- Quote PDF import → Claude vision → auto-populate project
- Invoice PDF export at project completion
- Client-facing read-only share link (premium brand touch)
- Xero integration (labour + materials → purchase orders + invoices)

### v3+
- Multi-business tenancy
- Worker self-service timesheet view
- GPS clock-in detection
- Receipt photo + OCR
- Native iOS app (if PWA ceiling hit)

## Appendix A — PRD challenge & enhancements

*Self-review of this PRD — things to push back on, plus features the owner hasn't mentioned that would add value.*

See `docs/PRD-CHALLENGE.md` (companion document).
