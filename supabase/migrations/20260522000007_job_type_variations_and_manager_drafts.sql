-- =============================================================================
-- Q2: job type (fixed_quote vs time_and_materials)
-- Q3: project_variations child table (extra scope added mid-job)
-- Q4: manager can create draft projects flagged for admin review
-- =============================================================================

-- Q2 — quote_type ------------------------------------------------------------
alter table projects
  add column quote_type text not null default 'fixed_quote'
    check (quote_type in ('fixed_quote', 'time_and_materials'));

-- Q4 — admin-review flag ----------------------------------------------------
alter table projects
  add column needs_admin_review boolean not null default false;

-- Q4 — manager-insert RLS policy --------------------------------------------
-- Existing `projects_admin_write` covers admin INSERT/UPDATE/DELETE.
-- Add a sibling policy that lets manager INSERT a draft project, but
-- only with needs_admin_review=true and with the admin-only $ fields
-- left null. UPDATE / DELETE remain admin-only — once a manager draft
-- lands, only admin can touch it.
drop policy if exists projects_manager_draft_insert on projects;
create policy projects_manager_draft_insert on projects for insert to authenticated
  with check (
    is_manager()
    and needs_admin_review = true
    and quoted_price is null
    and materials_budget is null
    and target_profit is null
  );

-- Q3 — project_variations ----------------------------------------------------
create table project_variations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount <> 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) default auth.uid(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);
create index project_variations_project_idx on project_variations(project_id);

alter table project_variations enable row level security;

-- Admin-only across the board. Variations are financial data — manager
-- has no need to see or modify them.
create policy project_variations_admin_all on project_variations for all to authenticated
  using (is_admin()) with check (is_admin());

-- Q2 + Q4 — refresh projects_visible to expose the two new columns ----------
drop view if exists projects_visible;
create view projects_visible
  with (security_invoker = false)
  as
  select id,
         name,
         client_name,
         address,
         case when is_admin() then quoted_price     else null end as quoted_price,
         quoted_hours,
         case when is_admin() then materials_budget else null end as materials_budget,
         case when is_admin() then target_profit    else null end as target_profit,
         quote_type,
         needs_admin_review,
         status,
         color_tag,
         start_date,
         end_date,
         notes,
         daily_hours_warning,
         created_at,
         updated_at
  from projects;
grant select on projects_visible to authenticated;
