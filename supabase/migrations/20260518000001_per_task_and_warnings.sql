-- =============================================================================
-- Per-task entries + per-project daily-hours warning threshold per worker.
-- =============================================================================
-- - time_entries.task: optional text label for sub-task within a project
--   (e.g., "Ceilings", "Skirtings"). Pure text, no foreign key — we don't
--   want a full task table for a 4-person crew.
-- - projects.daily_hours_warning: optional numeric. If a worker's total
--   hours on this project for a single day exceed this, the UI flags it
--   (no DB enforcement — flagging, not blocking, is the requested behaviour).

alter table time_entries
  add column if not exists task text;

alter table projects
  add column if not exists daily_hours_warning numeric(4,2)
    check (daily_hours_warning is null or (daily_hours_warning > 0 and daily_hours_warning <= 14));
