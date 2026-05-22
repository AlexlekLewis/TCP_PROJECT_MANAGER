# Changelog

All notable changes to TCP (TriCoat Project Manager). Append-only log to preserve context across sessions.

Format: one section per session, newest on top. Each entry: what changed, why, files touched.

---

## 2026-05-22 (profit model) — Per-worker cost / weekly / charge-out rates + project target profit + admin weekly P&L

Alex's ask after the security audit: track project profit health and the weekly cost-vs-revenue of the team. With per-worker breakdown:
- Charge-out rate: **$65/hr universal** (billed to client)
- Internal cost: Jerry $30/hr, Gavin $50/hr, Pierce $35/hr
- Pierce also has a fixed weekly stipend ($900 default, mature 2nd-year apprentice — Alex to refine)
- Owner draw: Alex $1,250/week (fixed cost on the business; projects don't bear it)

**DB** ([supabase/migrations/20260522000006_profit_model_rates_and_targets.sql](supabase/migrations/20260522000006_profit_model_rates_and_targets.sql))
- `workers.hourly_rate` renamed to `cost_rate` (clarity: it's the per-hour cost to employ).
- New `workers.weekly_wage` (numeric, default 0 — owner draw or apprentice stipend).
- New `workers.charge_out_rate` (numeric, default 65 — billed to client).
- New `projects.target_profit` (numeric, nullable — Alex sets at quote time).
- `workers_visible` view refreshed to mask all three rate columns for non-admin.
- `projects_visible` view refreshed to mask `target_profit` for non-admin.
- `get_worker_rate(uuid)` returns the renamed `cost_rate`.
- Live seed: Alex cost=0 weekly=1250, Gavin cost=50, Jerry cost=30, Pierce cost=35 weekly=900; all charge=65.

**Frontend**
- [src/types/db.ts](src/types/db.ts) — `Worker` has three rate fields; `Project` has `target_profit`. All admin-only (nullable for non-admin).
- [src/lib/aggregations.ts](src/lib/aggregations.ts) — full rewrite:
  - `computeProjectTotals` now emits `labourRevenue` (hours × charge_out), `projectedProfit`, `targetProfit`, and `profitHealth` (`on_track` ≥ target, `at_risk` within 10% under, `over_budget` more than 10% under). Legacy quote-based profit math preserved.
  - New `computeWeeklyPnL(entries, materials, workers)` — revenue, hourly labour, fixed weekly wages (charged only when worker logged hours), materials, profit, margin %.
  - `computeWorkerWeek` now returns `totalRevenue` alongside cost so the per-worker contribution view can render.
- [src/lib/aggregations.test.ts](src/lib/aggregations.test.ts) — 10 specs covering cost vs revenue, profit health buckets, apprentice weekly+hourly cost, owner-draw inclusion, and the "no hours logged → no weekly wage" edge.
- [src/components/features/ProjectForm.tsx](src/components/features/ProjectForm.tsx) — added "Target profit $" input (the **Set profit** Alex asked for).
- [src/pages/Workers.tsx](src/pages/Workers.tsx) — WorkerDialog rewritten with three rate inputs (cost/h, fixed weekly, charge-out/h). List row shows all three as a compact line.
- [src/pages/ProjectDetail.tsx](src/pages/ProjectDetail.tsx) — new "Profit vs target" StatCard renders below Gross margin when target_profit is set, coloured by health bucket (green/amber/red).
- [src/pages/Admin.tsx](src/pages/Admin.tsx) — new top section: weekly P&L cards (revenue, labour, materials, profit + margin %) and a per-worker contribution table (hours, revenue, cost, contribution). Week navigation chevrons.
- [src/lib/demo.ts](src/lib/demo.ts) — demo seed updated to the same values as live + `target_profit` added on each project.
- Reports + Dashboard renamed `hourly_rate` → `cost_rate` references.

**Quality** — 52/52 vitest (up from 46), 102/102 Playwright, typecheck + build clean.

---

## 2026-05-22 (post-Gavin) — Manager lockdown audit + project-budget masking + bug-fix migration

After Gavin's profile landed, Alex asked: "make sure he cannot access or hack into admin level." Did a full attack-surface pass impersonating Gavin's session in SQL.

**Bug found + fixed** — [20260522000004_restore_current_role_name_execute.sql](supabase/migrations/20260522000004_restore_current_role_name_execute.sql)
The earlier `lock_down_definer_function_exposure` migration revoked `execute on current_role_name()` from `authenticated`. But `is_admin()` / `is_manager()` are INVOKER (run as caller) and call `current_role_name()` internally — so any RLS policy referencing `is_admin()` was failing with "permission denied for function" for *every* authenticated user, including admin. Would have blocked Alex's first attempt to create a real project. Restored grant.

**Project-budget masking** — [20260522000005_hide_project_budget_from_manager.sql](supabase/migrations/20260522000005_hide_project_budget_from_manager.sql) + [src/hooks/useProjects.ts](src/hooks/useProjects.ts)
Audit revealed `select * from projects` returned `quoted_price` + `materials_budget` to manager in the raw payload. Same pattern we fixed for workers — `projects_visible` view with `security_invoker = false` returns those two as null unless `is_admin()`. Base table `select` revoked from authenticated; `select (id)` granted to support `useCreateProject`'s INSERT...RETURNING id. `useProjects` / `useProject` switched to read from the view. `useCreateProject` now does insert → re-fetch from view (two queries).

**Attack matrix run as Gavin** — verified the lockdown end-to-end:

| Attack | Result |
|---|---|
| `select * from workers` directly | blocked (permission denied) |
| `select * from workers_visible` | rates returned as NULL ✓ |
| `update profiles set role='admin' where id=auth.uid()` | 0 rows affected (no UPDATE policy on profiles) ✓ |
| `select * from audit_log` | 0 rows (RLS admin-only) ✓ |
| `insert into week_locks(...)` | blocked by RLS write-check ✓ |
| `insert into projects(...)` | blocked by RLS write-check ✓ |
| `current_role_name()` direct RPC | callable (needed by RLS — restored) |
| `get_worker_rate(uuid)` direct RPC | returns NULL (function gates on is_admin) ✓ |
| `insert into profiles values(...,'admin',...)` | blocked by RLS (no INSERT policy) ✓ |
| `select * from projects` | blocked (permission denied) ✓ |
| `select * from projects_visible` | quoted_price=NULL, materials_budget=NULL, quoted_hours visible ✓ |
| `delete from profiles where id != auth.uid()` | 0 rows affected ✓ |
| `update settings set overhead_percent=99` | 0 rows affected ✓ |
| `log_locked_write()` direct RPC | blocked (revoked) ✓ |

**Known residual exposure (deferred)** — `material_entries.cost` is still readable to manager via `select * from material_entries`. Lower priority: managers log materials themselves so they know their own values; in a 2-person team the only "leaked" rows are admin-entered ones. Fix would mirror the projects pattern. Documented for a future session.

**Quality** — 46/46 vitest, typecheck clean, build clean (224 KB gz).

---

## 2026-05-22 (go-live prep) — Manager can no longer read hourly_rate, ever

Before bringing Gavin online, Alex asked to confirm "manager can only see hours, never costs". Answer: **no, not until now**. The UI hid the rate column via `useCanSeeFinancials()` but the underlying `useWorkers` query did `select * from workers` and returned `hourly_rate` in the JSON payload — a curious manager opening DevTools would have seen everyone's pay rate.

**DB** ([supabase/migrations/20260522000003_hide_worker_rate_from_manager.sql](supabase/migrations/20260522000003_hide_worker_rate_from_manager.sql))
- `revoke select on workers from anon, authenticated` — direct base-table reads denied for both roles.
- New `workers_visible` view with `security_invoker = false` returning `case when is_admin() then hourly_rate else null end`. Manager sees null; admin sees the real number.
- Dropped the superseded `workers_public` (it was security_invoker = true and no longer reachable with base-table SELECT revoked).
- Verified by querying the view from the MCP (service role has no auth.uid → is_admin() false → all 4 workers returned with `hourly_rate: null`).

**Frontend**
- [src/hooks/useWorkers.ts](src/hooks/useWorkers.ts) — switched the SELECT to `from('workers_visible')`.
- [src/types/db.ts](src/types/db.ts) — `Worker.hourly_rate` widened to `number | null` with a comment explaining when each shows up.

**Compatibility check** — `Worker.hourly_rate` is read in 6 places (aggregations, ProjectDetail labour-cost calc, Reports payroll math, Workers admin page, Dashboard breakdown, demo seed). Five already null-coalesce via `Number(rate ?? 0)` or `?? 0`; the sixth (Workers.tsx) is admin-only via route guard, never rendered for manager. Typecheck + 46/46 unit + build all clean.

**Advisor**: 1 expected new "security_definer_view" warning (lint 0010) on `workers_visible`. Intentional — the view's narrow purpose (single masked column, gated by `is_admin()`) is documented in the migration. Other 3 lints unchanged.

---

## 2026-05-22 (latest) — Supabase project re-created in AlexlekLewis's Org + all 8 migrations applied

Alex wanted `tricoat-pm` moved out of his personal Vercel-managed Free org into `AlexlekLewis's Org` (the org the Supabase MCP can reach). Dashboard transfer was offered first; he authorized the $10/month Pro slot and asked to re-create fresh instead.

**New project**
- Name: `tricoat-pm`
- Ref: `kihptbwdbkqmopnrtdew` (old: `yvopfgylhqbkiqfvuqwu` — to be deleted by Alex)
- Region: `ap-southeast-2` (Sydney)
- URL: https://kihptbwdbkqmopnrtdew.supabase.co
- Org: `AlexlekLewis's Org` (`wyfwthhokirksvrnblsb`)
- Cost: $10/month (authorized in chat)
- Created via `create_project` MCP tool — Postgres 17.6.1.121

**Migrations applied via `apply_migration` MCP, in order**
1. `schema` — 9 tables, 3 enums, 9 indexes
2. `functions` — 8 helpers + 3 triggers + `save_voice_log_entries` RPC
3. `rls` — all tables enabled, week-lock-aware insert/update/delete
4. `seed_workers` — Alex, Gavin, Jerry, Pierce @ $0/hr
5. `security_hardening` — `search_path` pinned + reason-required for locked-week admin writes + week_locks audit
6. `per_task_and_warnings` — `time_entries.task` + `projects.daily_hours_warning`
7. `payroll_integrity_hardening` — `created_by` default + RLS WITH CHECK + `workers_public` view + `get_worker_rate` + `uuid_for_week`
8. **NEW** `lock_down_definer_function_exposure` ([supabase/migrations/20260522000002_lock_down_definer_function_exposure.sql](supabase/migrations/20260522000002_lock_down_definer_function_exposure.sql))

`get_advisors` reduced from 10 WARN lints → 2 by revoking `execute` on internal SECURITY DEFINER functions:
- `revoke execute on current_role_name()` from public/anon/authenticated — internal helper consumed only by `is_admin`/`is_manager`.
- `revoke execute on log_locked_write()` + `log_week_lock_change()` from all three — these fire only as triggers, never as RPCs.
- `revoke execute on get_worker_rate(uuid)` + `save_voice_log_entries(...)` from public/anon — kept the `authenticated` grant since those ARE meant to be invoked by signed-in users.

Two remaining WARN lints (`get_worker_rate` + `save_voice_log_entries` on `authenticated`) are by design — accepted and documented in the migration file.

**Local pointer updates** (all gitignored, kept locally; mentioned here for posterity)
- `.env.local` — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` updated to new ref + key
- `supabase/.temp/project-ref` — points at the new ref
- Memory: `reference_supabase_project.md` rewritten with new ref + org + plan + applied-migration list; `MEMORY.md` index line updated

**What's still on Alex's plate**
1. Pause/delete the old project at https://supabase.com/dashboard/project/yvopfgylhqbkiqfvuqwu (free tier — costs nothing while idle, but tidy).
2. Update Vercel production env vars: add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` pointing at the new project (currently only stale Firebase vars are configured; the prod deploy runs on demo mode so nothing's broken — yet). I asked permission before touching Vercel env via CLI; awaiting decision.

---

## 2026-05-22 (even later) — Dev-team review #2 + payroll-integrity hardening

Five blind specialist reviews (FE / Postgres / QA / AppSec / Product) audited the codebase end-to-end. Synthesised in [docs/dev-team-review-2.md](docs/dev-team-review-2.md). Consensus verdict: **"safe to keep building, not yet safe to cut a payroll cheque from."** Ten fixes applied tonight; eight deferred to dedicated sessions.

**Backend — payroll-attribution integrity** ([supabase/migrations/20260522000001_payroll_integrity_hardening.sql](supabase/migrations/20260522000001_payroll_integrity_hardening.sql))
- `time_entries.created_by` (and `material_entries`, `voice_logs`) now `default auth.uid()` AND the insert RLS policies enforce `created_by = auth.uid()`. A compromised manager session can no longer attribute hours to another user.
- `workers.hourly_rate` no longer world-readable. New `workers_public` view (security_invoker, no rate column) + `get_worker_rate(uuid)` SECURITY DEFINER function returning the rate only when `is_admin()`. When Alex adds employee #3, their pay rate stays admin-only.
- `audit_log.row_id` for `week_locks` now deterministic via `uuid_for_week(date) = md5(date)::uuid` so audit rows join back to the locked week.

**Frontend — high-impact bugs**
- **[src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx)** — mobile bottom nav previously `.slice(0, 5)` which silently dropped Workers + Admin (positions 6 + 7) for admin viewing on phone. Now scrolls horizontally with `overflow-x-auto` + `shrink-0` so the whole nav is reachable.
- **[src/hooks/useTimeEntries.ts](src/hooks/useTimeEntries.ts)** — new `useBatchCreateTimeEntries` does a single `insert([...])` so "Same as yesterday" is atomic. Network drop mid-loop no longer produces a half-cloned day.
- **[src/components/features/DayEntryDialog.tsx](src/components/features/DayEntryDialog.tsx)** — `cloneYesterday` rewritten to use the batch hook.
- **[src/hooks/useProjects.ts](src/hooks/useProjects.ts)** — `useProjectCanDelete` now issues real `count: exact, head: true` queries against `time_entries`, `material_entries`, `voice_logs` in production. Returns `boolean | undefined` so the UI can render "Delete (checking…)" while the query is in flight instead of lying with `true`.
- **[src/pages/ProjectDetail.tsx](src/pages/ProjectDetail.tsx) + [src/pages/Projects.tsx](src/pages/Projects.tsx)** — delete dropdown items handle the 3-state result: disabled with "(checking…)" when undefined, enabled "Delete permanently" when true, disabled "Delete (has entries)" when false. Admin no longer sees an enabled Delete that fails with an FK error toast.

**QA — flake-proofing + missing unit coverage**
- **[src/pages/WeekCalendar.tsx](src/pages/WeekCalendar.tsx)** — every day cell now carries a stable `data-testid` (`today-cell` for today, `day-cell-{iso}` otherwise). Specs no longer couple to Tailwind class strings.
- **[src/pages/Reports.tsx](src/pages/Reports.tsx)** — `SummaryCell` emits `data-testid="summary-{label-kebab}"` on its value so payroll-integrity assertions can read the stat without DOM-walking.
- **[e2e/smoke.spec.ts](e2e/smoke.spec.ts) + [e2e/manager-landing.spec.ts](e2e/manager-landing.spec.ts)** — old `[class*="ring-1 ring-ring"]` selector replaced with `getByTestId('today-cell')` in both.
- **[src/lib/dates.test.ts](src/lib/dates.test.ts)** — new unit suite (12 tests): Monday-start week math for AU locale, year-boundary weeks (Dec 2025 → Jan 2026), Sunday + Friday + midweek inputs, week labels, `daysBetween` symmetry.
- **[src/lib/csv.test.ts](src/lib/csv.test.ts)** — extended from 3 to 8 specs: O'Brien apostrophes pass through un-quoted, "paint, undercoat" gets quoted, embedded `\n` and `\r` are quoted intact, numeric values render unquoted.
- **[e2e/payroll-csv.spec.ts](e2e/payroll-csv.spec.ts)** — new spec asserting (a) CSV header schema = `[date, worker, project, hours, rate, amount, notes]`, (b) row count > 0 and sum(hours) matches the on-screen Total hours stat to the tenth, (c) every row's `amount === hours × rate` to the cent, (d) manager has zero access to the Payroll CSV button.

**Security — CI gate**
- **[.github/workflows/ci.yml](.github/workflows/ci.yml)** — secret-scan regex extended to catch `sb_secret_*` and `sbp_*` prefixes (Supabase secret keys + access tokens). `sb_publishable_*` still allowed — those are anon keys, public-by-design.

**Quality**
- Unit: **46 / 46** green (up from 33).
- E2E: **102 / 102** specs green across chromium + mobile-safari, no flake on repeat-each=2 of the new payroll-csv suite.
- `npm run build` clean (224 KB gz).
- Migration is forward-only, no data mutated; safe to apply against the live `tricoat-pm` Supabase project when Alex flips off demo mode.

**Deferred to future sessions** (full list in dev-team-review-2.md)
- `useAllTimeEntries` pagination/date-window (year-3 cliff).
- RLS integration test matrix against Supabase Docker (mid-priority).
- `save_voice_log_entries` `reason` parameter (voice unwired so low actual exposure).
- Per-user rate limit on `parse-voice-log` edge function.
- Xero/MYOB native payroll-CSV format (product roadmap, not engineering).

---

## 2026-05-22 (later) — Real brand identity: indigo wordmark + Logo component

Alex shared the actual Tricoat Painting & Decorating logo. Swapped from the generic platinum theme to the real visual identity.

**Brand colours** ([src/index.css](src/index.css))
- **Primary → Tricoat indigo** `hsl(240 60% 28%)` — the colour of the TRICOAT wordmark. Cascades through every primary button, ring, focus state, and active nav item.
- Added `--brand-indigo` + `--brand-indigo-soft` tokens for tinted accents.
- Kept `--brand-accent` (burnished copper) for the secondary CTA (e.g. "Log today's work" button) — copper-on-indigo is a deliberate complementary pairing.
- Foreground bumped to `240 14% 10%` for slightly cooler black to harmonise.
- Dark mode mirror: primary `hsl(240 60% 70%)` (lifted lightness for contrast on dark).
- `theme-color` meta tag in [index.html](index.html) updated to `#1f1f73` so iOS Safari address bar tints with the brand.

**New [src/components/Logo.tsx](src/components/Logo.tsx)** — drop-in component:
1. Tries `/logo.svg` first (preferred — vector, scales)
2. Falls back to `/logo.png` (raster)
3. Then falls back to a **CSS wordmark** using the indigo brand token — typographic "TRICOAT" with optional "Painting & Decorating" tagline

So the moment Alex drops his SVG/PNG into `/public/logo.svg` (or `.png`), the component picks it up across the whole app. Until then, the wordmark fallback already looks branded.

**Wired into:**
- [AppLayout.tsx](src/components/layout/AppLayout.tsx) — top bar now shows `<Logo size="sm" /> · PM` instead of the platinum gradient square
- [Login.tsx](src/pages/Login.tsx) — `<Logo size="lg" withTagline />` centred above a "Project Manager" subtitle. Smoke spec updated to assert the new wordmark text.

**Quality**
- `npm run build` clean (230 KB gzipped)
- **96 / 96 Playwright specs** green across chromium + mobile-safari (smoke spec updated to look for `TRICOAT` + `Project Manager` instead of the old `Tricoat · PM`)
- Re-deployed: https://tcpprojectmanagerbuild.vercel.app

**For Alex**: drop your actual logo file at `public/logo.svg` (preferred) or `public/logo.png` and the Logo component will use it everywhere automatically. No code change required.

---

## 2026-05-22 — Per-task time entries + per-project daily soft cap with flag-but-don't-block logic

Alex's ask: per-task time, assign workers to different jobs on the same day, tally the worker's day, **flag (don't block) when a worker has been assigned more than X hours/day on a job**.

**Schema** ([supabase/migrations/20260518000001_per_task_and_warnings.sql](supabase/migrations/20260518000001_per_task_and_warnings.sql))
- `time_entries.task text` — optional free-text label (e.g. "Ceilings", "Skirtings"). No FK to a task table — overkill for a 4-person crew.
- `projects.daily_hours_warning numeric(4,2)` — optional soft cap with CHECK (`null OR 0 < x ≤ 14`). When a worker logs more than this on the project in a single day, the UI flags it. **DB does not enforce it** (flagging, not blocking, per the request).

**ProjectForm**
- New "Daily hours warning per worker (optional)" field on every project. Help text explicit about "soft cap — the day-entry screen shows a flag when exceeded, but the save still goes through".
- Demo seed sets sensible defaults: Northcote 8h, Preston 8h, Belmore 6h, Ivanhoe null.

**DayEntryDialog — three new behaviours**
1. **Task input** — new optional field alongside Worker / Project / Hours / Notes. `<datalist>` auto-suggests from today's existing task labels so typing "Ceil" surfaces "Ceilings" as a one-tap option.
2. **Day tally panel** — new section under existing entries. Per worker: total hours + per-project breakdown. Projects exceeding their soft cap render in warning yellow + show `(8h cap)` annotation. Header shows a banner if any worker is over any cap.
3. **Inline preview warning** — as Gavin picks worker + project + hours, if the new entry would push that worker over the project's soft cap, an amber preview panel renders inside the Add Time fieldset *before* he clicks save. Save still proceeds; toast confirms with the warning text.
4. **Existing entry rows** — show a `[TASK]` chip next to the worker name and an "Over cap" badge with yellow-tint row background when the worker × project total for that day exceeds the soft cap.

**Demo seed** also updated to show the flow:
- Jerry on Monday: split across two task entries on Northcote (4h Trims + 6h Ceilings = 10h total, **over** the 8h cap → flag)
- Pierce split across two projects on Monday (Preston 3h Prep + Belmore 4.5h Undercoat = 7.5h)
- A `Walls` task on Preston for Gavin

So opening the dialog on this week's Monday immediately shows the per-task chips, the tally panel with Jerry's 10h split across two tasks, and the "Over cap" badge.

**WeekCalendar** — extended `?log=` deep-link to accept ISO dates (e.g. `?log=2026-05-18`) as well as `today`. Lets the timeline + future quick-actions link directly at a specific day.

**Specs ([e2e/per-task-and-cap.spec.ts](e2e/per-task-and-cap.spec.ts), 5 tests)**
- Time entry captures an optional task label (and renders as a chip)
- Day tally panel shows per-worker totals + per-project breakdown
- Soft cap flag triggers for Jerry on Northcote (over 8h on Monday)
- Existing entries show "Over cap" badge inline when worker × project > cap
- Live preview warning appears in Add Time form *before* save when the addition would exceed the cap

**Suite total: 96 / 96 passing across chromium + mobile-safari.** Unit tests: 33 / 33 still green (Project + TimeEntry interface bumps required two fixture updates).

**Build + deploy**
- Typecheck clean; build 230 KB gzipped
- Caught + fixed one cascade: `VoiceReview.tsx` time-entry mutation needed the new `task: null` field
- Live: https://tcpprojectmanagerbuild.vercel.app

The flow now: Gavin opens app → manager landing → taps a Quick-Log chip ("Jerry · Northcote") → dialog opens with Worker + Project pre-filled, Hours focused → fills `4h` + Task `Ceilings` → Add time. If he's about to push Jerry over the 8h cap, the amber preview tells him before he hits save. The toast confirms with the warning so it's audited but never blocked.

---

## 2026-05-18 — Dedicated manager landing + day-entry ergonomics; suite now 86/86

Alex asked "is there a dedicated landing for Gavin and what does it look like ergonomically?". There wasn't — both roles landed on the monitoring-shaped Dashboard. Built a recording-shaped landing for the manager + tightened the dialog.

**New [ManagerLanding](src/pages/ManagerLanding.tsx)** (rendered when `role === 'manager'`)

Stack, top → bottom:
1. **Hero CTA** — "Log today's work" with brand-copper button → `/calendar?log=today`
2. **Today panel** — entries already logged today, grouped by row (worker · project · hours). Tap a row to jump into the dialog. Empty-state hints at the CTA above.
3. **Quick log chips** — top 5 worker × project combos from the last 7 days, deep-linked with `?worker=ID&project=ID` so one tap fills the form
4. **This week strip** — one-line summary (`72h · 3 workers · 3 projects`), tap to /calendar
5. **Active projects strip** — compact, hours-only (no $), tap to detail

Admin still gets the existing monitoring dashboard (stat cards + burn alerts + financial project cards). Routing logic in [Dashboard.tsx](src/pages/Dashboard.tsx): `role === 'manager' ? <ManagerLanding/> : <AdminDashboard/>`.

**[DayEntryDialog](src/components/features/DayEntryDialog.tsx) ergonomics tightened**

1. **Hours preset chips** — `[2 4 6 7.6 8 10]` below the Hours input. One tap fills the value. Active chip styled with brand-copper. Saves the keyboard on a phone with paint on a thumb.
2. **"Same as yesterday" shortcut** — when today is empty AND yesterday has entries, a dashed copper-tinted button at the top of the dialog clones yesterday's entries into today. Skips inactive workers / archived projects. Toast confirms count copied. Hidden once today has entries.
3. **Auto-focus the Hours input** as soon as worker + project are picked. Removes a tap.
4. **URL-param prefill** (`?worker=X&project=Y`) — the dialog accepts `initialWorkerId` + `initialProjectId` props; WeekCalendar reads them off the URL and passes through. This is what the quick-log chips use.

**Specs — 6 new tests in [e2e/manager-landing.spec.ts](e2e/manager-landing.spec.ts)**
- Manager sees Today + week strip + quick-log + active projects
- Manager landing has zero `$` anywhere
- Admin still sees the monitoring dashboard (Labour cost + Materials stat cards present)
- Quick-log chip pre-fills the dialog so Worker + Project are no longer on their placeholders
- Hours preset chips fill the input (8 → '8', then 4 → '4')
- "Same as yesterday" copies prior-day entries (when today is empty)

Plus updates to existing specs to match the new manager landing wording.

**Suite total: 86/86 passing across chromium + mobile-safari.**

**Build + deploy**
- Typecheck clean
- `npm run build` — 224 KB gzipped
- Redeployed to https://tcpprojectmanagerbuild.vercel.app

The flow Gavin actually does is now:
1. Open app → land on Today
2. Tap a quick-log chip ("Jerry · Northcote") → dialog opens with worker + project pre-filled, hours input focused
3. Tap "8h" preset → hours fills
4. Tap Add time → done

Three taps from app-open to logged entry. Or — if today's work is identical to yesterday's — two taps: "Same as yesterday" → confirm.

---

## 2026-04-22 (latest) — Manager input bugs found + fixed; suite now 74/74

Alex's poke-around feedback: "Gavin can't actually input any information." Reproduced live and found two real issues.

**Issues**
1. **Discoverability.** Gavin lands on the Dashboard. There was no prominent CTA pointing at the daily entry flow — he had to learn the navigation (Week → click a day → drawer opens). For the manager's primary daily job that's a friction wall.
2. **$ leak in DayEntryDialog.** The "Materials today" list inside the day-entry drawer was still showing $340.00 to the manager (the rest of the role-gating I did yesterday covered Dashboard / Reports / Project Detail / Projects list / Week Calendar materials section, but not this specific list inside the drawer).

**Fixes**
1. **New primary CTA on the Dashboard** — "Log today's work" card with a brand-copper button that links to `/calendar?log=today`. [WeekCalendar.tsx](src/pages/WeekCalendar.tsx) reads the query param on mount and auto-opens the day-entry dialog for today, then clears the param so refresh doesn't re-open it. Visible to both roles.
2. **Gated `formatCurrency` on the Materials today list** in [DayEntryDialog.tsx](src/components/features/DayEntryDialog.tsx). Manager now sees description + project + supplier; admin still sees the cost. The `Add Material` form's Cost input remains visible to both — the manager is the one entering the receipt.

**New specs ([e2e/log-today-cta.spec.ts](e2e/log-today-cta.spec.ts), 4 tests)**
- Manager sees the CTA on the dashboard, clicking it lands on /calendar with the dialog open
- Admin sees the same CTA
- Manager day-entry dialog renders the materials list with NO `$` anywhere
- Admin day-entry dialog still shows `$340.00` on the seeded Haymes entry

**Test infra hardening**
- Parallel-execution flake: at 6 workers across chromium + mobile-safari, two tests began racing on the shared Vite dev server. Capped local workers to 4 and turned on `retries: 1`. Re-ran twice to confirm stable: **74 / 74 passing.**
- [projects-crud.spec.ts](e2e/projects-crud.spec.ts) explicitly serialised — these tests share more state than the others.

**Build + deploy**
- Typecheck clean
- 74 / 74 green twice in a row at 4 workers
- Live at https://tcpprojectmanagerbuild.vercel.app with the CTA + $ gate baked in

---

## 2026-04-22 (late) — Adversarial Playwright suite: 66/66 green across chromium + mobile-safari

Ran the supervisor (Gavin) + admin (Alex) adversarial Playwright suite end-to-end, found weaknesses, fixed them, re-ran until green, redeployed.

**New test specs ([e2e/](e2e/))**
- [roles.spec.ts](e2e/roles.spec.ts) — 12 specs. Manager: no $ on dashboard / project detail / projects list / reports; no admin nav links; direct nav to `/workers` and `/admin` redirects to `/`; no three-dot menu on project cards; no Edit / More-actions on project detail. Admin: financial stat cards visible, gross margin shown, CSV exports + Lock button present, Workers reachable.
- [timeline.spec.ts](e2e/timeline.spec.ts) — 5 specs. Page header + range badge, all 3 demo projects, "Who's on what — this week" table with all workers as rows, click bar → project detail, prev/today/next navigation cycles the window.
- [projects-crud.spec.ts](e2e/projects-crud.spec.ts) — 5 specs. Create / archive+restore round-trip / delete-disabled-when-entries-exist / hard-delete works for entry-free project + redirects to /projects.
- [day-entry.spec.ts](e2e/day-entry.spec.ts) — 3 specs. Add time entry shows up immediately, hours > 14 rejected with toast, add material entry with cost+supplier.
- [week-lock.spec.ts](e2e/week-lock.spec.ts) — 3 specs. Admin lock/unlock round-trip, Locked badge appears on Reports header, badge also surfaces on the week calendar via SPA link.

**Weaknesses found and fixed**
1. **Demo role didn't persist across page reloads.** Switching to manager via the toggle pill set React state but a full reload reset it to admin. Fix: persist demo role in `localStorage` (`tricoat:demoRole`). [AuthContext.tsx](src/context/AuthContext.tsx). Real UX win too — Alex/Gavin showing the app at the pub doesn't lose their view on browser refresh.
2. **Role toggle hidden on mobile viewport** (`md:flex`). Mobile Safari tests couldn't switch roles. Fix: make the demo pill visible on every breakpoint, just shorten the label on narrow screens. [AppLayout.tsx](src/components/layout/AppLayout.tsx).
3. **No stable selectors on the role pills or project cards.** Fix: added `data-testid` on the role toggle (`role-admin`, `role-manager`), the toggle group (`demo-role-toggle`), and each project card (`project-card-${p.id}`).

**Test infra**
- Two Playwright projects: **chromium** (desktop) and **mobile-safari** (iPhone 14 viewport). 33 specs × 2 = 66 test runs.
- All run against the local dev server (`webServer` config auto-starts Vite).
- Total wall time: ~25 s.
- CI workflow at [.github/workflows/ci.yml](.github/workflows/ci.yml) already wired to run Playwright on every PR with both browsers.

**Build + deploy**
- Typecheck clean
- `npm run build` — 220 KB gzipped (still single-chunk; v1.5 task)
- Redeployed to https://tcpprojectmanagerbuild.vercel.app
- Spot-checked live URL in both roles via Chrome — role pill persists, manager view shows only Hours, admin view shows full financials, Timeline renders with project bars + today marker + Who's-on-what table

**State of the test suite right now**
- 66 / 66 passing
- 5 spec files, 33 unique specs
- Covers: auth/role gating, dashboard, projects CRUD, timeline, day entry, week lock, reports CSV, role-restricted routes

What I did not write (out of scope for tonight):
- Real Supabase + RLS integration tests (Docker-based, ADR 002 says these are the v1.5 must-have — block on Supabase project unpause)
- Voice-log specs (voice is unwired in UI per your call)
- Accessibility audit specs (Lighthouse a11y already targeted ≥95 in Phase 9)

---

## 2026-04-22 — AI shelved, Timeline view, live on Vercel, board review + hardening

Alex went to sleep; this is the autonomous overnight work. **Read [docs/wake-up.md](docs/wake-up.md) first when you wake.**

**Shipped**
- **AI / voice removed from the active UI** per Alex's call. Files (`VoiceLog.tsx`, `VoiceReview.tsx`, `useVoiceLog.ts`, `voiceParser.ts`, `claudePrompt.ts`) kept on disk — re-enabling is a 5-line change to `App.tsx` + nav. Edge Functions stay deployed.
- **New `/timeline` page** ([src/pages/Timeline.tsx](src/pages/Timeline.tsx)) — Gantt-style horizontal bars across a 10-week window. Each project: tag-colour bar from `start_date → end_date`, fill = hours used / quoted (red over 100, amber over 80), today vertical line. Month-segment header, click bar → project detail. Below: **"Who's on what — this week"** table — per-worker daily hours with project colour dots. Unscheduled projects (missing dates) listed below with a CTA to set dates. Added `/timeline` to top + mobile nav.
- **Live on Vercel**: https://tcpprojectmanagerbuild.vercel.app — reused the existing `tcp_project_manager_build` Vercel project (linked via `.vercel/project.json`). Deploy via Vercel CLI succeeded. Demo mode on for first deploy so the URL works immediately with seed data.
- **3-lens board review convened** ([docs/board-review.md](docs/board-review.md)) — Margaret Voss (PM, 22 yrs trades), Dave Mannix (painter, Mannix & Sons), Marcus Holloway (Principal Engineer). Each ran independently against the codebase + PRD. Synthesized agreements + per-lens findings + action plan.

**Board-surfaced fixes I executed**
1. **Voice save uses atomic RPC.** Rewrote [VoiceReview.save()](src/components/features/VoiceReview.tsx) — in real mode now calls `save_voice_log_entries` (already in schema) in one transaction. Populates `ai_source_id` per row (was hard-coded null). Demo mode still uses in-memory per-row writes for the same UX. Closes the half-save bug Marcus flagged.
2. **Schema hardening migration** ([supabase/migrations/20260422000001_hardening.sql](supabase/migrations/20260422000001_hardening.sql)):
   - Pins `set search_path = public, pg_temp` on every `SECURITY DEFINER` function (`current_role_name`, `is_admin`, `is_manager`, `is_week_locked`, `set_updated_at`, `log_locked_write`, `save_voice_log_entries`). Closes the common Supabase audit finding.
   - Replaces `log_locked_write()` to **fail closed on manager writes to locked weeks** (belt-and-braces — RLS rejects first) and **require a `reason`** (via session `set_config('app.locked_edit_reason', ...)`) before any admin edit inside a locked week. Audit row now always has a non-null reason.
   - New `log_week_lock_change()` trigger — INSERT/DELETE on `week_locks` itself audited.
3. **Edge Function `parse-voice-log` hardened** ([supabase/functions/parse-voice-log/index.ts](supabase/functions/parse-voice-log/index.ts)):
   - CORS: removed default `*`, added explicit allowlist of prod + dev origins (overridable via `ALLOWED_ORIGINS` secret).
   - All error responses redacted to opaque codes (`unauthorized`, `empty_transcript`, `parse_failed`, `internal_error`). Raw `e.message` now only goes to `console.error`, never to the client.

**Blocked — needs Alex on wake**
- **Supabase project `tricoat-pm` is paused** (free-tier auto-pause after 7 days). When I tried to resume it via the dashboard, Supabase blocked: *"AlexlekLewis has reached the limit of 2 active free-plan projects."* Alex needs to pause/delete a free-plan project in his other org, or upgrade `Alex Lewis' projects` to Pro.
- Until unpause: the hardening migration above is on disk but **not pushed to live DB**. Run `npx supabase db push --linked --password "..."` after unpause. The wake-up doc has the exact command.
- Anthropic API key still not set (voice is unwired anyway).
- 2 Supabase auth users + their `profiles` rows not yet created (deferred to Alex — password entry).
- Real worker hourly rates not yet set ($0 placeholders).

**Quality gates**
- `npm run typecheck` clean
- `npm run build` — 220 KB gzipped (single chunk; bundle-split is a v1.5 task)
- Live URL returns 200 with the latest build
- All board-review items either fixed or documented in the deferred list

**[docs/wake-up.md](docs/wake-up.md)** has the 5-step path from now to fully-live-with-real-backend. Total time on wake: ~10 min.

---

## 2026-04-21 — Admin archive + delete for projects

**What**
- New [src/components/ui/dropdown-menu.tsx](src/components/ui/dropdown-menu.tsx) (shadcn-style Radix wrapper) with a `destructive` variant on items.
- New [src/components/features/ConfirmDialog.tsx](src/components/features/ConfirmDialog.tsx) — shared confirm modal used by both pages. Destructive actions render the confirm button as destructive.
- Added `useArchiveProject()` (archive / unarchive), `useDeleteProject()`, and `useProjectCanDelete(id)` to [src/hooks/useProjects.ts](src/hooks/useProjects.ts). Delete hook translates Supabase FK-violation errors into a friendly "archive instead" message.
- Added `deleteProject(id)` and `projectHasEntries(id)` to [src/lib/demoStore.ts](src/lib/demoStore.ts) — mirrors the server-side behaviour so demo mode enforces the same rule.
- [Projects page](src/pages/Projects.tsx): each card now has an admin-only three-dots menu with **Edit** / **Archive** (or **Restore to active** when already archived) / **Delete permanently**. Delete is automatically disabled when the project has any time or material entries; the menu label changes to "Delete (has entries)" so the reason is visible without a tooltip.
- [ProjectDetail page](src/pages/ProjectDetail.tsx): same menu next to the Edit button. On successful delete the page redirects to `/projects` with a toast.
- Safety: **delete is payroll-safe**. Any project with time or material entries cannot be hard-deleted — the only path to remove those from active view is Archive, which preserves the record. Aligns with PRD §6 FR2 ("Soft-delete only — payroll history must remain valid"). Brand-new empty projects (typos, canceled quotes) can still be hard-deleted.

**Why**
- Alex asked for admin archive + delete from project views. Both actions are now one click + a confirm, from either the Projects list card or the project detail page. Payroll-integrity rule from the PRD is enforced at both the UI and demo-store level (and translated from Supabase FK errors when we go live).

---

## 2026-04-21 — Intentional colour pass

**What**
- Added 4 semantic colour tokens to [src/index.css](src/index.css) (both light + dark): `--brand-accent` (burnished copper, 24° 58%/46%), `--stat-hours` (teal), `--stat-labour` (sage), `--stat-materials` (amber) + their `-soft` background pairs.
- **Dashboard stat cards** now have tinted icon chips: Hours → teal, Labour → sage, Materials → amber. Platinum base elsewhere is unchanged.
- **Project cards** across Dashboard + Projects list now carry a 4 px left stripe in the project's `color_tag`. The tag is what Alex picks when creating a project (sage / ochre / rose / platinum presets already exist in the form).
- **ProjectDetail** header gets a 1.5 px coloured rule at the top of the page using the project tag — visual continuity with the card it came from.
- **Voice mic (floating)** switched from platinum primary to brand-copper — so the one action Gavin uses daily stands out.
- Demo seed project colours updated from all-grey to sage/ochre/rose/platinum so the stripes are visible in demo mode.

**Why**
- App was monochrome grey. Alex asked for colour. Kept platinum as the base (premium, on-brand) and added intentional accents where colour carries meaning: tagged projects, metric differentiation, the primary daily CTA.

---

## 2026-04-21 — Role-based financial visibility

**What**
- Added `src/lib/permissions.tsx` exporting `useCanSeeFinancials()` hook + `<FinancialOnly>` wrapper. Single source of truth: admin (Alex) sees all $ / margins / quotes / costs. Manager (Gavin) sees only labour hours.
- Gated financials across the UI:
  - **Dashboard** — hides "Labour cost this week" and "Materials this week" stat cards for manager; hides per-project Materials progress bar and Labour cost row.
  - **ProjectDetail** — hides the 4-card financial section (Labour/Materials/Quoted/Gross margin) and the $ column in Timeline + Materials tab; shows a single "Hours logged" summary card instead.
  - **Projects list** — hides the "Quote $" line on each card.
  - **WeekCalendar** — hides the $ amount on each material entry.
  - **Reports** — hides "Labour cost" and "Materials" summary cells, Cost column in Per-worker, Labour/Materials/Total columns in Per-project, and both CSV export buttons. Lock week button remains admin-only (unchanged).
- Manager can still enter material cost when logging a purchase (they're the one buying) — only aggregated displays are hidden.
- File renamed `permissions.ts` → `permissions.tsx` after the initial write — esbuild rejected JSX in `.ts`.
- Typecheck clean, visually verified in browser as both admin and manager in demo mode.

**Why**
- Alex explicitly requested: admin sees top line + live numbers; Gavin sees only labour hours, no margins/quotes/costs. Payroll integrity — the manager shouldn't know worker rates or project margins.

---

## 2026-04-21 (overnight, continued) — Migrations pushed, Edge Functions deployed

**What**
- Installed Supabase CLI as a devDependency (supabase v2.92.1 — refuses global npm install, but `npx supabase` works).
- Ran `supabase db push` against the new `tricoat-pm` project using `--db-url` (avoids interactive login). All 4 migrations applied cleanly: schema, functions+triggers, RLS policies, seed of the 4 workers (Jerry, Pierce, Gavin, Alex at $0/hr — Alex to set rates on wake).
- Hit a config-incompat error on first push (`auth.enable_confirmations` invalid key) — moved the field to `[auth.email]` and the push succeeded.
- Verified RLS is enforcing: unauthenticated REST query to `workers` returned `[]` (empty) rather than rows or a 403. Correct silent-but-secure behaviour per the RLS matrix in `docs/testing/STRATEGY.md`.
- Generated a Supabase personal access token (name: `tricoat-pm-cli`, expires 2026-05-21) via Claude-in-Chrome against account `Alex@tricoatpainting.com.au`. Stored in [docs/secrets-note.md](docs/secrets-note.md).
- Deployed both Edge Functions via the access token: **parse-voice-log** (JWT verify on) and **weekly-backup** (JWT verify off — invoked by cron).
- Bumped Supabase Postgres major version in config to 17 (matching the new project).
- Updated [.env.local](.env.local) and [docs/secrets-note.md](docs/secrets-note.md) with full "what's left" checklist for Alex.

**Blocker reached (non-destructive stop)**
- Going to console.anthropic.com with `Alex@tricoatpainting.com.au` redirected to a new-developer-account onboarding form (name + accept Anthropic commercial terms). Creating the developer account on Alex's behalf would require me to accept commercial terms for him — I don't have authorisation for that. Stopped the flow. Full recovery path in [docs/secrets-note.md](docs/secrets-note.md#anthropic-api-key) — 5 clicks + one CLI command once Alex completes onboarding.

**What's still required from Alex on wake (in order)**
1. Complete Anthropic developer onboarding + create API key (~30 s)
2. `supabase secrets set ANTHROPIC_API_KEY=...` (single command using the Supabase access token in secrets-note)
3. Create the two Supabase auth users via dashboard + insert matching `profiles` rows (SQL one-liner)
4. Set real worker hourly rates via Workers page (or SQL)
5. Flip `VITE_DEMO_MODE=false` in `.env.local`
6. `vercel --prod`

All 4 CLI steps are copy-paste ready in [docs/secrets-note.md](docs/secrets-note.md).

**Why**
- Alex authorised an autonomous overnight build and explicitly requested a standalone Supabase project. Pushing migrations + deploying Edge Functions brings us from "empty project" to "one key away from live" in ~30 min of autonomous work.

---

## 2026-04-21 (overnight) — Supabase project provisioned

**What**
- Created new Supabase project **`tricoat-pm`** via Claude-in-Chrome per Alex's instruction ("brand new standalone project").
- **Org**: *Alex Lewis' projects* — the empty Vercel-managed Free-plan org (no other projects in it; the Pro org *AlexlekLewis's Org* with 8 existing projects was deliberately not used to keep this standalone).
- **Region**: Oceania (Sydney) — `ap-southeast-2`, best latency for Melbourne.
- **Project ref**: `yvopfgylhqbkiqfvuqwu`
- **URL**: `https://yvopfgylhqbkiqfvuqwu.supabase.co`
- **Dashboard**: https://supabase.com/dashboard/project/yvopfgylhqbkiqfvuqwu
- **DB password**: auto-generated, regenerated once because Supabase pre-filled a recycled value from a prior project. Stored in `docs/secrets-note.md` (gitignored).
- **Data API**: enabled. **Auto-RLS**: disabled (we enable RLS explicitly in migrations).
- Wrote credentials to [.env.local](.env.local) and a never-committed [docs/secrets-note.md](docs/secrets-note.md) with the go-live command list. Added `docs/secrets-note.md` to [.gitignore](.gitignore).
- Demo mode **stays on** (`VITE_DEMO_MODE=true`) until `supabase db push` runs and auth users exist. The creds above are staged and the flip to real backend is a 3-character edit.

**Why**
- Alex authorised this during his overnight autonomous build. Creating the project standalone (empty Vercel-free org) matches the explicit "no other data" instruction.

**Next steps**
1. `supabase link --project-ref yvopfgylhqbkiqfvuqwu` (prompts for the DB password in secrets-note.md)
2. `supabase db push` (applies the 4 migrations)
3. Obtain Anthropic API key (Claude-in-Chrome → console.anthropic.com), then `supabase secrets set ANTHROPIC_API_KEY=...`
4. `supabase functions deploy parse-voice-log`
5. Create 2 auth users in dashboard, insert matching `profiles` rows
6. Flip `VITE_DEMO_MODE=false`, then `vercel --prod`

Full go-live checklist in [docs/secrets-note.md](docs/secrets-note.md) (local only).

---

## 2026-04-21 (late) — v1 core build complete (demo-mode runnable)

Alex asleep; autonomous overnight build per his instruction. Decisions made on his behalf are in [CLAUDE.md](CLAUDE.md) and CHANGELOG open items below.

**What shipped**
- Old domain code wiped. Fresh scaffold: React 19 + Vite 6 + TypeScript + Tailwind 3 + shadcn-style UI primitives. Build passes, 214 KB gzipped.
- **Auth** ([src/context/AuthContext.tsx](src/context/AuthContext.tsx)) — Supabase email+password; demo-mode short-circuit; role-aware (admin/manager).
- **Routing** ([src/App.tsx](src/App.tsx)) — React Router with `RequireAuth` + `RequireRole` guards.
- **Layout** ([src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx)) — top bar + mobile bottom-nav + floating mic button.
- **Pages**: [Login](src/pages/Login.tsx), [Dashboard](src/pages/Dashboard.tsx) (live labour$ / materials$ / burn-alert progress bars), [WeekCalendar](src/pages/WeekCalendar.tsx), [Projects](src/pages/Projects.tsx) + [ProjectDetail](src/pages/ProjectDetail.tsx) (Timeline / Materials / Notes tabs + Gross margin), [Workers](src/pages/Workers.tsx), [VoiceLog](src/pages/VoiceLog.tsx), [Reports](src/pages/Reports.tsx) (payroll + projects CSV, week lock), [Admin](src/pages/Admin.tsx) (locks + voice-log audit).
- **Features**: [DayEntryDialog](src/components/features/DayEntryDialog.tsx) (manual time + materials with 14h hard cap / 10h warn), [ProjectForm](src/components/features/ProjectForm.tsx), [VoiceReview](src/components/features/VoiceReview.tsx) (confidence badges, force-pick on low match per C2).
- **Voice log flow**: [useVoiceLog](src/hooks/useVoiceLog.ts) hook — Web Speech API with AU locale, on-device transcript, Edge Function call for Claude parse, local heuristic fallback in demo mode.
- **Supabase**: [migrations/](supabase/migrations) (schema + functions + RLS + seed) — 8 tables, week-lock enforced by RLS policy calling `is_week_locked()`, admin-write-in-locked-week audit trigger, atomic `save_voice_log_entries` RPC.
- **Edge Functions**: [parse-voice-log](supabase/functions/parse-voice-log/index.ts) (Claude Haiku 4.5 tool-use), [weekly-backup](supabase/functions/weekly-backup/index.ts) (Sunday CSV email via Resend).
- **Tests**: 33 unit tests (fuzzy match, hours validation, dates, CSV, aggregations, voice parser) — all green. Playwright [smoke suite](e2e/smoke.spec.ts) — 5 specs covering login, calendar, projects, reports, admin. [CI workflow](.github/workflows/ci.yml): lint + typecheck + test + build + secret-scan, then Playwright.
- **Demo mode**: [demoStore](src/lib/demoStore.ts) + fixtures in [demo.ts](src/lib/demo.ts) — app runs fully offline without Supabase, with 4 seeded projects and a week of time entries. Tap "demo as admin/manager" in header to swap roles and see RLS-gated UX.
- **Docs**: 4 ADRs ([001 stack](docs/decisions/001-tech-stack.md), [002 schema+RLS](docs/decisions/002-schema-rls.md), [003 Claude prompt](docs/decisions/003-claude-voice-parse.md), [004 deployment](docs/decisions/004-deployment.md)). Updated [README](README.md) with 5-command go-live. [Testing strategy](docs/testing/STRATEGY.md) unchanged.

**v1 scope deltas folded in (from PRD-CHALLENGE)**
- E1 — live labour $ everywhere hours appear
- E2 — budget-burn alert (>80% amber, >100% red) on dashboard + project detail
- E5 — weekly-backup Edge Function scaffolded (requires Resend key to be active)
- E6 — audit log viewer in Admin page
- E7 — fuzzy matcher with contains-bonus; unresolved phrases surface for user action in VoiceReview
- C3 — hours hard-capped at 14h, warn at 10h (DB CHECK + client validation)
- C8 — admin voice-log viewer in Admin page

**Decisions I made on Alex's behalf (flagged for review on wake)**
- Worker rates seeded at $0 — update via Workers admin page
- Payroll CSV is generic: `date,worker,project,hours,rate,amount,notes` (opens cleanly in Excel + Sheets)
- Overhead %: settings table with default 25 (editable via future admin page; column exists now)
- Week lock: manual only (no auto Fri 5pm)
- Photos (E4) — deferred to v1.5
- Offline PWA (E10) — deferred to v1.5
- AU locale throughout (en-AU, Monday-start week, AUD)

**Build quality gates**
- `npm run typecheck` — clean
- `npm run lint` — 0 errors, 4 react-refresh warnings (non-blocking)
- `npm run test -- --run` — 33/33 pass
- `npm run build` — 214 KB gzipped (single chunk — pre-optimisation, fine for v1 internal tool)
- `npm run dev` — 200 at http://localhost:5173 with demo fixtures

**Go-live checklist for Alex**
See [README.md](README.md#going-live-5-commands). In summary:
1. Create Supabase project + run `supabase link && supabase db push`
2. Create admin + manager users in Supabase dashboard, insert matching `profiles` rows with roles
3. Get Anthropic API key at console.anthropic.com → `supabase secrets set ANTHROPIC_API_KEY=...`
4. `supabase functions deploy parse-voice-log`
5. `vercel link && vercel env add ... && vercel --prod`

**Open items for next session**
- I did not obtain the Anthropic API key (needs Alex's account via Claude-in-Chrome — flag to do next session if Alex agrees)
- Integration tests (Supabase Docker in CI) — scaffolded directory, specs to write in v1.5
- Final theme extraction from https://www.tricoatpainting.com.au/ (currently using neutral platinum Tailwind tokens)
- Bundle-split Supabase + Radix for <100 KB initial chunk

---

## 2026-04-21 — Pivot: Supabase + AI voice. PRD drafted.

**What**
- Major scope + stack change. Replaced Firebase backend with **Supabase** (Postgres + Auth + RLS + Edge Functions). Added **AI voice-entry** flow: browser Web Speech API → Supabase Edge Function → Claude Haiku 4.5 (tool use) → review screen → atomic write.
- Existing `src/` domain (element-phase tracking) to be wiped on PRD sign-off — it's the wrong mental model for a time/materials tracker.
- Workers confirmed: Jerry, Pierce, Gavin, Alex. Users: admin (Alex) + manager (Gavin) only. Branding: platinum/silver (ref https://www.tricoatpainting.com.au/).
- Produced comprehensive planning set:
  - [docs/PRD.md](docs/PRD.md) — 16 sections: problem, goals, flows, functional + non-functional reqs, architecture, data model, RLS, testing, phased build plan (~35h), risks, roadmap
  - [docs/PRD-CHALLENGE.md](docs/PRD-CHALLENGE.md) — self-review with 10 challenges (C1–C10) + 19 feature proposals (E1–E19) + 5 anti-features. Recommends folding 8 items into v1.
  - [docs/decisions/001-tech-stack.md](docs/decisions/001-tech-stack.md) — ADR for React+Vite+TS / Tailwind / Supabase / Claude / Playwright
  - [docs/testing/STRATEGY.md](docs/testing/STRATEGY.md) — Vitest unit + integration, Playwright E2E + production smoke, AI quality regression suite
- Rewrote [CLAUDE.md](CLAUDE.md) to reflect new stack, data model, commands, conventions, branding.
- Updated persistent memory files to new product scope.
- Confirmed Tricoat Painting website via search: https://www.tricoatpainting.com.au/

**Why**
- User pivoted backend (Supabase > Firebase for relational + RLS-enforced week lock), added conversational-voice AI as the killer differentiator for on-site manager adoption.
- PRD discipline up-front minimises rebuilding later; documents + ADRs + challenge doc ensure the plan survives context compaction.

**Open items for next session (Phase 1 kickoff)**
- Alex to review [docs/PRD.md](docs/PRD.md) + [docs/PRD-CHALLENGE.md](docs/PRD-CHALLENGE.md) and sign off or redirect
- 7 open questions at [PRD §15](docs/PRD.md#15-open-questions) + 6 questions at [PRD-CHALLENGE Part 4](docs/PRD-CHALLENGE.md#part-4--questions-for-alex)
- Decide v1 scope deltas (recommend folding in E1, E2, E3, E5, E6, E7, plus C3 hours cap)
- On sign-off: wipe `src/`, `firebase.json`, `.firebaserc`, `eslint.config.js`, start Phase 1 scaffold
- Anthropic API key acquisition deferred to Phase 3 (will drive via Claude-in-Chrome MCP → console.anthropic.com)

---

## 2026-04-20 — Project kickoff, repo review, dev-team audit

**What**
- Cloned repo from https://github.com/AlexlekLewis/TCP_PROJECT_MANAGER into local working directory.
- Installed Vercel CLI globally (`/Users/alexlewis/.npm-global/bin/vercel`, v51.8.0) and appended the npm-global bin dir to `~/.zshrc` PATH.
- Reviewed existing MVP: React 19 + Vite + Firebase (Auth + Firestore), 1263 LOC across ~18 components. Functional skeleton with Dashboard, ProjectDetail, TodayView, Login + modals.
- Added `CLAUDE.md` (architecture brief) and this `CHANGELOG.md` to survive context compaction.
- Added `vercel.json` for SPA rewrites so client-side routing works on Vercel.
- Ran `npm install` (286 pkgs), `npm run build` (passes, 573KB JS / 176KB gzip), `npm audit`: 22 vulns (2 critical, 12 high) — nearly all in vite dev dependency (dev-server only).
- Seeded persistent memory under `~/.claude/projects/.../memory/` (5 entries: project overview, deploy target, changelog rule, repo URL, vercel path).
- Ran app-dev-team discovery audit (Track 2 — existing app). Findings below.

**P0 findings from audit**
- **No Firestore security rules in repo.** Project is wide-open to anyone with the Firebase API key (which is bundled in the client). Must add `firestore.rules` + deploy before any live use.
- **Array-write race in DataContext.** `addElement`, `updateElementPhase`, `deleteElement`, `addTask`, `updateTask`, `deleteTask` all read `project.elements/tasks` from local snapshot state, then `updateDoc` the whole array. Two rapid clicks = silent write lost. Needs either `arrayUnion/arrayRemove`, Firestore transactions, or moving elements/tasks to subcollections.
- **No error boundaries.** Any render-time crash blanks the entire app.

**P1 findings**
- `HOURS_PER_DAY = 7.6` duplicated in 3 files (Dashboard hard-codes the literal, TaskView + CrewCalculator re-declare the constant). Import from `utils/constants.js` everywhere.
- View routing is `useState` string in `App.jsx` — no URL, no browser back, hard refresh drops the user on Dashboard. Add react-router-dom.
- Login error-path passes raw Firebase error messages to user (`err.message.replace('Firebase: ', '')`). Map to friendly copy.
- `alert()`/`confirm()` used for validation + delete confirm. Blocks the thread on iOS Safari and clashes with the dark UI. Replace with the existing Modal + toast primitives.
- Firestore data shape stores `elements[]` and `tasks[]` as arrays on the project document. Firestore 1MB doc limit = hard ceiling. Acceptable for v1 but document the constraint.
- `npm audit fix` for vite dev-server CVEs (dev-only impact but should still patch).
- `createProject` returns `undefined` when `!user`; `NewProjectModal.handleCreate` then reads `project.id` → TypeError.

**P2 findings**
- No bundle splitting — single 573KB chunk includes all of Firebase. Dynamic-import Firestore modules for first-paint win.
- No CI (no GitHub Actions) and no tests. At minimum: a GitHub Action running `npm run lint && npm run build` on PRs.
- Firebase Hosting config (`firebase.json`, `.firebaserc`) still in repo alongside Vercel — pick one for hosting to avoid confusion.
- No analytics, no error monitoring. Sentry free tier covers this.
- Leftover planning comments in `Dashboard.jsx` (lines 3-4, 69).

**Why**
- User wants Vercel as the go-live path and wants persistent memory to manage token usage. Dev team asked to audit before ship.

**Open items for next session — proposed ship order**
1. `.env.local` with Firebase creds + first local `npm run dev` smoke test.
2. Write + deploy `firestore.rules` (per-user project isolation on `userId`).
3. Fix array-write race in DataContext (transactions or arrayUnion).
4. Add top-level ErrorBoundary wrapping `<App/>`.
5. Add react-router-dom, replace the view-state string with real URLs.
6. Replace `alert`/`confirm` with in-app modals/toasts.
7. `vercel login && vercel link && vercel --prod` once the above pass manual QA.
8. Add minimal GitHub Action (lint + build) + decide Firebase vs Vercel hosting and delete the other config.
