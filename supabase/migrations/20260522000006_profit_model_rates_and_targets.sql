-- =============================================================================
-- Profit model: per-worker cost / weekly-wage / charge-out + project target.
-- =============================================================================
-- The old `workers.hourly_rate` was ambiguous (rate of what?). Rename it to
-- `cost_rate` (the wage we pay per hour worked). Add two siblings:
--   - `weekly_wage` for fixed-weekly workers (owner draw, apprentice stipend).
--   - `charge_out_rate` for the rate we bill the client per hour worked.
-- Add `target_profit` on projects so the admin can lock in an expected
-- profit at quote time and track projected vs target.
--
-- Initial values (set by 2026-05-22 conversation with Alex):
--   Alex   cost=0  weekly=1250 charge=65   (owner draw, no per-hour cost)
--   Gavin  cost=50 weekly=0    charge=65
--   Jerry  cost=30 weekly=0    charge=65
--   Pierce cost=35 weekly=900  charge=65   (2nd-year mature-age apprentice;
--                                           weekly value to be refined by Alex)

alter table workers rename column hourly_rate to cost_rate;

alter table workers
  add column weekly_wage numeric(10,2) not null default 0
    check (weekly_wage >= 0);

alter table workers
  add column charge_out_rate numeric(10,2) not null default 65.00
    check (charge_out_rate >= 0);

alter table projects
  add column target_profit numeric(12,2)
    check (target_profit is null or target_profit >= 0);

-- Refresh workers_visible to expose + mask the new admin-only columns.
drop view if exists workers_visible;
create view workers_visible
  with (security_invoker = false)
  as
  select id, name, active, created_at,
         case when is_admin() then cost_rate        else null end as cost_rate,
         case when is_admin() then weekly_wage      else null end as weekly_wage,
         case when is_admin() then charge_out_rate  else null end as charge_out_rate
  from workers;
grant select on workers_visible to authenticated;

-- get_worker_rate now returns the renamed column.
create or replace function get_worker_rate(worker_id uuid)
  returns numeric
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case when is_admin() then cost_rate else null end
  from workers
  where id = worker_id;
$$;
revoke execute on function get_worker_rate(uuid) from public, anon;
grant  execute on function get_worker_rate(uuid) to authenticated;

-- Refresh projects_visible to include + mask target_profit.
drop view if exists projects_visible;
create view projects_visible
  with (security_invoker = false)
  as
  select id, name, client_name, address,
         case when is_admin() then quoted_price     else null end as quoted_price,
         quoted_hours,
         case when is_admin() then materials_budget else null end as materials_budget,
         case when is_admin() then target_profit    else null end as target_profit,
         status, color_tag, start_date, end_date, notes,
         daily_hours_warning, created_at, updated_at
  from projects;
grant select on projects_visible to authenticated;

-- Seed the real values.
update workers set cost_rate=0,  weekly_wage=1250, charge_out_rate=65 where name='Alex';
update workers set cost_rate=50, weekly_wage=0,    charge_out_rate=65 where name='Gavin';
update workers set cost_rate=30, weekly_wage=0,    charge_out_rate=65 where name='Jerry';
update workers set cost_rate=35, weekly_wage=900,  charge_out_rate=65 where name='Pierce';
