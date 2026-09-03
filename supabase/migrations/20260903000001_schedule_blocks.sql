-- =============================================================================
-- Schedule parts — a job is a set of date blocks, not one continuous bar.
--
-- Painting jobs start, stop and come back: weather, a client delay, waiting on
-- a trade. Before this, a project carried a single start_date/end_date, so a
-- job that paused for six weeks looked like a job that ran for six weeks —
-- and the board couldn't show the gap the crew is actually free in.
--
-- `projects.start_date` / `end_date` survive as the *envelope* (earliest start,
-- latest finish) and are maintained by trigger, so every existing reader keeps
-- working unchanged. Parts are the source of truth.
-- =============================================================================

create table project_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- Free text. Defaults to "Part A", "Part B"… but Alex can name it
  -- ("Scaffold week", "Return visit") — the label is for the crew, not the DB.
  label text,
  start_date date not null,
  end_date   date not null,
  -- Optional link to a priced area of the quote. A part is a *when*; a scope
  -- is a *what*. They're orthogonal — the same scope can be visited twice, and
  -- one visit can cover several scopes — so this stays nullable and unenforced.
  scope_id uuid references project_scopes(id) on delete set null,
  order_index int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_block_dates_ordered check (end_date >= start_date)
);

create index project_schedule_blocks_project_idx on project_schedule_blocks(project_id);
create index project_schedule_blocks_span_idx    on project_schedule_blocks(start_date, end_date);
create index project_schedule_blocks_scope_idx   on project_schedule_blocks(scope_id)
  where scope_id is not null;

create trigger project_schedule_blocks_set_updated_at
  before update on project_schedule_blocks
  for each row execute function set_updated_at();

-- Keep projects.start_date / end_date in step with the parts --------------------
-- SECURITY DEFINER because the manager can't write `projects` directly; the
-- envelope is a derived value, not a manager edit. Search path is pinned so the
-- definer context can't be redirected at a shadowed table.
create or replace function sync_project_schedule_envelope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.project_id, old.project_id);
begin
  update projects p
     set start_date = b.min_start,
         end_date   = b.max_end
    from (
      select min(start_date) as min_start, max(end_date) as max_end
        from project_schedule_blocks
       where project_id = target
    ) b
   where p.id = target
     and (p.start_date is distinct from b.min_start
       or p.end_date   is distinct from b.max_end);
  return null;
end;
$$;

revoke execute on function sync_project_schedule_envelope() from anon, authenticated;

create trigger project_schedule_blocks_sync_envelope
  after insert or update or delete on project_schedule_blocks
  for each row execute function sync_project_schedule_envelope();

-- Backfill: every project that already had dates becomes a single part --------
insert into project_schedule_blocks (project_id, label, start_date, end_date, order_index)
select id, 'Part A', start_date, end_date, 0
  from projects
 where start_date is not null
   and end_date is not null;

-- RLS -------------------------------------------------------------------------
-- Scheduling is admin-only to write, matching `projects` (projects_admin_write):
-- the manager reads the board but doesn't move jobs. Parts carry no money, so
-- unlike project_scopes there's nothing to mask — no *_visible view needed.
alter table project_schedule_blocks enable row level security;

create policy project_schedule_blocks_select on project_schedule_blocks
  for select to authenticated using (true);

create policy project_schedule_blocks_admin_write on project_schedule_blocks
  for all to authenticated
  using (is_admin()) with check (is_admin());

grant select on project_schedule_blocks to authenticated;
grant insert, update, delete on project_schedule_blocks to authenticated;
