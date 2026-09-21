/**
 * Runs once per vitest run, before any test file. No-ops unless the local
 * stack env is present, so the unit suite is unaffected.
 */
import { hasStack, stackConfig } from './helpers/env';
import { provisionUsers } from './helpers/users';

export default async function setup() {
  if (!hasStack) return;
  stackConfig(); // throws if the URL isn't loopback
  await provisionUsers();
}
