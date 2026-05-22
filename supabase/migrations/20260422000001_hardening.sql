-- =============================================================================
-- Security hardening — surfaced by 2026-04-22 board review (engineer lens)
-- =============================================================================
--
-- 1. Pin search_path on all SECURITY DEFINER functions so a future malicious
--    schema can't shadow `profiles` / `week_locks` and escalate privileges.
-- 2. Enforce non-null `reason` on admin writes inside locked weeks via the
--    audit trigger so payroll edits are always justified.
-- 3. Track week_locks INSERT/DELETE in audit_log automatically.
--
-- This is a forward-only migration. No data is mutated.

-- 1. search_path lockdown ----------------------------------------------------

alter function current_role_name() set search_path = public, pg_temp;
alter function is_admin() set search_path = public, pg_temp;
alter function is_manager() set search_path = public, pg_temp;
alter function is_week_locked(date) set search_path = public, pg_temp;
alter function set_updated_at() set search_path = public, pg_temp;
alter function log_locked_write() set search_path = public, pg_temp;
alter function save_voice_log_entries(text, jsonb, jsonb, jsonb)
  set search_path = public, pg_temp;

-- 2. Enforce reason on admin writes inside locked weeks ----------------------
--
-- The existing log_locked_write() trigger writes an audit row but doesn't
-- *require* a reason. Replace it with one that:
--   - rejects manager writes inside locked weeks (was already RLS-blocked, but
--     defence in depth — server can fail closed even if RLS is misconfigured)
--   - on admin writes inside locked weeks, requires the session to have set
--     `app.locked_edit_reason` via `set_config()` before the statement
--   - logs the reason into audit_log
--
-- Clients invoke `select set_config('app.locked_edit_reason', 'why', true);`
-- in the same transaction before the INSERT/UPDATE/DELETE.

create or replace function log_locked_write() returns trigger as $$
declare
  target_date date;
  row_id_val uuid;
  before_json jsonb;
  after_json jsonb;
  reason_val text;
begin
  if tg_op = 'DELETE' then
    target_date := old.entry_date;
    row_id_val := old.id;
    before_json := to_jsonb(old);
    after_json := null;
  elsif tg_op = 'UPDATE' then
    target_date := new.entry_date;
    row_id_val := new.id;
    before_json := to_jsonb(old);
    after_json := to_jsonb(new);
  else
    target_date := new.entry_date;
    row_id_val := new.id;
    before_json := null;
    after_json := to_jsonb(new);
  end if;

  if is_week_locked(target_date) then
    -- Belt-and-braces: manager writes inside locked weeks must not land here.
    -- RLS rejects them first; this is the failsafe.
    if current_role_name() = 'manager' then
      raise exception 'Manager cannot modify entries inside a locked week'
        using errcode = '42501';  -- insufficient_privilege
    end if;

    -- Admin writes inside locked weeks require a reason set on the session.
    reason_val := nullif(current_setting('app.locked_edit_reason', true), '');
    if reason_val is null then
      raise exception
        'Admin edits to locked-week entries require a reason: '
        'select set_config(''app.locked_edit_reason'', ''<why>'', true) '
        'before the write.'
        using errcode = '23514';  -- check_violation
    end if;

    insert into audit_log(actor, table_name, row_id, action, before, after, reason)
    values (
      auth.uid(),
      tg_table_name,
      row_id_val,
      tg_op::audit_action,
      before_json,
      after_json,
      reason_val
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 3. Audit trigger on week_locks itself --------------------------------------
-- Locking and unlocking a week is itself an admin event worth logging.

create or replace function log_week_lock_change() returns trigger as $$
declare
  ws date;
begin
  ws := coalesce(new.week_start, old.week_start);
  insert into audit_log(actor, table_name, row_id, action, before, after, reason)
  values (
    auth.uid(),
    'week_locks',
    gen_random_uuid(),  -- synthetic row id since the PK is the date
    tg_op::audit_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'week ' || ws::text
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists week_locks_audit on week_locks;
create trigger week_locks_audit
  after insert or delete on week_locks
  for each row execute function log_week_lock_change();
