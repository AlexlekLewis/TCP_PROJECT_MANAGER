-- =============================================================================
-- Hide projects.quoted_price + projects.materials_budget from non-admin.
-- =============================================================================
--
-- Mirrors the workers_visible pattern from 20260522000003. Audit run as
-- Gavin showed `select * from projects` returned both budget figures in
-- the raw JSON — UI was hiding them via useCanSeeFinancials() but the
-- payload still leaked. quoted_hours stays visible (manager needs it to
-- gauge project scope on site); only the two pure $ fields are masked.

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
         status,
         color_tag,
         start_date,
         end_date,
         notes,
         daily_hours_warning,
         created_at,
         updated_at
  from projects;

revoke select on projects          from anon, authenticated;
-- useCreateProject does `.insert(...).select('id')` which needs SELECT on
-- the id column only. Keeping the budget fields locked even via RETURNING.
grant  select (id) on projects     to authenticated;
grant  select       on projects_visible to authenticated;

-- INSERT / UPDATE / DELETE on `projects` still go through the table
-- directly; `projects_admin_write` policy (is_admin() with-check) is the
-- write gate. Verified by audit: manager update is blocked at both grant
-- and RLS layers.
