-- =============================================================================
-- Project scopes — split a single project into multiple priced areas.
-- Example: "Park Street" project with Exterior + Interior + Studio scopes,
-- each with their own quote. Time / material entries can optionally tag
-- a scope; entries without one count as project-general (travel,
-- mobilisation, etc.). Project total quote rolls up = Σ scope quotes
-- when scopes exist; otherwise the existing project.quoted_price applies.
-- =============================================================================

create table project_scopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  quoted_price numeric(12,2),
  quoted_hours numeric(10,2),
  materials_budget numeric(12,2),
  target_profit numeric(12,2),
  status project_status not null default 'active',
  order_index int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_scopes_project_idx on project_scopes(project_id);

create trigger project_scopes_set_updated_at before update on project_scopes
  for each row execute function set_updated_at();

-- Entries link optionally to a scope (null = project-general).
alter table time_entries
  add column scope_id uuid references project_scopes(id) on delete set null;
create index time_entries_scope_idx on time_entries(scope_id) where scope_id is not null;

alter table material_entries
  add column scope_id uuid references project_scopes(id) on delete set null;
create index material_entries_scope_idx on material_entries(scope_id) where scope_id is not null;

-- RLS + manager-masked view ---------------------------------------------------
alter table project_scopes enable row level security;

create policy project_scopes_admin_write on project_scopes for all to authenticated
  using (is_admin()) with check (is_admin());

drop view if exists project_scopes_visible;
create view project_scopes_visible
  with (security_invoker = false)
  as
  select id,
         project_id,
         name,
         case when is_admin() then quoted_price     else null end as quoted_price,
         quoted_hours,
         case when is_admin() then materials_budget else null end as materials_budget,
         case when is_admin() then target_profit    else null end as target_profit,
         status,
         order_index,
         notes,
         created_at,
         updated_at
  from project_scopes;

revoke select on project_scopes from anon, authenticated;
grant  select (id) on project_scopes to authenticated;
grant  select       on project_scopes_visible to authenticated;
