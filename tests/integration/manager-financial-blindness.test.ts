/**
 * Gavin is financially blind by grant, not by UI.
 *
 * The app hides the money from him, but the interesting question is what
 * Postgres does when something *isn't* the app — a stale build, a hand-rolled
 * request, a future hook that forgets to go through the masked view. So these
 * probe the base tables with his real token directly: select the column, sort
 * by it, filter on it. Postgres checks column grants for all three.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, expect, it } from 'vitest';

import { seedProject } from './helpers/fixtures';
import { describeStack } from './helpers/suite';
import { serviceClient, signIn } from './helpers/users';

/** Every dollar column the manager must not be able to read off a base table. */
const MASKED: Array<[table: string, column: string]> = [
  ['projects', 'quoted_price'],
  ['projects', 'materials_budget'],
  ['projects', 'target_profit'],
  ['project_scopes', 'quoted_price'],
  ['project_scopes', 'materials_budget'],
  ['project_scopes', 'target_profit'],
  ['project_variations', 'amount'],
];

describeStack('the manager cannot read money off the base tables', () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let manager: SupabaseClient;
  let projectId: string;

  beforeAll(async () => {
    service = serviceClient();
    admin = await signIn('admin');
    manager = await signIn('manager');
    projectId = await seedProject(service);
    const { error: scopeError } = await service.from('project_scopes').insert({
      project_id: projectId,
      name: 'Exterior',
      quoted_price: 4200,
      quoted_hours: 30,
      materials_budget: 600,
      target_profit: 900,
    });
    if (scopeError) throw scopeError;
    const { error: variationError } = await service.from('project_variations').insert({
      project_id: projectId,
      description: 'Extra gable end',
      amount: 750,
      created_by: (await admin.auth.getUser()).data.user!.id,
    });
    if (variationError) throw variationError;
  }, 30_000);

  it.each(MASKED)('manager cannot select %s.%s', async (table, column) => {
    const { error } = await manager.from(table).select(column);
    expect(error?.code).toBe('42501');
  });

  it.each(MASKED)('manager cannot filter on %s.%s', async (table, column) => {
    const { error } = await manager.from(table).select('id').gt(column, 0);
    expect(error?.code).toBe('42501');
  });

  it.each(MASKED)('manager cannot order by %s.%s', async (table, column) => {
    const { error } = await manager.from(table).select('id').order(column);
    expect(error?.code).toBe('42501');
  });

  it('manager keeps the id column he needs for the insert-then-read round trip', async () => {
    for (const table of ['projects', 'project_scopes', 'project_variations']) {
      const { error } = await manager.from(table).select('id').limit(1);
      expect(error, `${table}.id should stay readable`).toBeNull();
    }
  });

  it('manager reads the same rows through the views, with the money nulled', async () => {
    const project = await manager
      .from('projects_visible')
      .select('quoted_price, quoted_hours, materials_budget, target_profit')
      .eq('id', projectId)
      .single();
    expect(project.error).toBeNull();
    expect(project.data).toMatchObject({
      quoted_price: null,
      materials_budget: null,
      target_profit: null,
      quoted_hours: 300,
    });

    const scope = await manager
      .from('project_scopes_visible')
      .select('quoted_price, quoted_hours, materials_budget, target_profit')
      .eq('project_id', projectId)
      .single();
    expect(scope.error).toBeNull();
    expect(scope.data).toMatchObject({
      quoted_price: null,
      materials_budget: null,
      target_profit: null,
      quoted_hours: 30,
    });

    const variation = await manager
      .from('project_variations_visible')
      .select('amount, approved_at, approved_by, description')
      .eq('project_id', projectId)
      .single();
    expect(variation.error).toBeNull();
    expect(variation.data).toMatchObject({
      amount: null,
      approved_at: null,
      approved_by: null,
      description: 'Extra gable end',
    });
  });

  it('admin reads the money through the same views', async () => {
    const project = await admin
      .from('projects_visible')
      .select('quoted_price, materials_budget, target_profit')
      .eq('id', projectId)
      .single();
    expect(project.data).toMatchObject({
      quoted_price: 25000,
      materials_budget: 4000,
      target_profit: 6000,
    });

    const scope = await admin
      .from('project_scopes_visible')
      .select('quoted_price, materials_budget, target_profit')
      .eq('project_id', projectId)
      .single();
    expect(scope.data).toMatchObject({
      quoted_price: 4200,
      materials_budget: 600,
      target_profit: 900,
    });

    const variation = await admin
      .from('project_variations_visible')
      .select('amount')
      .eq('project_id', projectId)
      .single();
    expect(variation.data).toMatchObject({ amount: 750 });
  });
});
