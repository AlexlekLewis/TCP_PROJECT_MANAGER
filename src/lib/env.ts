export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
} as const;

export const hasSupabaseCreds = !!(env.supabaseUrl && env.supabaseAnonKey);
