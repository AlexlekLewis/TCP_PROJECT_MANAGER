-- =============================================================================
-- BUG FIX: 20260522000002_lock_down_definer_function_exposure was too
-- aggressive. current_role_name() is SECURITY DEFINER (its body always
-- runs as owner regardless of caller) but it's also called by is_admin()
-- and is_manager() — which are INVOKER and run as the caller. RLS
-- policies that reference is_admin() / is_manager() therefore need the
-- caller to have EXECUTE on current_role_name(). The earlier revoke
-- broke every admin write path (e.g., creating a project, locking a week,
-- updating workers) and every check on the manager-write paths too.
--
-- Restore execute to authenticated. Keep anon revoked (unauthenticated
-- callers should never be probing whose profile is whose).
-- =============================================================================

grant execute on function current_role_name() to authenticated;

-- log_locked_write() and log_week_lock_change() remain revoked — they're
-- trigger functions, fired by the executor, never directly called.
