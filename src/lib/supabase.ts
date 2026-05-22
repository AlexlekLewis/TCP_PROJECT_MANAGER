import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabaseCreds } from './env';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!hasSupabaseCreds) {
    // In demo mode we still expose a stub so imports don't blow up, but any
    // call will throw. Demo-mode code paths must short-circuit before calling.
    _client = createClient('https://demo.local', 'demo-anon-key');
    return _client;
  }
  _client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    const value = (client as unknown as Record<string, unknown>)[prop as string];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
