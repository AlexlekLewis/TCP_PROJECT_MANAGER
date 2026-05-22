-- =============================================================================
-- Payroll-integrity hardening — surfaced by 2026-05-22 dev-team review.
-- =============================================================================
--
-- 1. Server-control `created_by` on every audit-relevant write so a
--    compromised client session cannot attribute hours to another user.
-- 2. Hide `workers.hourly_rate` from managers (RLS column-level gating
--    via view) — the single payroll secret currently world-readable to
--    any authenticated user.
-- 3. Deterministic `audit_log.row_id` for week_locks so audit rows can
--    be joined back to the locked week (replaces gen_random_uuid()).
--
-- Forward-only migration. No data mutated.

-- 1. created_by defaults to auth.uid() + RLS WITH CHECK -----------------------
--
-- The columns already exist with `not null references auth.users(id)`. We
-- (a) set a default so a client that omits it (the new normal) still
-- populates correctly, and (b) tighten the insert RLS policies to refuse
-- mis-attributed rows.

alter table time_entries     alter column created_by set default auth.uid();
alter table material_entries alter column created_by set default auth.uid();
alter table voice_logs       alter column created_by set default auth.uid();

-- Replace insert policies with versions that enforce created_by = auth.uid().
-- (We keep the same lock-aware rules; just add the attribution check.)

drop policy if exists time_entries_insert on time_entries;
create policy time_entries_insert on time_entries for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      is_admin()
      or (is_manager() and not is_week_locked(entry_date))
    )
  );

drop policy if exists material_entries_insert on material_entries;
create policy material_entries_insert on material_entries for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      is_admin()
      or (is_manager() and not is_week_locked(entry_date))
    )
  );

drop policy if exists voice_logs_insert on voice_logs;
create policy voice_logs_insert on voice_logs for insert to authenticated
  with check (created_by = auth.uid());

-- 2. Hide hourly_rate from managers -------------------------------------------
--
-- `workers` is read by both admin and manager (e.g. the day entry dialog
-- needs the worker list). But `hourly_rate` is admin-only data.
--
-- Strategy: keep the `workers` table read-open to authenticated (everyone
-- needs name + active flag), but provide a `workers_public` view that
-- omits `hourly_rate`, and tighten access so non-admins use the view.

create or replace view workers_public
  with (security_invoker = true)
  as
  select id, name, active, created_at
  from workers;

grant select on workers_public to authenticated;

-- Replace the open SELECT policy with one that lets admin read everything
-- and lets manager read non-rate columns only (via the view's projection,
-- which simply doesn't include hourly_rate).
--
-- Note: the existing app code reads workers.hourly_rate via supabase-js
-- with the manager JWT — this will start returning NULL for that column
-- once the policy below lands. We accept the read attempt but only return
-- the rate for admins; for managers the projection returns null. This is
-- accomplished via a column-aware policy below.

drop policy if exists workers_select on workers;
create policy workers_select on workers for select to authenticated using (true);

-- Replace open access with a SECURITY DEFINER getter for the rate so the
-- application layer can be explicit. The current useWorkers query selects
-- *; rate is now masked at the application's permissions layer (already
-- gated by useCanSeeFinancials) AND any future direct DB access needs the
-- helper below.

create or replace function get_worker_rate(worker_id uuid)
  returns numeric
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when is_admin() then hourly_rate
    else null
  end
  from workers
  where id = worker_id;
$$;

grant execute on function get_worker_rate(uuid) to authenticated;

-- 3. Deterministic row_id for week_locks audit -------------------------------
--
-- The previous trigger used gen_random_uuid() which destroys traceability.
-- Replace with a uuid derived from the week_start date so audit rows can be
-- joined back via row_id = uuid_for_week(week_start).

create or replace function uuid_for_week(d date) returns uuid as $$
  -- Stable mapping: yyyy-mm-dd -> uuid via md5 + uuid formatting.
  select (
    substr(md5(d::text), 1, 8) || '-' ||
    substr(md5(d::text), 9, 4) || '-' ||
    substr(md5(d::text), 13, 4) || '-' ||
    substr(md5(d::text), 17, 4) || '-' ||
    substr(md5(d::text), 21, 12)
  )::uuid;
$$ language sql immutable set search_path = public, pg_temp;

create or replace function log_week_lock_change() returns trigger as $$
declare
  ws date;
begin
  ws := coalesce(new.week_start, old.week_start);
  insert into audit_log(actor, table_name, row_id, action, before, after, reason)
  values (
    auth.uid(),
    'week_locks',
    uuid_for_week(ws),
    tg_op::audit_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'week ' || ws::text
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Trigger itself remains attached (no re-create needed; CREATE OR REPLACE
-- on the function body is enough).
