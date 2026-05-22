import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Profile, Role } from '@/types/db';
import { DEMO_PROFILES, DEMO_USER_ID } from '@/lib/demo';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  /**
   * The role that *UI gating* should treat the caller as. May be a
   * "view-as" override of `actualRole` for admins previewing the
   * manager portal. For privilege decisions, `actualRole` is the truth.
   */
  role: Role | null;
  /** The role pulled from the DB profile (or demo). The privilege truth. */
  actualRole: Role | null;
  /**
   * True when an admin has toggled "view as manager" and is currently
   * previewing the lower-privilege UI.
   */
  isViewingAs: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Demo mode only: swap which DEMO_PROFILE represents the caller. */
  setDemoRole?: (role: Role) => void;
  /**
   * Real-mode admin only: override the effective role for UI preview.
   * Pass `null` to revert. The underlying Supabase session does NOT
   * change — this is a client-side UI gate. The DB still treats the
   * caller as admin (so payloads will still contain admin-only
   * columns); only the UI presentation changes.
   */
  setViewAsRole?: (role: Role | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_ROLE_KEY = 'tricoat:demoRole';
const VIEW_AS_KEY = 'tricoat:viewAsRole';

function readDemoRole(): Role {
  if (typeof window === 'undefined') return 'admin';
  const stored = window.localStorage.getItem(DEMO_ROLE_KEY);
  return stored === 'manager' ? 'manager' : 'admin';
}

function readViewAsRole(): Role | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(VIEW_AS_KEY);
  return stored === 'manager' || stored === 'admin' ? stored : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsRole, setViewAsRoleState] = useState<Role | null>(readViewAsRole);

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

  const value = useMemo<AuthContextValue>(() => {
    const actualRole: Role | null = profile?.role ?? null;
    const canViewAs = actualRole === 'admin';
    const effectiveRole: Role | null = canViewAs && viewAsRole ? viewAsRole : actualRole;
    const isViewingAs = canViewAs && viewAsRole != null && viewAsRole !== actualRole;

    return {
      user,
      profile,
      role: effectiveRole,
      actualRole,
      isViewingAs,
      loading,
      async signIn(email, password) {
        if (env.demoMode) return { error: null };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        if (env.demoMode) return;
        // Sign-out clears the view-as preview too so the next login
        // starts in the actual role.
        try {
          window.localStorage.removeItem(VIEW_AS_KEY);
        } catch {
          /* ignore */
        }
        setViewAsRoleState(null);
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
                /* ignore */
              }
            }
          }
        : undefined,
      setViewAsRole:
        canViewAs && !env.demoMode
          ? (r: Role | null) => {
              setViewAsRoleState(r);
              try {
                if (r) window.localStorage.setItem(VIEW_AS_KEY, r);
                else window.localStorage.removeItem(VIEW_AS_KEY);
              } catch {
                /* ignore */
              }
            }
          : undefined,
    };
  }, [user, profile, loading, viewAsRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
