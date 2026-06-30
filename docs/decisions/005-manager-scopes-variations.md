# ADR 005 — Manager can add scopes + variations and edit/remove hours, while staying $-blind

- **Status**: Accepted
- **Date**: 2026-06-12
- **Context for**: Alex's request — "I need Gav to be able to add variations and scopes. And he needs to be able to edit worker hours and remove worker hours if he makes a mistake on a project."

## Context

Until now the manager (Gavin) was a read-mostly operational user: he logged time + materials, but scopes and variations were admin-only sections (hidden entirely from him), and time entries could be deleted but not edited. Alex wants Gavin to be able to set a job up and fix his own mistakes on-site without waiting for Alex.

The tension: scopes and variations are partly **financial** objects (scope quote / materials budget / target profit; variation amount). The app's single most important invariant — enforced in the UI ([permissions.tsx](../../src/lib/permissions.tsx)), in masked DB views (`workers_visible`, `projects_visible`, `project_scopes_visible`), and asserted by the [roles e2e suite](../../e2e/roles.spec.ts) — is that **the manager never sees a dollar figure anywhere**. Naively un-hiding these sections would leak money.

## Decision

Give Gavin the operational power without the money. Confirmed with Alex (chose "keep Gav $-blind" over "let him price on-site").

1. **Scopes** — manager can **add + edit** a scope by name, planned hours, status and notes. The three $ fields are hidden from him; on save his (empty) values never overwrite a price Alex set. **Delete stays admin-only** because removing a priced scope silently changes the project's quote rollup.
2. **Variations** — manager can **log** a variation by description + notes. It is created `pending` with `amount = null` ("unpriced"). **Pricing, editing, approving and rejecting stay admin-only.** Alex gets a Price/Edit action to fill in the amount on what Gavin logged, then approves. This mirrors the existing "manager creates a draft project → admin reviews" pattern ([ADR in 20260522000007](../../supabase/migrations/20260522000007_job_type_variations_and_manager_drafts.sql)).
3. **Worker hours** — manager can **edit and delete** any time entry in an unlocked week. Delete already existed; edit was missing. Locked weeks remain admin-only, unchanged.

## How the $-blindness is enforced (defence in depth)

- **UI**: dialogs hide $ inputs and money displays when `!useCanSeeFinancials()`; manager-created scopes/variations carry no amounts.
- **DB** ([20260612000001](../../supabase/migrations/20260612000001_manager_scopes_variations.sql)): manager write policies are paired with `BEFORE` triggers that force the financial columns (null on insert, unchanged-from-OLD on update) regardless of what the request body carries, and reads go through masked views so the amount never reaches the client even via `RETURNING`. `amount` on `project_variations` became nullable to represent the unpriced state.
- Demo mode (the default local/dev path) short-circuits every hook, so the migration only matters at go-live — verify with `supabase db reset`.

## Implementation note — no nested dialogs

The time-entry editor was first built as a Radix `<Dialog>` rendered inside the day-entry `<Dialog>`. A dialog-inside-an-open-dialog would not dismiss (Save, Cancel and Esc all failed, verified in the live app). It was replaced with an **inline edit mode** that reuses the day dialog's existing "Add time" form (it flips to "Edit time" with Save/Cancel, pre-filled). Cheaper, more reliable, and better on a phone. General rule for this codebase: avoid nesting one Radix Dialog inside another's content.

## Consequences

- Gavin is self-sufficient for job setup and corrections; Alex retains exclusive control over every dollar.
- `ProjectVariation.amount` is now nullable — `computeProjectTotals` treats null as $0 (only `approved` variations roll up, and those always have an amount by the time Alex approves).
- The roles e2e invariant ("no $ anywhere for the manager") still holds and was re-confirmed manually.
