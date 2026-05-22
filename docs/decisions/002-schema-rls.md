# ADR 002 — Schema and RLS design

**Date**: 2026-04-21
**Status**: Accepted
**Supersedes**: N/A

## Decision

Flat relational schema with 8 tables (`profiles`, `workers`, `projects`, `time_entries`, `material_entries`, `voice_logs`, `week_locks`, `audit_log`, `settings`). RLS enabled on every table. Week-lock enforced at the DB layer via a function `is_week_locked(date)` referenced from policies. Admin writes inside locked weeks are allowed but audit-logged via trigger.

## Context

The PRD requires:
1. Per-worker-per-week hours aggregation → flat `time_entries` table with `(worker_id, entry_date)` index.
2. Per-project financials → flat aggregation over `time_entries` and `material_entries`.
3. Week lock that cannot be bypassed by UI changes → RLS, not UI guards.
4. Audit trail for admin edits to locked weeks → trigger writing `audit_log`.
5. CSV export for payroll → pure SQL over the same tables.

## Options considered

1. **Nested JSONB arrays on a single `projects` table** (the old Firestore shape). Rejected: 1MB doc limit, can't query "this week's hours across all projects".
2. **Separate schemas per user role**. Rejected: 2 users and mostly shared data.
3. **Flat normalised schema with RLS** — chosen. Standard Postgres shape; joins are cheap at our scale; indexes on `(worker_id, entry_date)` and `(project_id, entry_date)` keep weekly queries fast.

## Key design choices

- **Hours CHECK (0 < hours ≤ 14)** — hard cap at DB level, not just UI, so Claude misparses ("sixteen" vs "sixty") can't land bad data.
- **Soft delete** via `archived` status on projects and `active=false` on workers — never hard delete where historical entries reference.
- **Audit log via trigger** — decouples audit from application code; can't forget to write it from an Edge Function.
- **`save_voice_log_entries` RPC** — atomically inserts the voice_logs row + all entries. Keeps the voice-log save path at one network round trip after the review screen.
- **`profiles` role enum** — `admin | manager` only; not a permission bitmask. Two users don't need a generalised RBAC.

## Consequences

### Easier
- Weekly report = one SQL aggregation.
- CSV export = `SELECT ... INTO csv`.
- Week lock is structural: forgetting a UI guard doesn't create a bug, the DB says no.

### Harder
- Every schema change needs a migration file + corresponding RLS/policy update.
- Integration tests require a running Supabase (Docker) to exercise RLS paths.
- If Alex ever wants casual workers with limited data access, we'd need to extend `profiles.role` — which is fine, just a new enum value + policies.

## Follow-ups

- Integration test suite covering the full RLS matrix (pending Supabase Docker setup in CI).
- ADR 003: Claude prompt + tool-use schema for `parse-voice-log`.
- ADR 004: Deployment topology (Vercel + Supabase + Sentry).
