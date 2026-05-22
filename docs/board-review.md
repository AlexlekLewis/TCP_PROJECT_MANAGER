# Board review — Tricoat PM

Convened: 2026-04-22, after first live deploy to https://tcpprojectmanagerbuild.vercel.app.

Three independent reviewers, each blind to the others:
- **Dame Margaret Voss** — Non-Exec Director, 22 yrs PM systems for trades businesses (AU/UK)
- **Dave Mannix** — Owner, Mannix & Sons Painting (Reservoir VIC), 5-person crew
- **Marcus Holloway** — Principal Engineer, SaaS / Postgres / RLS lens

Each was asked: what's right, what's wrong, what to do before this becomes mission-critical.

---

## Where the three of them agree

These are the items every single reviewer flagged. They are the "fix this or you'll regret it" list.

| Concern | Margaret (PM) | Dave (painter) | Marcus (engineer) |
|---|:-:|:-:|:-:|
| Worker rates seeded at $0 — every "labour $" is a lie until set | ✓ | ✓ | — |
| Adoption risk: app dies if Gavin closes it on day 9 | ✓ | ✓ | — |
| No offline mode = dead on a basement / poor-signal site | — | ✓ | (implied) |
| Documented invariants ≠ executed invariants (no RLS integration tests) | ✓ ("voice fixtures") | — | ✓ ("biggest risk") |
| Real-mode smoke never run with payroll on the line | ✓ | — | ✓ |
| Anthropic-key dependency is fragile go-live blocker | ✓ | — | (set aside per Alex) |

---

## What each one called out alone

### Margaret (PM lens) — "over-specified for a 4-person crew"
- Verdict: **right problem, scope creep risk, untested adoption.**
- "Run a 2-week parallel pilot. Gavin logs into the app AND keeps the spreadsheet. Don't retire the spreadsheet until 3 consecutive weeks reconcile."
- "Define the kill criterion now: if voice adoption is <40% by week 4, revert to manual-only and stop spending on Claude."
- Sharpest question: *"When Gavin tries to log Friday's work on Sunday night with no signal at the back of a property, what exactly happens — and have you watched him do it?"*

### Dave (painter biz owner lens) — "the first tool that looks built for the bloke on the tools"
- Verdict: **closest he's seen to a tradie-first PM tool, but blocked by offline + photos.**
- Concrete wishlist before recommending to mates: **Xero/MYOB payroll export in native format**, **quote-PDF import to scaffold projects**, **subbie day-rate entry** for rotating cast.
- Loved: 14h cap, week-lock at DB, role-split (manager hours / admin margins), 80% burn alerts.
- Frustrations he'd hit on day 3: typing $87.40 with paint on his thumb, no clock-in/out, no photo per day, no offline.
- His honest call on Gavin: *"Maybe. If the first time he hits Log in a basement with no signal it just spins, that's the last time he opens it."*

### Marcus (engineer lens) — "architecturally tasteful, but invariants aren't executed yet"
- Verdict: **clean architecture; production-path coverage is thin.**
- Biggest single bug he found: **`save_voice_log_entries` RPC exists in SQL but is never called** — `VoiceReview` loops `createTE.mutateAsync` row-by-row. A network blip mid-loop leaves half a day's hours saved with no `voice_logs` audit row, and `ai_source_id: null` is hard-coded so the AI-provenance link is silently dropped.
- Other technical concerns:
  - Demo-mode short-circuit is everywhere — the 33 green unit tests don't exercise the production write path.
  - `current_role_name()` is `SECURITY DEFINER` with no explicit `search_path` — common Supabase audit finding, cheap to fix.
  - Edge Function `CORS_ORIGIN` defaults to `*` and returns raw `e.message` on 500s — leaks DB driver strings / model names / key prefixes.
  - Audit-log trigger writes a row for admin writes inside locked weeks but doesn't *enforce* the `reason` field is non-null.

---

## Action plan — what I'm doing tonight on the back of the review

Items in scope for the autonomous overnight build (will be done before Alex wakes):

| # | Action | Source | Owner | Status |
|---|---|---|---|---|
| 1 | Switch `VoiceReview.save()` from per-row insert loop to atomic `save_voice_log_entries` RPC, populate `ai_source_id` | Marcus | dev | tonight |
| 2 | Pin `search_path` on all SECURITY DEFINER functions (new migration) | Marcus | dev | tonight |
| 3 | Enforce non-null `reason` on admin writes inside locked weeks (raise in trigger) | Marcus | dev | tonight |
| 4 | Edge Function: redact `e.message` to a generic 5xx body, lock CORS to the prod origin | Marcus | dev | tonight |
| 5 | Push the schema migration to live Supabase + redeploy hardened Edge Function | derived | dev | tonight |
| 6 | Write [docs/wake-up.md](wake-up.md) — single page Alex reads on wake | derived | dev | tonight |

Items deferred to Alex's call (these need his decision or his presence):

| # | Action | Source | Why deferred |
|---|---|---|---|
| A | **Set real worker hourly rates** | M + D | requires Alex's actual numbers |
| B | **Create the 2 Supabase auth users + profiles rows** | M + D | password entry — must be Alex |
| C | **2-week parallel pilot plan with Gavin** | Margaret | scheduling + management call |
| D | **Define kill criterion for voice (e.g. <40% adoption by week 4 → revert to manual)** | Margaret | business call |
| E | **Add offline IndexedDB queue + service worker (PWA)** | Dave + Marcus | 1–2 day build; v1.5 |
| F | **Photo-per-day per project with Supabase Storage** | Dave | mobile camera permission flow; v1.5 |
| G | **Xero/MYOB native payroll export** (replace generic CSV) | Dave | need format spec from Alex's payroll software |
| H | **Quote-PDF import to scaffold project** | Dave | v2 (would re-introduce Claude vision) |
| I | **Subbie / rotating-cast support beyond the 4 named workers** | Dave | schema + UI change; v1.5 |
| J | **Clock-in / clock-out on arrival** | Dave | v1.5 |
| K | **RLS integration test matrix against Supabase local** | Margaret + Marcus | CI infra build; v1.5 |
| L | **Real-mode end-to-end payroll smoke** | Margaret + Marcus | requires items A + B above |

---

## Net assessment

The board's three lenses converge on one truth: **the architecture is right and the daily UX is genuinely promising, but the gap between "documented invariants" and "executed invariants" — and between the demo-mode happy path and the real-mode payroll path — is where the risk lives.**

Tonight's hardening (items 1–5 above) closes the engineering half of that gap. The other half — adoption pilot, real worker rates, real auth users, real payroll smoke — is Alex's call after he wakes.

The verdict to the chair: **safe to keep building, not yet safe to cut a payroll cheque from.**
