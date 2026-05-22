-- =============================================================================
-- Hide workers.hourly_rate from the manager role at the DB layer.
-- =============================================================================
--
-- Background: the previous payroll-integrity migration (20260522000001) created
-- a workers_public view + get_worker_rate() RPC, but never enforced their use
-- — `useWorkers` in the frontend still ran `select * from workers`, returning
-- hourly_rate to anyone authenticated. The UI hid the column via
-- useCanSeeFinancials() but a manager who opened the network tab could read
-- every worker's pay rate. Dev-team review #2 explicitly flagged this.
--
-- Approach:
-- 1. REVOKE the manager's ability to read the `workers` table directly.
-- 2. Introduce `workers_visible` view that returns the rate ONLY when the
--    caller is admin, otherwise null. View is intentionally
--    `security_invoker = false` so it runs as owner and can bypass the
--    grant we just removed; the conditional case-when does the actual
--    masking. This pattern trips Supabase advisor lint 0010
--    (security_definer_view) — that warning is INTENTIONAL and documented
--    here. The view's privilege is narrow: it returns exactly one extra
--    column (`hourly_rate`) and only when the caller passes is_admin().
-- 3. Drop the older `workers_public` (superseded; security_invoker = true
--    means it can no longer query the now-revoked base table).
-- 4. Frontend `useWorkers` switched to read from `workers_visible`. Admin
--    UI sees the rate; manager UI gets null (and useCanSeeFinancials()
--    plus existing null-coalescing keep downstream maths safe).

drop view if exists workers_visible;
create view workers_visible
  with (security_invoker = false)
  as
  select id,
         name,
         active,
         created_at,
         case when is_admin() then hourly_rate else null end as hourly_rate
  from workers;

revoke select on workers          from anon, authenticated;
grant  select on workers_visible  to authenticated;

drop view if exists workers_public;

-- Notes:
-- - workers_admin_write policy (is_admin()) still governs INSERT / UPDATE /
--   DELETE on the underlying `workers` table. Manager cannot write.
-- - get_worker_rate(uuid) (SECURITY DEFINER) still works for any code path
--   that needs a single worker's rate (e.g., the locked-week audit trail).
-- - Demo mode short-circuits in useWorkers and never reads from Supabase,
--   so this migration has no effect on local dev with VITE_DEMO_MODE=true.
