# Testing strategy

Companion to `PRD.md` §11. This doc is the operational playbook — what runs where, when, and how we gate merges.

## Pyramid

```
          /\
         /  \           Production smoke (Playwright, post-deploy + nightly)
        /----\
       /      \         E2E (Playwright, per PR + pre-prod)
      /--------\
     /          \       Integration (Vitest + Supabase local Docker)
    /------------\
   /              \     Unit (Vitest)
  /----------------\
```

## Unit — Vitest

**Scope**: pure functions, no I/O.

Targets:
- `lib/fuzzyMatch.ts` — worker/project name → ID + confidence
- `lib/dates.ts` — ISO week math, AU locale formatters
- `lib/currency.ts`, `lib/hours.ts` — formatting + validation
- `lib/claudePrompt.ts` — prompt builder produces stable output
- `lib/voiceParser.ts` — normaliser for Claude response
- Dashboard selectors / aggregation reducers

Run: `npm run test:unit`. Must be green pre-PR.

## Integration — Vitest + Supabase local

**Scope**: code + database, real RLS. Shipped 2026-09-21; see [ADR 009](../decisions/009-integration-tests.md) and [tests/integration/README.md](../../tests/integration/README.md).

Run: `npm run test:integration`. Starts a disposable, port-shifted local stack (Docker), applies the migrations and runs the suite. `npm run test` skips it unless `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` / `SUPABASE_TEST_SERVICE_ROLE_KEY` are set, so the unit job stays a unit job.

What it does differently from every other suite here: it signs in two real users (admin + manager) and drives **the app's own hooks** — `useProjects`, `useProjectScopes`, `useProjectVariations`, `useTimeEntries`, `useWeekLocks` — so the supabase-js chain that reaches Postgres is the one the app ships. Demo mode is forced off. Ground truth is read back with a service-role client, because neither user is allowed to read the base tables' money columns.

Covered today:
- manager adds + edits a scope and logs a variation; the guard triggers null the $ columns on insert and preserve the admin's prices on update
- manager gets 42501 selecting, filtering or ordering on `quoted_price` / `materials_budget` / `target_profit` / `amount`, and reads them as null through the `*_visible` views
- manager cannot delete a scope, or price / approve / delete a variation (0 rows, row unchanged)
- manager files a draft project but cannot create a priced one or rename an existing one
- hours: `created_by` attribution, the 14-hour CHECK, scope/variation exclusivity, the cross-project variation trigger, and the week lock
- the admin equivalents of all of the above

Edge Functions are **not** covered yet — the matrix below is still a plan.

Test matrices (planned):

### RLS matrix (one spec per table)
From Shared Protocols + week-lock specifics:
- Unauth → 0 rows on all tables
- Manager can SELECT all active rows
- Manager can INSERT time_entry in unlocked week
- Manager cannot INSERT in locked week (expect RLS error)
- Manager cannot UPDATE in locked week
- Manager cannot DELETE in locked week
- Admin can INSERT in locked week; audit_log row written
- Admin INSERT in locked week without `reason` fails validation
- Cross-table join (time_entries → projects) returns expected rows
- `auth.uid() IS NULL` handled in every policy

### Edge Function matrix (`parse-voice-log`)
- Happy path: canned transcript → expected structured output
- Worker name typo → fuzzy match resolves (confidence ≥0.8)
- Worker name ambiguous → returned as `unresolved`
- Transcript empty → 400
- Auth header missing → 401
- Rate limit exceeded → 429
- Anthropic 5xx → 503 + user-friendly message

Run: `npm run test:integration`. Must be green pre-PR.

## E2E — Playwright

**Scope**: full browser through the app, real Supabase (test project), mocked Anthropic.

Run locations:
- Local dev: `npx playwright test`
- PR: GitHub Actions against Vercel preview URL
- Pre-prod: final run against staging before promoting
- Post-prod: smoke suite against production URL

Specs (each a `.spec.ts` under `e2e/`):

| Spec | Coverage |
|---|---|
| `auth.spec.ts` | Login, logout, allowlist enforcement, route guards by role |
| `projects.spec.ts` | Admin create/edit/archive; manager read-only |
| `workers.spec.ts` | Admin CRUD; soft-delete preserves historical entries |
| `manual-entry.spec.ts` | Manager adds time + materials from week calendar |
| `voice-log.spec.ts` | Mocked SpeechRecognition → review screen → confirm → appears in timeline |
| `week-lock.spec.ts` | Admin locks → manager 403 on save → admin edits with reason → audit row |
| `reports.spec.ts` | Weekly totals math + CSV export shape |
| `dashboard.spec.ts` | Progress bars reflect recent writes; budget-burn alert triggers |
| `financials.spec.ts` | Profit math across fixtures |
| `offline.spec.ts` | (v1.5) IndexedDB queue + sync-on-reconnect |

### Mocking strategies

**SpeechRecognition**: Playwright injects a fake `window.SpeechRecognition` via `addInitScript` that emits a canned transcript on `.start()`. No real mic access needed in tests.

**Anthropic**: test envs route to a local Edge Function that returns canned JSON. Separately, a nightly "real AI smoke" (§Production smoke below) hits the live API.

### Device coverage
Playwright runs against:
- Desktop Chrome (primary dev)
- Desktop Safari (Alex's laptop likely)
- Mobile Safari emulation (Gavin's iPhone — critical)
- Mobile Chrome emulation (Android, secondary)

Mobile Safari emulation is close but not identical to real iOS Safari. Pre-launch manual QA on a real iPhone is mandatory for voice-log and PWA install flows.

## Production smoke — Playwright (post-deploy + nightly)

**Scope**: deployed production URL. Bare minimum: doesn't regress on deploy.

Runs:
- After every Vercel production deploy (via GH Action webhook)
- Nightly via cron

Specs:
- Homepage loads; no JS errors
- Login with synthetic test account → dashboard renders
- Mocked-mic canned voice log → save succeeds → entry visible in project timeline
- CSV export → downloaded file matches shape fixture
- Sentry: zero new events in the 10 min following deploy

Fail → PagerDuty-style email alert to Alex.

## AI quality regression suite (monthly + on model change)

20 hand-curated real Gavin-style transcripts + expected parsed output. Run against live Claude API. If >1 fixture regresses, fail CI. ~$0.50 per run.

Fixtures live in `tests/fixtures/voice/`. Alex (or Gavin) can add new ones as edge cases emerge.

## CI gate — GitHub Actions

`.github/workflows/ci.yml` runs on every push + PR:

```yaml
jobs:
  build-and-test:      # lint, typecheck, unit tests, build, secret scan
  e2e:                 # needs: build-and-test — Playwright in demo mode
```

Merges to `main` blocked on green CI + E2E.

An `integration` job (local Supabase stack + `tests/integration`) is written but not yet added — the YAML is in [tests/integration/README.md](../../tests/integration/README.md). It should land as `continue-on-error` while its four known failures stand, and become a gate once they're fixed — see [ADR 009](../decisions/009-integration-tests.md) §6.

## Manual QA checklist (pre-launch + per-release)

- [ ] Mobile Safari iOS 16+: mic permission, full voice log flow
- [ ] Mobile Safari iOS 16+: PWA install prompt
- [ ] Chrome Android: mic permission, full voice log flow
- [ ] Offline: disconnect → entry → reconnect → sync (v1.5)
- [ ] Keyboard-only navigation through every screen
- [ ] VoiceOver sanity check on iOS
- [ ] Payroll CSV opens cleanly in [Alex's payroll software — TBC]
- [ ] Lighthouse: PWA ≥90, A11y ≥95, Perf ≥90 on mobile
- [ ] Sentry test event fires from both frontend + Edge Function

## Non-test safeguards

- Pre-commit hook (Husky): prettier + eslint on staged files
- `npm audit` in CI; fail on critical
- Weekly automated dep update PR (Renovate or Dependabot)
- Sentry release tracking so error traces link to commits
