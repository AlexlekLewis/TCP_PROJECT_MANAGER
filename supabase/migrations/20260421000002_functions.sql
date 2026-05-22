-- =============================================================================
-- Helper functions (RLS + triggers consume these)
-- =============================================================================

create or replace function current_role_name() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_admin() returns boolean as $$
  select current_role_name() = 'admin';
$$ language sql stable;

create or replace function is_manager() returns boolean as $$
  select current_role_name() = 'manager';
$$ language sql stable;

create or replace function is_week_locked(d date) returns boolean as $$
  select exists (
    select 1 from week_locks
    where d between week_start and week_start + 6
  );
$$ language sql stable;

-- Updated-at trigger ---------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();

create trigger time_entries_set_updated_at before update on time_entries
  for each row execute function set_updated_at();

-- Audit log trigger for admin writes inside locked weeks ---------------------
create or replace function log_locked_write() returns trigger as $$
declare
  target_date date;
  row_id_val uuid;
  before_json jsonb;
  after_json jsonb;
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
    insert into audit_log(actor, table_name, row_id, action, before, after)
    values (auth.uid(), tg_table_name, row_id_val, tg_op::audit_action, before_json, after_json);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create trigger time_entries_audit_locked
  after insert or update or delete on time_entries
  for each row execute function log_locked_write();

create trigger material_entries_audit_locked
  after insert or update or delete on material_entries
  for each row execute function log_locked_write();

-- Atomic RPC: save voice-log results -----------------------------------------
-- Called by the client after the review screen is confirmed. Writes the
-- voice_logs row plus all time + material entries in one transaction.
create or replace function save_voice_log_entries(
  transcript text,
  parsed jsonb,
  entries jsonb,
  materials jsonb
) returns uuid as $$
declare
  vid uuid;
  e jsonb;
  m jsonb;
begin
  insert into voice_logs(transcript, parsed_json, created_by)
  values (transcript, parsed, auth.uid())
  returning id into vid;

  for e in select * from jsonb_array_elements(coalesce(entries, '[]'::jsonb))
  loop
    insert into time_entries(entry_date, worker_id, project_id, hours, notes, created_by, ai_source_id)
    values (
      (e->>'date')::date,
      (e->>'worker_id')::uuid,
      (e->>'project_id')::uuid,
      (e->>'hours')::numeric,
      e->>'notes',
      auth.uid(),
      vid
    );
  end loop;

  for m in select * from jsonb_array_elements(coalesce(materials, '[]'::jsonb))
  loop
    insert into material_entries(entry_date, project_id, description, cost, supplier, created_by, ai_source_id)
    values (
      (m->>'date')::date,
      (m->>'project_id')::uuid,
      m->>'description',
      (m->>'cost')::numeric,
      m->>'supplier',
      auth.uid(),
      vid
    );
  end loop;

  return vid;
end;
$$ language plpgsql security definer;

grant execute on function save_voice_log_entries(text, jsonb, jsonb, jsonb) to authenticated;
