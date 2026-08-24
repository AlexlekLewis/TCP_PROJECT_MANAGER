# ADR 006 — Variation labour: itemise the work, hold its hours out of the quote

- **Status**: Accepted
- **Date**: 2026-08-20
- **Context for**: Alex's request — "when clients add variations to the jobs we need to be able to itemize and describe those variations and then add ours to those variations… who was the person that worked on that job, what day was that job done, how many hours were executed on that job, and you have to describe the job."

## Context

[ADR 005](005-manager-scopes-variations.md) gave `project_variations` a description, an optional amount and a pending/approved/rejected status. It recorded **that** the client added scope. It could not record **the work**.

A time entry could tag a `scope_id` — a priced area of the base quote — but nothing pointed at a variation. So for "Northcote High School asked us to do the sick bay too" there was no answer to who did it, on what day, for how many hours, or what they actually did. Those four facts are exactly what Alex needs to price the variation and to defend the charge when the client queries it. Without them the hours vanished into the project's general labour pool, where they made the base job look over budget and made the variation look free.

Asked whether variation hours should count toward the quoted-hours budget, Alex was explicit: *"variations are added and haven't been priced or invoiced, so they need to be separate. And it needs to be clear."*

## Decision

1. **`variation_id` on `time_entries` and `material_entries`** — nullable FK, `ON DELETE SET NULL`, mirroring the `scope_id` pattern from [20260524000001](../../supabase/migrations/20260524000001_project_scopes.sql). Hours are still logged **once**, so payroll, week totals and task benchmarks are untouched: a variation hour is still a paid hour.

2. **`scope_id` and `variation_id` are mutually exclusive** — enforced by a DB `CHECK`, and by the UI presenting a single "Work against" picker (project-general / scopes / variations) rather than two dropdowns. An hour is base-quote work or extra work, never both. If it could be both it would double-count the instant the hours split into base and variation buckets.

3. **Variation hours are held out of the quoted-hours budget.** `computeProjectTotals` gained `baseLabourHours` and `variationLabourHours`; `hoursUsedPct` measures base only. `labourHours` keeps its old meaning (the grand total) so payroll and every existing caller are unaffected. A job that *grew* no longer reads as a job that's *late*.

4. **"Work done, not yet priced" is surfaced prominently.** `computeUnbilledVariationWork` totals labour and materials against variations that aren't approved yet — work spent with nothing billed against it. It renders as a callout at the top of the project, and the wording tells Alex what to do next ("Price it below, then approve" vs "Chase the sign-off"). Rejected-but-worked variations get a separate red `UNBILLABLE` flag on the row: that's a worse problem and deserves its own signal.

5. **Each variation carries an itemised ledger** — date · worker · task · hours, plus tagged materials — exportable as a CSV worksheet to attach to an invoice.

## Why not a separate `variation_items` table

The literal reading of "itemize" suggests a child table of line items with their own worker/date/hours. Rejected: hours recorded there would either be missing from payroll or counted twice, and payroll is one of the two things this app exists to get right. It would also mean two places to log hours, making the on-site flow worse. One variation = one line item on the existing list; the itemisation is the labour ledger underneath it.

## $-blindness (unchanged invariant)

Time entries carry no money, so `variation_id` leaks nothing. The manager sees the same ledger and the same export with the rate/amount columns omitted, and his status label reads `WITH ALEX` rather than `NEEDS PRICING` — the wording shouldn't imply a dollar figure he can't see. Pricing and approval stay admin-only. Covered by a new case in [roles.spec.ts](../../e2e/roles.spec.ts).

## Consequences

- A stale picker could tag Northcote's variation onto Preston's hours and silently corrupt an invoice, so a `SECURITY DEFINER` trigger rejects any entry whose variation belongs to a different project. Not expressible as a `CHECK` (it spans two rows).
- Nothing is reclassified retroactively — existing entries keep `variation_id = null`. The split starts from the day this ships.
- The split is only as good as the tagging. The "Log time" button on a variation row deep-links to the day dialog with the variation pre-selected (`/calendar?log=today&project=…&variation=…`), so the on-site path is one tap rather than a dropdown someone has to remember.
- Found and fixed in passing: `npm run typecheck` was a no-op. The root tsconfig has `files: []` and only project references, so `tsc --noEmit` checked nothing; it's now `tsc -b --noEmit`.
