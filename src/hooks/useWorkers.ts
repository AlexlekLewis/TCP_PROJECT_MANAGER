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
      const { data, error } = await supabase.from('workers').select('*').order('name');
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
      const { error } = await supabase.from('workers').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workers() }),
  });
}
