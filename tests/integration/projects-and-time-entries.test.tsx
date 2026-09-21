/**
 * Projects and the daily hours log, against a real Postgres.
 *
 * Same idea as the scopes suite: the app's own hooks issue the queries, so
 * what is under test is the chain the app ships. What this file adds is the
 * payroll side — who may write an hour, what the database refuses outright,
 * and what a locked week does to the manager.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async () => (await import('./helpers/appModules')).envModule());
vi.mock('@/lib/supabase', async () => (await import('./helpers/appModules')).supabaseModule());

import { useCreateProject, useProject, useProjects, useUpdateProject } from '@/hooks/useProjects';
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useTimeEntriesForProject,
  useUpdateTimeEntry,
} from '@/hooks/useTimeEntries';
import { useLockWeek } from '@/hooks/useWeekLocks';
import { withClient } from './helpers/activeClient';
import { tag } from './helpers/env';
import { failure, num, seedProject, workerId } from './helpers/fixtures';
import { runMutation, runQuery } from './helpers/runHook';
import { describeStack } from './helpers/suite';
import { serviceClient, signIn } from './helpers/users';

/** Mondays nothing else in the suite touches. */
const ENFORCED_LOCK_WEEK = '2019-02-04';
const HOOK_LOCK_WEEK = '2019-03-04';
const OPEN_DAY = '2019-06-05';

/** A complete `projects` row, since the hook's input type omits nothing else. */
function projectInput(overrides: Record<string, unknown> = {}) {
  return {
    name: tag('Project'),
    client_name: 'Integration Client',
    address: '1 Test Street',
    quoted_price: 18000,
    quoted_hours: 240,
    materials_budget: 3000,
    target_profit: 5000,
    daily_hours_warning: null,
    quote_type: 'fixed_quote' as const,
    needs_admin_review: false,
    status: 'active' as const,
    color_tag: null,
    start_date: null,
    end_date: null,
    notes: null,
    ...overrides,
  };
}

describeStack('projects + time entries against Postgres', () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let manager: SupabaseClient;
  let adminId: string;
  let managerId: string;
  let projectId: string;
  let gavin: string;

  beforeAll(async () => {
    service = serviceClient();
    admin = await signIn('admin');
    manager = await signIn('manager');
    adminId = (await admin.auth.getUser()).data.user!.id;
    managerId = (await manager.auth.getUser()).data.user!.id;
    projectId = await seedProject(service);
    gavin = await workerId(service, 'Gavin');
  }, 30_000);

  afterAll(async () => {
    // Week locks are global by date; leave none behind.
    for (const week of [ENFORCED_LOCK_WEEK, HOOK_LOCK_WEEK]) {
      await admin.from('week_locks').delete().eq('week_start', week);
    }
  });

  // ---------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------

  it('admin creates a project and reads its quote back', async () => {
    const input = projectInput();
    const created = await withClient(admin, () =>
      runMutation(useCreateProject, (m) => m.mutateAsync(input)),
    );

    expect(created.id).toEqual(expect.any(String));
    expect(created.name).toBe(input.name);
    expect(num(created.quoted_price)).toBe(18000);

    const read = await withClient(admin, () => runQuery(() => useProject(created.id)));
    expect(num(read?.quoted_price)).toBe(18000);
    expect(num(read?.materials_budget)).toBe(3000);
    expect(num(read?.target_profit)).toBe(5000);
  });

  it('manager sees the job on his list but none of its money', async () => {
    const projects = await withClient(manager, () => runQuery(useProjects));
    const seeded = projects.find((p) => p.id === projectId);
    expect(seeded, 'manager should see the seeded project').toBeDefined();
    expect(seeded!.quoted_price).toBeNull();
    expect(seeded!.materials_budget).toBeNull();
    expect(seeded!.target_profit).toBeNull();
    expect(num(seeded!.quoted_hours)).toBe(300);
  });

  it('manager can file a draft project, flagged for review and unpriced', async () => {
    const input = projectInput({
      name: tag('Gavin draft'),
      needs_admin_review: true,
      quoted_price: null,
      materials_budget: null,
      target_profit: null,
    });
    const created = await withClient(manager, () =>
      runMutation(useCreateProject, (m) => m.mutateAsync(input)),
    );

    const { data: raw, error } = await service
      .from('projects')
      .select('name, needs_admin_review, quoted_price')
      .eq('id', created.id)
      .single();
    if (error) throw error;
    expect(raw).toMatchObject({ name: input.name, needs_admin_review: true, quoted_price: null });
  });

  it('manager cannot create a project that skips review', async () => {
    const error = await failure(
      withClient(manager, () =>
        runMutation(useCreateProject, (m) =>
          m.mutateAsync(projectInput({ name: tag('Gavin priced'), needs_admin_review: false })),
        ),
      ),
    );
    expect(error.code).toBe('42501');
  });

  it('manager cannot rename a project', async () => {
    const { data: before } = await service
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();

    // No error: RLS refuses an UPDATE by matching no rows.
    await withClient(manager, () =>
      runMutation(useUpdateProject, (m) =>
        m.mutateAsync({ id: projectId, patch: { name: 'Renamed by Gavin' } }),
      ),
    );

    const { data: after } = await service
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();
    expect(after!.name).toBe(before!.name);
  });

  // ---------------------------------------------------------------------
  // Time entries
  // ---------------------------------------------------------------------

  it('manager logs, edits and deletes hours in an open week', async () => {
    const created = await withClient(manager, () =>
      runMutation(useCreateTimeEntry, (m) =>
        m.mutateAsync({
          entry_date: OPEN_DAY,
          worker_id: gavin,
          project_id: projectId,
          scope_id: null,
          variation_id: null,
          hours: 7.5,
          task: 'Ceilings',
          notes: null,
          ai_source_id: null,
        }),
      ),
    );

    expect(num(created.hours)).toBe(7.5);
    expect(created.task).toBe('Ceilings');
    // created_by is the server's to set — it defaults to auth.uid() and the
    // insert policy refuses any other value, so hours can't be misattributed.
    expect(created.created_by).toBe(managerId);

    await withClient(manager, () =>
      runMutation(useUpdateTimeEntry, (m) =>
        m.mutateAsync({ id: created.id, patch: { hours: 6 } }),
      ),
    );

    const entries = await withClient(manager, () =>
      runQuery(() => useTimeEntriesForProject(projectId)),
    );
    expect(num(entries.find((e) => e.id === created.id)?.hours)).toBe(6);

    await withClient(manager, () =>
      runMutation(useDeleteTimeEntry, (m) => m.mutateAsync(created.id)),
    );
    const { data: gone } = await service
      .from('time_entries')
      .select('id')
      .eq('id', created.id)
      .maybeSingle();
    expect(gone).toBeNull();
  });

  it('the 14-hour cap belongs to the database, not the form', async () => {
    const error = await failure(
      withClient(manager, () =>
        runMutation(useCreateTimeEntry, (m) =>
          m.mutateAsync({
            entry_date: OPEN_DAY,
            worker_id: gavin,
            project_id: projectId,
            scope_id: null,
            variation_id: null,
            hours: 15,
            task: null,
            notes: null,
            ai_source_id: null,
          }),
        ),
      ),
    );
    expect(error.code).toBe('23514');
    expect(error.message).toContain('time_entries_hours_check');
  });

  it('an hour is scope work or variation work, never both', async () => {
    const { data: scope } = await service
      .from('project_scopes')
      .insert({ project_id: projectId, name: tag('Scope'), quoted_hours: 8 })
      .select('id')
      .single();
    const { data: variation } = await service
      .from('project_variations')
      .insert({
        project_id: projectId,
        description: tag('Variation'),
        amount: null,
        created_by: adminId,
      })
      .select('id')
      .single();

    const error = await failure(
      withClient(manager, () =>
        runMutation(useCreateTimeEntry, (m) =>
          m.mutateAsync({
            entry_date: OPEN_DAY,
            worker_id: gavin,
            project_id: projectId,
            scope_id: scope!.id,
            variation_id: variation!.id,
            hours: 2,
            task: null,
            notes: null,
            ai_source_id: null,
          }),
        ),
      ),
    );
    expect(error.code).toBe('23514');
    expect(error.message).toContain('time_entries_scope_xor_variation');
  });

  it("hours cannot be tagged to another project's variation", async () => {
    const otherProject = await seedProject(service, { name: tag('Other project') });
    const { data: variation } = await service
      .from('project_variations')
      .insert({
        project_id: projectId,
        description: tag('Belongs elsewhere'),
        amount: null,
        created_by: adminId,
      })
      .select('id')
      .single();

    const error = await failure(
      withClient(manager, () =>
        runMutation(useCreateTimeEntry, (m) =>
          m.mutateAsync({
            entry_date: OPEN_DAY,
            worker_id: gavin,
            project_id: otherProject,
            scope_id: null,
            variation_id: variation!.id,
            hours: 2,
            task: null,
            notes: null,
            ai_source_id: null,
          }),
        ),
      ),
    );
    expect(error.message).toContain('can only be tagged to a variation on its own project');
  });

  // ---------------------------------------------------------------------
  // Week locks — the payroll freeze
  // ---------------------------------------------------------------------

  it('a locked week freezes the manager out of the hours in it', async () => {
    const dayInLockedWeek = '2019-02-06';

    // Logged first: once the week is locked, even a service-role write trips
    // the audit trigger's reason requirement.
    const { data: existing, error: seedError } = await service
      .from('time_entries')
      .insert({
        entry_date: dayInLockedWeek,
        worker_id: gavin,
        project_id: projectId,
        hours: 4,
        created_by: managerId,
      })
      .select('id')
      .single();
    if (seedError) throw seedError;

    // What useLockWeek should send. It doesn't — see the next test.
    const { error: lockError } = await admin
      .from('week_locks')
      .insert({ week_start: ENFORCED_LOCK_WEEK, locked_by: adminId });
    expect(lockError).toBeNull();

    const insertError = await failure(
      withClient(manager, () =>
        runMutation(useCreateTimeEntry, (m) =>
          m.mutateAsync({
            entry_date: dayInLockedWeek,
            worker_id: gavin,
            project_id: projectId,
            scope_id: null,
            variation_id: null,
            hours: 3,
            task: null,
            notes: null,
            ai_source_id: null,
          }),
        ),
      ),
    );
    expect(insertError.code).toBe('42501');

    // Update and delete are refused by matching no rows, so the entry itself
    // is the only witness.
    await withClient(manager, () =>
      runMutation(useUpdateTimeEntry, (m) =>
        m.mutateAsync({ id: existing.id, patch: { hours: 9 } }),
      ),
    );
    await withClient(manager, () =>
      runMutation(useDeleteTimeEntry, (m) => m.mutateAsync(existing.id)),
    );

    const { data: after } = await service
      .from('time_entries')
      .select('hours')
      .eq('id', existing.id)
      .maybeSingle();
    expect(after, 'the entry should survive a manager delete in a locked week').not.toBeNull();
    expect(num(after!.hours)).toBe(4);

    await admin.from('week_locks').delete().eq('week_start', ENFORCED_LOCK_WEEK);
  });

  it('admin locks a week', async () => {
    await withClient(admin, () => runMutation(useLockWeek, (m) => m.mutateAsync(HOOK_LOCK_WEEK)));

    const { data, error } = await service
      .from('week_locks')
      .select('week_start, locked_by')
      .eq('week_start', HOOK_LOCK_WEEK)
      .maybeSingle();
    if (error) throw error;
    expect(data).toMatchObject({ week_start: HOOK_LOCK_WEEK, locked_by: adminId });
  });
});
