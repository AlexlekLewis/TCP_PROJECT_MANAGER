import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Profile, Role } from '@/types/db';
import { DEMO_PROFILES, DEMO_USER_ID } from '@/lib/demo';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // Demo only: swap between admin/manager to showcase role-gated UX
  setDemoRole?: (role: Role) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_ROLE_KEY = 'tricoat:demoRole';

function readDemoRole(): Role {
  if (typeof window === 'undefined') return 'admin';
  const stored = window.localStorage.getItem(DEMO_ROLE_KEY);
  return stored === 'manager' ? 'manager' : 'admin';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (env.demoMode) {
      const role = readDemoRole();
      setUser({ id: DEMO_USER_ID, email: 'alex@tricoat.local' } as User);
      setProfile(DEMO_PROFILES.find((p) => p.role === role) ?? DEMO_PROFILES[0]);
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      handleSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      handleSession(session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };

    async function handleSession(session: Session | null) {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setUser(session.user);
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      setProfile(profileRow as Profile | null);
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      async signIn(email, password) {
        if (env.demoMode) {
          return { error: null };
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        if (env.demoMode) {
          return;
        }
        await supabase.auth.signOut();
      },
      setDemoRole: env.demoMode
        ? (role: Role) => {
            const p = DEMO_PROFILES.find((x) => x.role === role);
            if (p) {
              setProfile(p);
              try {
                window.localStorage.setItem(DEMO_ROLE_KEY, role);
              } catch {
                /* ignore storage errors */
              }
            }
          }
        : undefined,
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
