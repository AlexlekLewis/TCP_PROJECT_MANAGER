# ADR 009 — Test the hooks against a real Postgres, on a disposable stack

- **Status**: Accepted
- **Date**: 2026-09-21
- **Context for**: nothing in the repo exercised the database. The manager's three writes from [ADR 005](005-manager-scopes-variations.md) were broken on a real project for three months and every suite stayed green.

## Context

`VITE_DEMO_MODE=true` short-circuits every hook before supabase-js — that is a deliberate convention ("prefer demo-mode-safe code paths", [CLAUDE.md](../../CLAUDE.md)) and it is what makes `npm run dev` work with no account. The Playwright suites run in demo mode too. The consequence is that **no test had ever executed an RLS policy, a column grant or a guard trigger**, which is where most of this app's business rules actually live: the manager's $-blindness, the week lock, the scope/variation exclusivity, `created_by` attribution.

On 2026-09-16 the bill came due. `useCreateScope`, `useUpdateScope` and `useCreateVariation` all failed against a real database — the first and third with a 403 on `RETURNING id`, the second by silently updating nothing — because `project_scopes` and `project_variations` had manager INSERT/UPDATE policies but no manager SELECT policy, and Postgres applies SELECT policies to the rows a write reads. Unit tests, e2e and CI were all green throughout.

## Decision

1. **A `tests/integration` suite that drives the app's own hooks.** The tests render `useCreateScope`, `useUpdateScope`, `useCreateTimeEntry` and the rest with `@/lib/supabase` mocked to a signed-in test client and `env.demoMode` forced false. No query is re-typed in a test, because the specific thing that broke was the _shape_ of the chain — `insert(...).select('id').single()`, `update(patch).eq('id', id)` — and a hand-copied query would drift away from it at the first refactor.

2. **Two real users, signed in with real passwords.** Created through the GoTrue admin API with a `profiles` row each. `is_admin()` / `is_manager()` read that row, so anything short of a genuine JWT tests nothing. Service-role clients appear only to assert ground truth, since neither user can read the base tables' money columns.

3. **The suite skips itself unless a local stack's env vars are present.** `npm run test` therefore stays a unit run and CI's existing job is unchanged. `npm run test:integration` starts the stack and injects them.

4. **The stack is a generated, port-shifted copy of `supabase/`**, run via `supabase --workdir`. Another project's stack routinely holds 54321/54322 on a dev machine, and the copy is also where two test-only config changes live so they never reach the real project:
   - `[auth.email] enable_signup = true`. In current GoTrue that flag is the email _provider_ switch, not just the sign-up switch; with it off, password sign-in is refused. Public sign-up stays off via `[auth] enable_signup = false`.
   - a prepended migration restoring `alter default privileges … grant all on tables to anon, authenticated, service_role`.

5. **The default-privilege prelude rather than a repo migration, for now.** Production was created when grant-all default privileges were Supabase's default; the current CLI gives new tables only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. Without restoring them the local stack fails every write on a missing grant, long before RLS is consulted — the opposite of production, and useless as a test. Granting the tables explicitly in a real migration is the right end state and is tracked separately; it has to be reconciled with [production's migration-history drift](../../CHANGELOG.md) first, and this suite shouldn't wait on that.

6. **The CI job reports but does not gate**, via `continue-on-error`. (Written but not merged here — the token that opened this PR has no `workflow` scope; the YAML is in [tests/integration/README.md](../../tests/integration/README.md).) Four tests are red on `main` the day this lands — three from the bug above, one from `useLockWeek` omitting `locked_by`. A red required check on every PR would just be turned off. The flag comes out when the suite is green, and from then on a broken policy fails the build.

## Consequences

- Docker is now needed for one command. It is not needed for `npm run dev`, `npm run test` or `npm run e2e`.
- The suite is the only place a migration can be proven before it reaches production, and the only place the `*_visible` view masking is checked against what the base table actually holds.
- Four failing tests are checked in deliberately. They are the bug list, in executable form; `tests/integration/README.md` names each one.
- The prelude duplicates a privilege decision that belongs in a migration. It is one file, generated, and carries a comment saying when to delete it.

## Why not test the queries directly instead of rendering hooks

A `tests/integration/queries.ts` holding "the same" chains would be simpler to read and would need no React. It would also be a copy — and a copy that passes while the hook it mirrors is broken is worse than no test, which is roughly the position this suite was written to get out of.
