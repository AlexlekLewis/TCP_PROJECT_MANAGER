import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/queryKeys';
import { demoStore } from '@/lib/demoStore';
import { useDemoStore } from './useDemoStore';
import type { Worker } from '@/types/db';

export function useWorkers() {
  const store = useDemoStore();
  return useQuery<Worker[]>({
    queryKey: queryKeys.workers(),
    queryFn: async () => {
      if (env.demoMode) return store.workers;
      // `workers_visible` masks cost_rate + weekly_wage + charge_out_rate
      // → null for non-admin callers.
      // Always read through the view; admin-write paths still target the
      // underlying `workers` table.
      const { data, error } = await supabase.from('workers_visible').select('*').order('name');
      if (error) throw error;
      return data as Worker[];
    },
  });
}

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Worker, 'id' | 'created_at'>) => {
      if (env.demoMode) return demoStore.createWorker(input);
      // `.select()` is `RETURNING *`, which hits the same missing grant as
      // useUpdateWorker below — "permission denied for table workers" in live
      // mode. Left as-is: the fix is the grant, not the query.
      const { data, error } = await supabase.from('workers').insert(input).select().single();
      if (error) throw error;
      return data as Worker;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workers() }),
  });
}

export function useUpdateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Worker> }) => {
      if (env.demoMode) {
        demoStore.updateWorker(id, patch);
        return;
      }
      // No `.select('id')` row check here, unlike every other update hook:
      // `authenticated` has no SELECT privilege on `workers` at all — not even
      // on `id`. 20260522000003 revoked the table read to hide the pay rates
      // and, unlike projects / project_scopes / project_variations, never
      // granted `select (id)` back. Postgres needs SELECT on any column a
      // statement reads, so this UPDATE's own `where id = …` already fails
      // with "permission denied for table workers" (verified on a scratch
      // database with the migrations applied). That's a loud failure, not a
      // silent one, so the dialog does show it — but worker edits can't work
      // in live mode until the grant is restored.
      const { error } = await supabase.from('workers').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workers() }),
  });
}
