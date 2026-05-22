# Dev team review — second pass (2026-05-22)

Five independent specialists, each blind to the others, audited the codebase + live site after the brand pass and the per-task / soft-cap feature.

| Lens | Reviewer | Verdict |
|---|---|---|
| Frontend | Pat Larsen, Sr FE Tech Lead | "Surprisingly disciplined v1 — data-fetching + a11y debts will pinch on 4G." |
| Backend / Postgres | Marcus Hayes, Sr Postgres Architect | "Schema + RLS above the bar; `created_by` client-trust and `save_voice_log_entries` undermine the payroll-integrity story." |
| QA | Priya Mehta, Sr QA Lead | "Solid UI happy-path coverage; **the payroll-integrity layer is essentially untested** — every lock assertion just checks a UI badge." |
| Security | Sasha Mehta, Sr AppSec | "Solid hardening; live anon key committed, no per-user rate limit on the paid LLM, hourly_rate world-readable to any auth user." |
| Product | Priya Raman, Sr PM (Trades) | "Polished prototype waiting on three ops items. **Not yet payroll source-of-truth.**" |

---

## Where the five lenses converge

Cross-cutting items — flagged by ≥ 2 reviewers, treated as the consensus must-do list.

### Critical (payroll integrity)
1. **`created_by` is client-controlled.** Backend: insert paths trust client-supplied `created_by`. No RLS `with check (created_by = auth.uid())`. A compromised manager session could attribute hours to anyone. *(Backend; partial echo from Security on `audit_log` admin-self-delete.)*
2. **No RLS integration tests.** Every "week-lock" Playwright spec only verifies the UI badge — never the write-rejection. If RLS regresses tomorrow CI stays green. *(Backend, QA.)*
3. **CSV payroll-correctness untested.** Headers, row count vs seeded entries, `sum(hours × rate) == labour cost stat` — zero assertion. This is the artifact Alex cuts cheques from. *(QA; echoed by Product's "manual Excel pass every week" call-out.)*
4. **`hourly_rate` is world-readable to any authenticated user.** Sits on `workers` with `using (true)`. The day Alex adds employee #3 with a login, every other employee can read everyone's pay rate. *(Security; backend mentioned similar.)*

### High (will bite within weeks)
5. **`useAllTimeEntries` pulls the entire table forever.** Used by 3 top-level pages. Fine for v1; cliff at year 3. *(Frontend.)*
6. **Mobile bottom nav truncates to 5 items** — managers silently lose access to **Reports** on phone. *(Frontend — the user-facing version of this is Gavin not being able to see his weekly hours from his phone.)*
7. **`cloneYesterday` loops serial `await mutateAsync`** — network drop mid-loop produces a half-cloned day with no rollback. *(Frontend.)*
8. **`useProjectCanDelete` lies in production** — returns `true` blindly. Admin sees an "enabled" Delete that fails with an FK error toast. *(Frontend.)*
9. **`audit_log.row_id` for week_locks uses `gen_random_uuid()`** — destroys the ability to join audit rows back to the locked week. *(Backend.)*
10. **`save_voice_log_entries` doesn't accept `reason`** — admin voice-saves into a locked week hard-fail at the trigger with no recovery path. *(Backend, Security.)*

### Medium (correctness / hygiene)
11. **Live Supabase anon key committed** to `.env.production` and `docs/wake-up.md`. Anon keys are public by design, but the CI secret-scan grep doesn't match the `sb_publishable_` prefix — bypass. *(Security.)*
12. **No per-user rate limit on `parse-voice-log`** — a compromised JWT could burn Anthropic budget arbitrarily. (Voice currently unwired so low actual exposure.) *(Security.)*
13. **`dates.ts`, `currency.ts`, `csv.ts` have no unit tests** — Monday-start week math, AUD edge cases, CSV escape of `O'Brien` / `paint, undercoat` / embedded newlines — all unguarded. *(QA.)*
14. **Flake vectors**: `[class*="ring-1 ring-ring"]` selectors couple specs to Tailwind class strings; index-based weekday selection silently no-ops when the shortcut isn't visible. *(QA.)*

### Operational (product-level, not bugs)
15. **Demo mode is still the production default.** `VITE_DEMO_MODE=true` ships. Real auth users + profiles rows + rates + flip-the-env are 5 minutes of Alex's time. *(Product, Security implicit.)*
16. **No offline / IndexedDB queue.** Priya Raman's single biggest blocker for week-1 adoption: "the first signal-dead site is the last day Gavin opens the app." *(Product; Frontend's a11y notes echo.)*
17. **Voice is unwired**. Per Alex's earlier call, but Product flags this is 40% of the PRD's argument for existing. *(Product.)*
18. **Worker hourly rates are $0.** Every "labour $" Alex sees is currently a lie. *(Product.)*

---

## Action plan tonight

Fixed during this session (commit follows):

| # | Action | Lens | Effort |
|---|---|---|---|
| 1 | CI secret-scan regex updated to include `sb_publishable_` prefix | Security | 2 min |
| 2 | `data-testid="today-cell"` on the highlighted Monday cell; flake-prone class selectors removed from specs | QA | 10 min |
| 3 | Mobile bottom nav: render an overflow "More" pill instead of slicing to 5 — managers + admin both keep access to Reports/Workers/Admin on phone | FE | 15 min |
| 4 | `cloneYesterday` rewritten to a single `supabase.from('time_entries').insert([...])` batch in real mode (demo unchanged — already cheap) | FE | 10 min |
| 5 | `useProjectCanDelete` — in production, query `time_entries` + `material_entries` for a single `head: true, count: 'exact'` per `project_id` before enabling the Delete affordance | FE | 15 min |
| 6 | New migration: `default auth.uid()` on `created_by` + `with check (created_by = auth.uid())` on insert policies for `time_entries`, `material_entries`, `voice_logs`, `projects` | Backend, Security | 15 min |
| 7 | Same migration: gate `workers.hourly_rate` behind `is_admin()` via column-level grant + view (`worker_pay_view` admin-only) | Security | 15 min |
| 8 | Same migration: change `log_week_lock_change` to derive a deterministic `row_id` from the `week_start` date instead of `gen_random_uuid()` | Backend | 5 min |
| 9 | New `e2e/payroll-csv.spec.ts` — download CSV, parse, assert headers + row count + `sum(amount)` matches stat | QA | 15 min |
| 10 | `src/lib/dates.test.ts` + `src/lib/csv.test.ts` — Monday-start, AU locale, escape edge cases | QA | 15 min |

Deferred — too big for tonight, queued for Alex on wake:

| # | Action | Lens | Reason |
|---|---|---|---|
| A | Offline IndexedDB queue (PWA service worker + sync replay) | Product, FE | 1–2 day build; v1.5 |
| B | RLS integration test matrix against Supabase local in CI | Backend, QA | Needs Supabase Docker in CI runner; v1.5 |
| C | `save_voice_log_entries` accepts `reason text` + idempotency key | Backend, Security | Voice unwired; deferrable |
| D | Per-user rate limit on `parse-voice-log` | Security | Voice unwired; deferrable |
| E | Xero/MYOB native payroll CSV format | Product | Need format spec from Alex's payroll software |
| F | Annual leave / sick / penalty rate entry types | Product | Award-compliance question, not built |
| G | `useAllTimeEntries` 90-day cap + project-history opt-in | FE | Won't bite for 12 months |
| H | `audit_log` retention + admin-deny on DELETE | Security | Low daily exposure |

---

## What the board agrees on

> "Architecture is right. Daily UX is genuinely promising. **The gap between *documented invariants* and *executed invariants* is where the risk lives.** And the gap between *demo-mode happy path* and *real-mode payroll path* hasn't been crossed yet — every assumption gets its first real exercise the day `VITE_DEMO_MODE=false` flips."

The verdict to the chair: **safe to keep building, not yet safe to cut a payroll cheque from. Closing items 1–10 in tonight's commit measurably reduces that risk; closing A + B is the next milestone.**
