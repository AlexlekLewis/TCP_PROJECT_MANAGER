-- =============================================================================
-- Tighten SECURITY DEFINER function exposure — surfaced by get_advisors after
-- the payroll-integrity hardening landed in 20260522000001_*.
-- =============================================================================
--
-- Internal helpers + trigger functions should not be reachable via
-- /rest/v1/rpc/<name>. Even though our RLS / role checks would reject
-- meaningful calls, leaving the endpoints exposed is unnecessary attack
-- surface and trips the Supabase database linter
-- (lint 0028 anon_security_definer_function_executable +
--  lint 0029 authenticated_security_definer_function_executable).
--
-- current_role_name() is consumed only by is_admin() / is_manager().
-- log_locked_write() + log_week_lock_change() fire only from triggers.

revoke execute on function current_role_name()    from public, anon, authenticated;
revoke execute on function log_locked_write()     from public, anon, authenticated;
revoke execute on function log_week_lock_change() from public, anon, authenticated;

-- These two are explicitly designed to be called by signed-in users; keep
-- the `authenticated` grant in place (re-granted via the original migration
-- and via the per-task migration, so no need to re-grant here) and just
-- tighten the anon role. anon could never get meaningful results out of
-- either — but no reason to keep the RPC reachable.

revoke execute on function get_worker_rate(uuid)                                 from public, anon;
revoke execute on function save_voice_log_entries(text, jsonb, jsonb, jsonb)     from public, anon;

-- Result: get_advisors should now report only 2 informational lints for the
-- two functions that ARE meant to be invoked by authenticated callers
-- (get_worker_rate, save_voice_log_entries). Those are accepted as
-- intentional and documented here.
