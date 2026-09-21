/**
 * Ground-truth reads and throwaway rows.
 *
 * Assertions about what the DB actually stored go through the service-role
 * client: the manager is not allowed to read the money (that is the feature),
 * and the admin reads it through a masking view, so neither can testify to
 * what is in the base table.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { tag } from './env';

export interface RawScope {
  id: string;
  project_id: string;
  name: string;
  quoted_price: number | null;
  quoted_hours: number | null;
  materials_budget: number | null;
  target_profit: number | null;
  order_index: number;
  notes: string | null;
}

export interface RawVariation {
  id: string;
  project_id: string;
  description: string;
  amount: number | null;
  status: string;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
}

async function one<T>(client: SupabaseClient, table: string, id: string): Promise<T | null> {
  const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as T) ?? null;
}

export const rawScope = (c: SupabaseClient, id: string) => one<RawScope>(c, 'project_scopes', id);
export const rawVariation = (c: SupabaseClient, id: string) =>
  one<RawVariation>(c, 'project_variations', id);

/** A priced project, created past RLS so the test starts from a known state. */
export async function seedProject(
  service: SupabaseClient,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await service
    .from('projects')
    .insert({
      name: tag('Integration project'),
      client_name: 'Integration Client',
      quoted_price: 25000,
      quoted_hours: 300,
      materials_budget: 4000,
      target_profit: 6000,
      status: 'active',
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function workerId(service: SupabaseClient, name = 'Gavin'): Promise<string> {
  const { data, error } = await service.from('workers').select('id').eq('name', name).single();
  if (error) throw error;
  return data.id as string;
}

/** Postgres `numeric` arrives as a JSON number; normalise before comparing. */
export const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Await a call that must fail, and hand back the Postgres error it failed with. */
export async function failure(
  promise: Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error('expected this call to be refused, but it succeeded');
}
