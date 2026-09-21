#!/usr/bin/env node
/**
 * Local Supabase stack for the `tests/integration` suite.
 *
 * The suite has to talk to a real Postgres — that is the whole point of it —
 * but it must never talk to production, and it must not fight with whatever
 * other Supabase project already holds the default ports on this machine.
 * So this script runs a *second*, disposable stack from a generated copy of
 * `supabase/`, on its own ports, under its own docker project name.
 *
 * Three things the copy changes, none of which belong in the real config:
 *
 *  1. Ports are shifted (54321 -> 54421 by default). Another project's stack
 *     can stay up on the defaults. Override with INTEGRATION_PORT_BASE.
 *  2. `[auth.email] enable_signup` is turned ON. In current GoTrue that flag
 *     is the email *provider* switch, not just the sign-up switch — with it
 *     off, password sign-in is refused, and the suite signs in as two real
 *     users. Public sign-up stays off via `[auth] enable_signup = false`.
 *  3. A `00000000000000_*` migration is prepended that restores Supabase's
 *     historical grant-all default privileges before any table is created.
 *     Production was created when those were the default; the current CLI's
 *     local stack gives anon/authenticated only TRUNCATE/REFERENCES/TRIGGER/
 *     MAINTAIN on new tables, so without this every write fails on a grant
 *     and the RLS policies we actually want to test are never reached.
 *
 * Usage:
 *   node scripts/integration-stack.mjs up      start + db reset, print env
 *   node scripts/integration-stack.mjs test    up, then run the vitest suite
 *   node scripts/integration-stack.mjs env     print env for a running stack
 *   node scripts/integration-stack.mjs reset   re-run migrations only
 *   node scripts/integration-stack.mjs down    stop the stack
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workRoot = path.join(repoRoot, 'node_modules', '.tmp', 'integration-stack');
const workSupabase = path.join(workRoot, 'supabase');

const PROJECT_ID = process.env.INTEGRATION_PROJECT_ID || 'tricoat-pm-integration';
const PORT_BASE = Number(process.env.INTEGRATION_PORT_BASE || 54420);

const ports = {
  shadow: PORT_BASE, // 54420
  api: PORT_BASE + 1, // 54421
  db: PORT_BASE + 2, // 54422
  studio: PORT_BASE + 3, // 54423
  inbucket: PORT_BASE + 4, // 54424
  analytics: PORT_BASE + 7, // 54427
  pooler: PORT_BASE + 9, // 54429
};

// Everything the suite does is REST + GoTrue. No storage, realtime, studio,
// edge functions or log pipeline — they only cost startup time.
const EXCLUDE = [
  'realtime',
  'storage-api',
  'imgproxy',
  'studio',
  'edge-runtime',
  'logflare',
  'vector',
  'supavisor',
  'mailpit',
];

const DEFAULT_PRIVILEGES_SQL = `-- GENERATED — local integration stack only, never applied to any real project.
--
-- Restore the grant-all default privileges Supabase projects were created
-- with (and which production still has) so the migrations' own REVOKE/GRANT
-- statements are the thing under test, rather than the CLI's newer, tighter
-- defaults. Must run before the first CREATE TABLE: default privileges only
-- apply to objects created after they are set.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
`;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

function capture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', cwd: repoRoot, ...opts });
  if (res.error) throw res.error;
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** The CLI is a devDependency; `supabase` is often not on PATH. */
const cli = ['supabase', '--workdir', workRoot];
const npx = (args) => run('npx', [...cli, ...args]);
const npxCapture = (args) => capture('npx', [...cli, ...args]);

function setToml(toml, section, key, value) {
  const lines = toml.split('\n');
  let inSection = false;
  let replaced = false;
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      inSection = header[1] === section;
      continue;
    }
    if (inSection && new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) {
      lines[i] = `${key} = ${value}`;
      replaced = true;
    }
  }
  if (replaced) return lines.join('\n');
  // Section exists but the key doesn't: insert straight after the header.
  const headerIdx = lines.findIndex((l) => l.trim() === `[${section}]`);
  if (headerIdx >= 0) {
    lines.splice(headerIdx + 1, 0, `${key} = ${value}`);
    return lines.join('\n');
  }
  return `${lines.join('\n')}\n\n[${section}]\n${key} = ${value}\n`;
}

function buildWorkdir() {
  fs.rmSync(workSupabase, { recursive: true, force: true });
  fs.mkdirSync(path.join(workSupabase, 'migrations'), { recursive: true });

  let toml = fs.readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
  toml = `# GENERATED by scripts/integration-stack.mjs — do not edit, do not commit.\n${toml}`;
  toml = toml.replace(/^project_id\s*=.*$/m, `project_id = "${PROJECT_ID}"`);
  toml = setToml(toml, 'api', 'port', ports.api);
  toml = setToml(toml, 'db', 'port', ports.db);
  toml = setToml(toml, 'db', 'shadow_port', ports.shadow);
  toml = setToml(toml, 'studio', 'port', ports.studio);
  toml = setToml(toml, 'inbucket', 'port', ports.inbucket);
  toml = setToml(toml, 'analytics', 'port', ports.analytics);
  // Public sign-up stays off (as in the real config); the email provider goes
  // on, because that is what password sign-in actually depends on.
  toml = setToml(toml, 'auth', 'enable_signup', 'false');
  toml = setToml(toml, 'auth.email', 'enable_signup', 'true');
  toml = setToml(toml, 'auth.email', 'enable_confirmations', 'false');
  toml = setToml(toml, 'edge_runtime', 'enabled', 'false');
  fs.writeFileSync(path.join(workSupabase, 'config.toml'), toml);

  fs.writeFileSync(
    path.join(workSupabase, 'migrations', '00000000000000_local_default_privileges.sql'),
    DEFAULT_PRIVILEGES_SQL,
  );
  const src = path.join(repoRoot, 'supabase', 'migrations');
  for (const name of fs
    .readdirSync(src)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    fs.copyFileSync(path.join(src, name), path.join(workSupabase, 'migrations', name));
  }
}

function isRunning() {
  const res = capture('docker', [
    'ps',
    '--filter',
    `name=supabase_db_${PROJECT_ID}`,
    '--format',
    '{{.Names}}',
  ]);
  return res.stdout.trim().length > 0;
}

function statusEnv() {
  const res = npxCapture(['status', '-o', 'json']);
  if (res.status !== 0) {
    throw new Error(`supabase status failed:\n${res.stderr || res.stdout}`);
  }
  // `status` prints the upgrade nag on stdout too; take the JSON object only.
  const json = res.stdout.slice(res.stdout.indexOf('{'), res.stdout.lastIndexOf('}') + 1);
  const s = JSON.parse(json);
  return {
    SUPABASE_TEST_URL: s.API_URL,
    SUPABASE_TEST_ANON_KEY: s.ANON_KEY,
    SUPABASE_TEST_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
    SUPABASE_TEST_DB_URL: s.DB_URL,
  };
}

function assertLocal(vars) {
  const url = vars.SUPABASE_TEST_URL || '';
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url)) {
    throw new Error(`Refusing to run: ${url} is not a local stack.`);
  }
}

function up() {
  buildWorkdir();
  if (!isRunning()) {
    console.error(`\n→ starting ${PROJECT_ID} on api ${ports.api} / db ${ports.db}\n`);
    const code = npx(['start', '-x', EXCLUDE.join(',')]);
    if (code !== 0) process.exit(code);
  } else {
    console.error(`→ ${PROJECT_ID} already running`);
  }
  reset();
  return statusEnv();
}

function reset() {
  console.error('→ applying migrations (db reset)\n');
  const code = npx(['db', 'reset', '--no-seed']);
  if (code !== 0) process.exit(code);
}

function printEnv(vars) {
  for (const [k, v] of Object.entries(vars)) console.log(`export ${k}='${v}'`);
}

const command = process.argv[2] || 'up';

switch (command) {
  case 'up': {
    const vars = up();
    assertLocal(vars);
    printEnv(vars);
    break;
  }
  case 'reset': {
    buildWorkdir();
    reset();
    break;
  }
  case 'env': {
    const vars = statusEnv();
    assertLocal(vars);
    printEnv(vars);
    break;
  }
  case 'down': {
    buildWorkdir();
    process.exit(npx(['stop', '--no-backup']));
    break;
  }
  case 'test': {
    const vars = up();
    assertLocal(vars);
    const rest = process.argv.slice(3);
    const code = run('npx', ['vitest', 'run', 'tests/integration', ...rest], {
      env: { ...process.env, ...vars },
    });
    process.exit(code);
  }
  default:
    console.error(`unknown command: ${command}`);
    process.exit(2);
}
