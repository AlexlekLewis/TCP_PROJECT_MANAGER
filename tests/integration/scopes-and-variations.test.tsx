/**
 * The manager's scope + variation flows, against a real Postgres.
 *
 * Every one of these runs the app's own hook, so the supabase-js chain that
 * reaches the database is the one the app ships — including the two shapes
 * that broke on 2026-09-16 and that demo mode can never exercise:
 * `insert(...).select('id').single()` and `update(patch).eq('id', id)`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async () => (await import('./helpers/appModules')).envModule());
vi.mock('@/lib/supabase', async () => (await import('./helpers/appModules')).supabaseModule());

import {
  useCreateScope,
  useDeleteScope,
  useProjectScopes,
  useUpdateScope,
} from '@/hooks/useProjectScopes';
import {
  useCreateVariation,
  useProjectVariations,
  useUpdateVariation,
  useUpdateVariationStatus,
} from '@/hooks/useProjectVariations';
import { withClient } from './helpers/activeClient';
import { num, rawScope, rawVariation, seedProject } from './helpers/fixtures';
import { tag } from './helpers/env';
import { runMutation, runQuery } from './helpers/runHook';
import { describeStack } from './helpers/suite';
import { serviceClient, signIn } from './helpers/users';

describeStack('project scopes + variations against Postgres', () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let manager: SupabaseClient;
  let managerId: string;
  let projectId: string;

  beforeAll(async () => {
    service = serviceClient();
    admin = await signIn('admin');
    manager = await signIn('manager');
    managerId = (await manager.auth.getUser()).data.user!.id;
    projectId = await seedProject(service);
  }, 30_000);

  // ---------------------------------------------------------------------
  // Manager writes — the three calls that had no manager SELECT policy and
  // so either 403'd on RETURNING or quietly updated nothing.
  // ---------------------------------------------------------------------

  it('manager adds a scope, and the trigger strips the money off it', async () => {
    const created = await withClient(manager, () =>
      runMutation(useCreateScope, (m) =>
        m.mutateAsync({
          project_id: projectId,
          name: 'Gavin — upstairs bedrooms',
          // The dialog hides these, but a hand-rolled request could carry
          // them, so the trigger — not the UI — has to be what nulls them.
          quoted_price: 9999,
          materials_budget: 1234,
          target_profit: 500,
          quoted_hours: 40,
          status: 'active',
          order_index: 0,
          notes: 'logged on site',
        }),
      ),
    );

    expect(created.id).toEqual(expect.any(String));
    expect(created.name).toBe('Gavin — upstairs bedrooms');
    expect(num(created.quoted_hours)).toBe(40);
    // What came back to him through project_scopes_visible.
    expect(created.quoted_price).toBeNull();
    expect(created.materials_budget).toBeNull();
    expect(created.target_profit).toBeNull();

    // What is actually on disk.
    const raw = (await rawScope(service, created.id))!;
    expect(raw.quoted_price).toBeNull();
    expect(raw.materials_budget).toBeNull();
    expect(raw.target_profit).toBeNull();
    expect(num(raw.quoted_hours)).toBe(40);
  });

  it("manager edits a scope without disturbing the admin's prices", async () => {
    const created = await withClient(admin, () =>
      runMutation(useCreateScope, (m) =>
        m.mutateAsync({
          project_id: projectId,
          name: 'Exterior',
          quoted_price: 4200,
          materials_budget: 600,
          target_profit: 900,
          quoted_hours: 30,
          status: 'active',
          order_index: 1,
          notes: null,
        }),
      ),
    );

    await withClient(manager, () =>
      runMutation(useUpdateScope, (m) =>
        m.mutateAsync({
          id: created.id,
          patch: {
            name: 'Exterior + eaves',
            quoted_hours: 55,
            // Same again: the patch carries a price, the trigger must ignore it.
            quoted_price: 1,
          },
        }),
      ),
    );

    const raw = (await rawScope(service, created.id))!;
    expect(raw.name).toBe('Exterior + eaves');
    expect(num(raw.quoted_hours)).toBe(55);
    expect(num(raw.quoted_price)).toBe(4200);
    expect(num(raw.materials_budget)).toBe(600);
    expect(num(raw.target_profit)).toBe(900);
  });

  it('manager logs a variation, unpriced and pending', async () => {
    const created = await withClient(manager, () =>
      runMutation(useCreateVariation, (m) =>
        m.mutateAsync({
          project_id: projectId,
          description: 'Client asked for the sick bay ceiling too',
          amount: 750,
          status: 'approved',
          notes: null,
        }),
      ),
    );

    expect(created.id).toEqual(expect.any(String));
    expect(created.amount).toBeNull();

    const raw = (await rawVariation(service, created.id))!;
    expect(raw.description).toBe('Client asked for the sick bay ceiling too');
    expect(raw.amount).toBeNull();
    expect(raw.status).toBe('pending');
    expect(raw.approved_at).toBeNull();
    expect(raw.approved_by).toBeNull();
    // created_by defaults to auth.uid(); the insert policy refuses anything else.
    expect(raw.created_by).toBe(managerId);
  });

  it('manager reads hours through the views and never a dollar', async () => {
    const name = tag('Masked scope');
    await withClient(admin, () =>
      runMutation(useCreateScope, (m) =>
        m.mutateAsync({
          project_id: projectId,
          name,
          quoted_price: 7500,
          materials_budget: 900,
          target_profit: 1100,
          quoted_hours: 62,
          status: 'active',
          order_index: 9,
          notes: null,
        }),
      ),
    );
    await withClient(admin, () =>
      runMutation(useCreateVariation, (m) =>
        m.mutateAsync({
          project_id: projectId,
          description: tag('Masked variation'),
          amount: 640,
          status: 'approved',
          notes: null,
        }),
      ),
    );

    const scopes = await withClient(manager, () => runQuery(() => useProjectScopes(projectId)));
    expect(scopes.length).toBeGreaterThan(0);
    for (const s of scopes) {
      expect(s.quoted_price).toBeNull();
      expect(s.materials_budget).toBeNull();
      expect(s.target_profit).toBeNull();
    }
    // Hours are his to see — that is how he judges progress on site.
    expect(num(scopes.find((s) => s.name === name)?.quoted_hours)).toBe(62);

    const variations = await withClient(manager, () =>
      runQuery(() => useProjectVariations(projectId)),
    );
    expect(variations.length).toBeGreaterThan(0);
    for (const v of variations) {
      expect(v.amount).toBeNull();
      expect(v.approved_at).toBeNull();
      expect(v.approved_by).toBeNull();
    }
  });

  // ---------------------------------------------------------------------
  // Manager writes that must not land. RLS refuses an UPDATE/DELETE by
  // matching no rows, so these fail silently at the API — the row itself is
  // the only witness.
  // ---------------------------------------------------------------------

  it('manager cannot delete a scope', async () => {
    const created = await withClient(admin, () =>
      runMutation(useCreateScope, (m) =>
        m.mutateAsync({
          project_id: projectId,
          name: 'Do not delete me',
          quoted_price: 1000,
          materials_budget: 100,
          target_profit: 200,
          quoted_hours: 10,
          status: 'active',
          order_index: 2,
          notes: null,
        }),
      ),
    );

    await withClient(manager, () => runMutation(useDeleteScope, (m) => m.mutateAsync(created.id)));

    const raw = await rawScope(service, created.id);
    expect(raw).not.toBeNull();
    expect(raw!.name).toBe('Do not delete me');
  });

  it('manager cannot price, approve or delete a variation', async () => {
    const created = await withClient(admin, () =>
      runMutation(useCreateVariation, (m) =>
        m.mutateAsync({
          project_id: projectId,
          description: 'Admin-owned variation',
          amount: null,
          status: 'pending',
          notes: null,
        }),
      ),
    );

    await withClient(manager, () =>
      runMutation(useUpdateVariation, (m) =>
        m.mutateAsync({ id: created.id, patch: { amount: 750 } }),
      ),
    );
    await withClient(manager, () =>
      runMutation(useUpdateVariationStatus, (m) =>
        m.mutateAsync({ id: created.id, status: 'approved' }),
      ),
    );
    // No delete hook exists — the manager's UI has no such button — so this is
    // the raw call a manager token could still make.
    const deleted = await manager.from('project_variations').delete().eq('id', created.id);
    expect(deleted.error).toBeNull();

    const raw = (await rawVariation(service, created.id))!;
    expect(raw.amount).toBeNull();
    expect(raw.status).toBe('pending');
    expect(raw.approved_at).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------

  it('admin prices a manager-logged variation and approves it', async () => {
    // Seeded past RLS rather than through useCreateVariation as the manager,
    // so an outstanding bug in *his* write can't mask a bug in the admin's
    // pricing. Row shape is exactly what his insert produces: unpriced,
    // pending, created_by him.
    const { data: seeded, error: seedError } = await service
      .from('project_variations')
      .insert({
        project_id: projectId,
        description: tag('Repaint the laundry'),
        amount: null,
        status: 'pending',
        created_by: managerId,
      })
      .select('id')
      .single();
    if (seedError) throw seedError;
    const logged = seeded as { id: string };

    await withClient(admin, () =>
      runMutation(useUpdateVariation, (m) =>
        m.mutateAsync({ id: logged.id, patch: { amount: 880, notes: 'quoted 2026-09-21' } }),
      ),
    );
    await withClient(admin, () =>
      runMutation(useUpdateVariationStatus, (m) =>
        m.mutateAsync({ id: logged.id, status: 'approved' }),
      ),
    );

    const raw = (await rawVariation(service, logged.id))!;
    expect(num(raw.amount)).toBe(880);
    expect(raw.status).toBe('approved');
    expect(raw.approved_at).not.toBeNull();

    const seen = await withClient(admin, () => runQuery(() => useProjectVariations(projectId)));
    expect(num(seen.find((v) => v.id === logged.id)?.amount)).toBe(880);
  });

  it('admin deletes a scope', async () => {
    const created = await withClient(admin, () =>
      runMutation(useCreateScope, (m) =>
        m.mutateAsync({
          project_id: projectId,
          name: 'Temporary scope',
          quoted_price: 100,
          materials_budget: null,
          target_profit: null,
          quoted_hours: 5,
          status: 'active',
          order_index: 3,
          notes: null,
        }),
      ),
    );

    await withClient(admin, () => runMutation(useDeleteScope, (m) => m.mutateAsync(created.id)));
    expect(await rawScope(service, created.id)).toBeNull();
  });

  it('admin sees the prices the manager cannot', async () => {
    const name = tag('Priced scope');
    await withClient(admin, () =>
      runMutation(useCreateScope, (m) =>
        m.mutateAsync({
          project_id: projectId,
          name,
          quoted_price: 4200,
          materials_budget: 600,
          target_profit: 900,
          quoted_hours: 30,
          status: 'active',
          order_index: 10,
          notes: null,
        }),
      ),
    );

    const scopes = await withClient(admin, () => runQuery(() => useProjectScopes(projectId)));
    const priced = scopes.find((s) => s.name === name);
    expect(num(priced?.quoted_price)).toBe(4200);
    expect(num(priced?.materials_budget)).toBe(600);
    expect(num(priced?.target_profit)).toBe(900);
  });
});
