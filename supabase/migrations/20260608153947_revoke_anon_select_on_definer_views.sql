-- =============================================================================
-- BACKFILL: applied to production directly, not committed until 2026-09-14.
--
-- Production (tricoat-pm, ref kihptbwdbkqmopnrtdew) records this as version
-- 20260608153947 `revoke_anon_select_on_definer_views`. It was applied through
-- the Supabase MCP `apply_migration` tool on 2026-06-08 at 15:39:47 UTC
-- (01:39 on 9 June, Melbourne time) and never reached this directory or git
-- history, so `supabase db reset` could not reproduce production.
--
-- DO NOT re-apply to production. It is already live; this file exists so the
-- repo's migration chain matches what production actually ran.
--
-- !! RECONSTRUCTED, NOT YET VERIFIED AGAINST PRODUCTION !!
-- The original SQL could not be recovered when this was backfilled: the
-- session that applied it is no longer on disk, and production was not
-- reachable from the backfill session. The body below is rebuilt from:
--   * the migration's name: revoke anon's SELECT on the definer views;
--   * the SECURITY DEFINER views that existed on that date: workers_visible,
--     projects_visible and project_scopes_visible (project_variations_visible
--     came later, with manager_scopes_variations on 2026-06-30);
--   * what it had to fix, confirmed on a local database built from the older
--     files: Supabase's default privileges give anon ALL on every new view in
--     `public`, and the *_visible migrations only ever granted SELECT to
--     authenticated, so anon still held SELECT on all three views.
-- A security-audit template written minutes after this was applied uses
-- `revoke all ... from anon, public`, so the real statement may be broader.
-- Before merging, run on production:
--   select statements from supabase_migrations.schema_migrations
--    where version = '20260608153947';
-- and replace the body below with those statements if they differ.
-- =============================================================================

revoke select on public.workers_visible        from anon;
revoke select on public.projects_visible       from anon;
revoke select on public.project_scopes_visible from anon;
