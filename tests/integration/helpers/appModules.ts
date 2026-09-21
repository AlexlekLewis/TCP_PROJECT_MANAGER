/**
 * Module replacements the hook-driving test files install.
 *
 * `vi.mock` has to be called at the top level of each test file — Vitest
 * hoists it above the imports it intercepts — but the factories themselves
 * live here so the two substitutions are described once:
 *
 *   vi.mock('@/lib/env',      async () => (await import('./helpers/appModules')).envModule());
 *   vi.mock('@/lib/supabase', async () => (await import('./helpers/appModules')).supabaseModule());
 */

/** `@/lib/env` with demo mode OFF, so every hook takes its Postgres path. */
export function envModule() {
  return {
    env: { supabaseUrl: '', supabaseAnonKey: '', demoMode: false, sentryDsn: '' },
    hasSupabaseCreds: true,
  };
}

/** `@/lib/supabase` pointed at whichever signed-in client is current. */
export async function supabaseModule() {
  const { supabaseProxy } = await import('./activeClient');
  return { supabase: supabaseProxy, getSupabase: () => supabaseProxy };
}
