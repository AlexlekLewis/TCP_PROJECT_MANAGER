-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table profiles         enable row level security;
alter table workers          enable row level security;
alter table projects         enable row level security;
alter table time_entries     enable row level security;
alter table material_entries enable row level security;
alter table voice_logs       enable row level security;
alter table week_locks       enable row level security;
alter table audit_log        enable row level security;
alter table settings         enable row level security;

-- Profiles: users see their own; admin sees all
create policy profiles_select_self_or_admin on profiles for select
  using (id = auth.uid() or is_admin());

-- Workers: all authenticated can read; admin writes
create policy workers_select on workers for select to authenticated using (true);
create policy workers_admin_write on workers for all to authenticated
  using (is_admin()) with check (is_admin());

-- Projects: all authenticated read; admin writes (manager may read)
create policy projects_select on projects for select to authenticated using (true);
create policy projects_admin_write on projects for all to authenticated
  using (is_admin()) with check (is_admin());

-- Time entries: read all; writes gated by week_lock for manager
create policy time_entries_select on time_entries for select to authenticated using (true);

create policy time_entries_insert on time_entries for insert to authenticated
  with check (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  );

create policy time_entries_update on time_entries for update to authenticated
  using (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  )
  with check (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  );

create policy time_entries_delete on time_entries for delete to authenticated
  using (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  );

-- Material entries: same rules as time entries
create policy material_entries_select on material_entries for select to authenticated using (true);
create policy material_entries_insert on material_entries for insert to authenticated
  with check (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  );
create policy material_entries_update on material_entries for update to authenticated
  using (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  )
  with check (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  );
create policy material_entries_delete on material_entries for delete to authenticated
  using (
    is_admin() or (is_manager() and not is_week_locked(entry_date))
  );

-- Voice logs: users see their own, admin sees all; authenticated can insert (for SECURITY DEFINER RPC)
create policy voice_logs_select on voice_logs for select to authenticated
  using (created_by = auth.uid() or is_admin());
create policy voice_logs_insert on voice_logs for insert to authenticated
  with check (created_by = auth.uid());

-- Week locks: admin only
create policy week_locks_select on week_locks for select to authenticated using (true);
create policy week_locks_admin_write on week_locks for all to authenticated
  using (is_admin()) with check (is_admin());

-- Audit log: admin read only (trigger does inserts as SECURITY DEFINER)
create policy audit_log_admin_read on audit_log for select to authenticated
  using (is_admin());

-- Settings: read all, admin write
create policy settings_select on settings for select to authenticated using (true);
create policy settings_admin_write on settings for update to authenticated
  using (is_admin()) with check (is_admin());
