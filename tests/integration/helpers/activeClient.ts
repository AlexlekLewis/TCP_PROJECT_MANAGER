/**
 * The client the app's hooks see.
 *
 * `src/lib/supabase.ts` exports a Proxy around one lazily-built client. Test
 * files mock that module with the proxy below, so a hook runs its real
 * supabase-js chain against whichever signed-in client the test has made
 * current — admin for one assertion, manager for the next.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

let current: SupabaseClient | null = null;

export function setActiveClient(client: SupabaseClient | null) {
  current = client;
}

export const supabaseProxy = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!current) {
      throw new Error('No active Supabase client — call setActiveClient() first.');
    }
    const value = (current as unknown as Record<string, unknown>)[prop as string];
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(current)
      : value;
  },
});

/** Run one hook call as a given signed-in client. */
export async function withClient<T>(client: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  setActiveClient(client);
  try {
    return await fn();
  } finally {
    setActiveClient(null);
  }
}
