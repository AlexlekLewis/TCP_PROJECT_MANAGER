# ADR 008 — A job is a set of date blocks, not one bar

- **Status**: Accepted
- **Date**: 2026-09-03
- **Context for**: Alex's request — "I don't mind it dragging over two pixels because we should be able to edit manually with a free text. The duration of a job… part A or part B of a job… because jobs can often start, then go away, then come back."

## Context

[ADR 007](007-schedule-board.md) gave projects a draggable bar between `start_date` and `end_date`. That model has one job = one continuous block of time, which is not how painting work runs. A school is done across a term and the following holidays. A repaint stops for three weeks because the client hasn't picked colours, or the render isn't dry, or the scaffold is on another site. Under the old model a job that paused for six weeks looked exactly like a job that ran for six weeks — and the board hid the very gap the crew is free in.

Separately, drag snapping at the 6- and 12-month zooms is deliberately coarse ([ADR 007](007-schedule-board.md) §3). Alex is fine with that **provided the exact dates can be typed**. Precision shouldn't depend on how far you're zoomed in.

## Decision

1. **New table `project_schedule_blocks`** — a project has many parts, each with `start_date`, `end_date`, an optional free-text `label`, and an `order_index`. Parts are the source of truth for scheduling.

2. **`projects.start_date` / `end_date` become a derived envelope** — earliest start, latest finish across the parts — maintained by an `AFTER INSERT/UPDATE/DELETE` trigger. This is what makes the change cheap: every existing reader (the jobs-ahead buckets, the project form, anything downstream) keeps working against the same two columns and needed no changes. The migration backfills one part per already-dated project, so nothing is lost.

3. **The label is free text, defaulting to position.** Unnamed parts read "Part A", "Part B"… by calendar order; naming one "Term break — gym + hall" or "Return visit" overrides that. The label is for the crew, so the DB doesn't police it.

4. **Clicking a bar opens a type-in editor** with both dates, the label, a live duration readout, Split and Remove. This is the manual path Alex asked for, and it's the only way to hit an exact day when a drag is snapping to weeks. Save stays disabled until something actually changes and while the dates are invalid.

5. **Split cuts a part in two at a chosen day** — by default its midpoint — leaving the first half in place and the second half ready to drag to whenever the job actually resumes. This is the "goes away and comes back" flow in one action.

6. **Parts are a *when*; scopes are a *what*.** `scope_id` on a part is nullable and unenforced. The same scope can be visited twice and one visit can cover several scopes, so tying the two together would be wrong. Deliberately not reusing `project_scopes` for this.

7. **The project form stops pretending.** For a single-part job its date fields write through to that part. For a split job there is no single start and end to type, so it shows the parts read-only and sends you to the board.

## Consequences

- Scheduling has one source of truth (parts) and one derived mirror (the envelope). Anything that writes `projects.start_date` directly will be silently overwritten by the trigger on the next part write — which is why the project form was changed rather than left alone.
- The jobs-ahead list shows the envelope *and* names the next part, because "17 Aug – 30 Oct · 75 days" on its own reads as eleven solid weeks.
- Removing a job's last part takes it off the calendar rather than leaving a zero-length bar. The job reappears under "Not on the calendar yet", which is the honest state.
- Demo mode duplicates the envelope logic in `demoStore.syncEnvelope`. That is duplicated business rule and can drift from the trigger; both are covered by tests, and the fixtures derive their envelopes the same way so a drift shows up immediately.

## Why not a `parts` JSON column on `projects`

Tempting — no join, no migration of readers. Rejected: parts need their own row identity to be dragged, split and deleted independently, and putting them in JSON puts date validity (`end >= start`) beyond the reach of a CHECK constraint. The envelope trigger gives the cheap read path anyway.
