/**
 * Env plumbing for the integration suite.
 *
 * The suite only runs when a local stack's coordinates are in the
 * environment. `npm run test` therefore stays a pure unit run — CI's existing
 * job is unaffected — and the suite turns itself on under
 * `npm run test:integration`, which starts the stack and injects these.
 *
 * Nothing here may import `vitest`: this module is reached from globalSetup,
 * which runs outside the test worker.
 */
import process from 'node:process';

const url = process.env.SUPABASE_TEST_URL ?? '';
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';

export const hasStack = Boolean(url && anonKey && serviceRoleKey);

/**
 * Hard stop if SUPABASE_TEST_URL is anything but loopback. These tests create
 * users, write rows and reset state; pointing them at a hosted project —
 * production above all — would be destructive.
 */
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/;

export function stackConfig() {
  if (!hasStack) {
    throw new Error(
      'Integration stack env not set. Run `npm run test:integration`, which starts it.',
    );
  }
  if (!LOOPBACK.test(url)) {
    throw new Error(`SUPABASE_TEST_URL must be a local stack; refusing to run against ${url}.`);
  }
  return { url, anonKey, serviceRoleKey };
}

/** Unique-per-run suffix so parallel files never collide on names. */
export function tag(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
