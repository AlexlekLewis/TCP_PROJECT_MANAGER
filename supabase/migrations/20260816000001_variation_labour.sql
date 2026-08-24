-- =============================================================================
-- Variation labour — attach who / when / how many hours to a client variation.
--
-- `project_variations` already records THAT the client added scope mid-job
-- ("while you're here, can you do the sick bay too?"). It could not record the
-- work itself: time + material entries could tag a `scope_id` (a priced area of
-- the base quote) but had no way to point at a variation. So there was no
-- answer to "who did the sick bay, on what day, for how many hours" — the four
-- facts Alex needs to price a variation and invoice it.
--
-- Entries now carry an optional `variation_id` alongside `scope_id`. The two
-- are MUTUALLY EXCLUSIVE (CHECK constraint below): an hour is either
-- base-scope work or variation work, never both, otherwise it double-counts
-- the moment the project's hours-vs-quote progress is split into base and
-- variation buckets.
--
-- Hours are still logged ONCE. Payroll, week totals and task benchmarks read
-- `time_entries` unchanged — a variation hour is still a paid hour.
--
-- Demo mode (VITE_DEMO_MODE=true) short-circuits every hook and never touches
-- Postgres, so this migration only matters once the app is pointed at a real
-- Supabase project. Verify with `supabase db reset` before go-live.
-- =============================================================================

alter table time_entries
  add column variation_id uuid references project_variations(id) on delete set null;
create index time_entries_variation_idx on time_entries(variation_id)
  where variation_id is not null;

alter table material_entries
  add column variation_id uuid references project_variations(id) on delete set null;
create index material_entries_variation_idx on material_entries(variation_id)
  where variation_id is not null;

-- Mutual exclusivity with scope_id. This one IS expressible as a CHECK because
-- both columns live on the same row.
alter table time_entries
  add constraint time_entries_scope_xor_variation
  check (scope_id is null or variation_id is null);
alter table material_entries
  add constraint material_entries_scope_xor_variation
  check (scope_id is null or variation_id is null);

-- ---------------------------------------------------------------------------
-- Cross-project guard
--
-- A stale picker (project changed after a variation was selected, or a carried
-- selection across a multi-entry add) could attach Northcote's variation to
-- Preston's hours. That silently corrupts an invoice — the hours would appear
-- on a worksheet for a job they were never worked on. Postgres can't express
-- this as a CHECK because it spans two rows, so it's a trigger.
--
-- SECURITY DEFINER so it can read project_variations, whose RLS is admin-only
-- (`project_variations_admin_all`) — the manager legitimately writes entries
-- tagged to variations he reads through project_variations_visible. Same
-- pattern as enforce_manager_scope_economics / enforce_manager_variation_economics.
-- ---------------------------------------------------------------------------
create or replace function enforce_entry_variation_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  if new.variation_id is null then
    return new;
  end if;
  select project_id into v_project
    from project_variations
   where id = new.variation_id;
  if v_project is null then
    raise exception 'Variation % not found', new.variation_id;
  end if;
  if v_project <> new.project_id then
    raise exception
      'Variation % belongs to project %, not % — an entry can only be tagged to a variation on its own project',
      new.variation_id, v_project, new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_variation_project on time_entries;
create trigger time_entries_variation_project
  before insert or update on time_entries
  for each row execute function enforce_entry_variation_project();

drop trigger if exists material_entries_variation_project on material_entries;
create trigger material_entries_variation_project
  before insert or update on material_entries
  for each row execute function enforce_entry_variation_project();

-- No new RLS policies. The existing time_entries / material_entries policies
-- already govern who may write these rows (manager: unlocked weeks only), and
-- `variation_id` carries no money — nothing here touches Gavin's $-blindness.
