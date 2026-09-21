/**
 * The two humans this app has. Both are created for real in GoTrue with a
 * password, because the thing under test is what Postgres does with their
 * JWT — a service-role client would bypass every policy we care about.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { stackConfig } from './env';

export type TestRole = 'admin' | 'manager';

export const TEST_USERS: Record<
  TestRole,
  { email: string; password: string; displayName: string }
> = {
  admin: {
    email: 'admin@integration.tricoat.test',
    password: 'integration-admin-pw',
    displayName: 'Integration Admin',
  },
  manager: {
    email: 'manager@integration.tricoat.test',
    password: 'integration-manager-pw',
    displayName: 'Integration Manager',
  },
};

export function serviceClient(): SupabaseClient {
  const { url, serviceRoleKey } = stackConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Idempotent: create the auth user if it isn't there, then make sure it has a
 * `profiles` row with the right role. `is_admin()` / `is_manager()` read that
 * row, so without it a signed-in user is neither.
 */
export async function provisionUsers(): Promise<Record<TestRole, string>> {
  const service = serviceClient();
  const { data: existing, error: listError } = await service.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) throw listError;

  const ids = {} as Record<TestRole, string>;

  for (const role of Object.keys(TEST_USERS) as TestRole[]) {
    const { email, password, displayName } = TEST_USERS[role];
    let id = existing.users.find((u) => u.email === email)?.id;
    if (!id) {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      id = data.user!.id;
    } else {
      // A previous run may have left a different password on the user.
      const { error } = await service.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    }
    const { error: profileError } = await service
      .from('profiles')
      .upsert({ id, role, display_name: displayName }, { onConflict: 'id' });
    if (profileError) throw profileError;
    ids[role] = id;
  }

  return ids;
}

/** A client carrying a real signed-in user JWT — what the browser holds. */
export async function signIn(role: TestRole): Promise<SupabaseClient> {
  const { url, anonKey } = stackConfig();
  const client = createClient(url, anonKey, {
    // Two clients live side by side in one test file; persisted sessions would
    // share a storage key and clobber each other.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(TEST_USERS[role]);
  if (error) throw new Error(`sign-in as ${role} failed: ${error.message}`);
  return client;
}
