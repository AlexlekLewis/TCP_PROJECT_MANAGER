# Integration suite — the app's hooks against a real Postgres

Everything else in this repo tests the app with the database taken out.
Unit tests cover pure functions; the Playwright suites run with
`VITE_DEMO_MODE=true`, and every hook short-circuits before it reaches
supabase-js. So RLS policies, column grants and triggers — the layer that
actually decides what Gavin can do — were never executed by a test.

On 2026-09-16 that showed. All three of the manager's writes from
[ADR 005](../../docs/decisions/005-manager-scopes-variations.md) failed on a
real database, and nothing was red.

This suite runs the app's **own hooks** against a throwaway local stack.
No query is re-typed here: the tests render `useCreateScope`,
`useUpdateScope`, `useCreateTimeEntry` and the rest, so the chain that
reaches Postgres is the chain the app ships — including the two shapes that
broke, `insert(...).select('id').single()` and `update(patch).eq('id', id)`.

## Running it

```bash
npm run test:integration
```

That starts the stack if it isn't up, applies the migrations, and runs the
suite. Stop it with `npm run stack:down`. `npm run stack:up` prints the env
vars if you want to drive them yourself, and `npm run test:integration:only`
runs vitest against an already-running stack.

Requires Docker. Nothing else — the Supabase CLI is a devDependency and is
invoked through `npx`.

**`npm run test` skips this suite** unless `SUPABASE_TEST_URL`,
`SUPABASE_TEST_ANON_KEY` and `SUPABASE_TEST_SERVICE_ROLE_KEY` are set, so the
unit job stays a unit job.

## The stack it runs against

`scripts/integration-stack.mjs` generates a copy of `supabase/` under
`node_modules/.tmp/` and runs the CLI against that with `--workdir`. Three
things differ from the real config, and all three are reasons the copy exists
instead of editing `supabase/config.toml`:

1. **Shifted ports** (54421/54422 by default, `INTEGRATION_PORT_BASE` to
   change) and its own `project_id`, so another project's stack can keep the
   default ports.
2. **`[auth.email] enable_signup = true`.** In current GoTrue that flag is the
   email _provider_ switch — with it off, password sign-in is refused
   outright, and these tests sign in as two real users. Public sign-up stays
   off via `[auth] enable_signup = false`, as in the real config.
3. **A prepended `00000000000000_local_default_privileges.sql`** that restores
   `alter default privileges ... grant all on tables to anon, authenticated,
service_role` before the first `create table`. Production was created when
   those were Supabase's defaults; the current CLI gives new tables only
   TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. Without it every write fails on a
   missing grant and the RLS policies under test are never reached. A repo
   migration that grants those tables explicitly is tracked separately; when
   it lands, this prelude can go.

The suite refuses to run against anything but loopback — see
`helpers/env.ts`. It creates users and writes rows; it must never see a hosted
project.

## Users

Two, created through the GoTrue admin API by `globalSetup.ts` with real
passwords and a `profiles` row each — `is_admin()` and `is_manager()` read
that row, so a signed-in user without one is neither. Service-role clients
appear only to assert ground truth: the manager is not allowed to read the
money, and the admin reads it through a masking view, so neither can testify
to what the base table actually holds.

## CI

Not wired up in this PR: the token that pushed it has no `workflow` OAuth
scope, so `.github/workflows/ci.yml` couldn't be touched. The job to add,
alongside the existing `e2e` one (indented two spaces, under `jobs:`):

```yaml
integration:
  # The suite that actually talks to Postgres: RLS policies, column grants
  # and the guard triggers, driven through the app's own hooks.
  #
  # continue-on-error because four of its tests are red on main today, each
  # one a real bug it was written to catch (see below). It reports; it does
  # not gate. Remove this line once the suite is green — from then on a
  # broken policy should fail the build.
  continue-on-error: true
  runs-on: ubuntu-latest
  needs: build-and-test
  timeout-minutes: 25
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - name: Integration tests (local Supabase stack)
      run: npm run test:integration
    - name: Stop the stack
      if: always()
      run: npm run stack:down
```

The existing `build-and-test` job needs no change — `npm run test` skips this
suite without the env vars. Its step is labelled "Unit + integration tests",
which is now only half true.

## What is currently red

Four tests fail against `main`'s migrations. They are not flaky and they are
not wrong — each one is a bug this suite exists to catch:

| Test                     | Bug                                                                          |
| ------------------------ | ---------------------------------------------------------------------------- |
| manager adds a scope     | `useCreateScope`'s `insert ... returning id` → 42501                         |
| manager edits a scope    | `useUpdateScope`'s `update ... where id` → 0 rows, no error                  |
| manager logs a variation | `useCreateVariation`'s `insert ... returning id` → 42501                     |
| admin locks a week       | `useLockWeek` omits `locked_by`, which is `not null` with no default → 23502 |

The first three have one cause: `project_scopes` and `project_variations` have
manager INSERT/UPDATE policies but no manager SELECT policy, and Postgres
applies SELECT policies to the rows a write reads. A migration for that is
already written on `fix/tighten-view-grants` / commit `52e8810`, awaiting a
production check. The fourth is unfixed.
