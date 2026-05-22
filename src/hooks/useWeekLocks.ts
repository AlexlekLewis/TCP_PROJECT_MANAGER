import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/queryKeys';
import { demoStore } from '@/lib/demoStore';
import { useDemoStore } from './useDemoStore';
import type { WeekLock } from '@/types/db';

export function useWeekLocks() {
  const store = useDemoStore();
  return useQuery<WeekLock[]>({
    queryKey: queryKeys.weekLocks(),
    queryFn: async () => {
      if (env.demoMode) return store.weekLocks;
      const { data, error } = await supabase.from('week_locks').select('*').order('week_start');
      if (error) throw error;
      return data as WeekLock[];
    },
  });
}

export function useLockWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStartIso: string) => {
      if (env.demoMode) {
        demoStore.lockWeek(weekStartIso);
        return;
      }
      const { error } = await supabase.from('week_locks').insert({ week_start: weekStartIso });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.weekLocks() }),
  });
}

export function useUnlockWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStartIso: string) => {
      if (env.demoMode) {
        demoStore.unlockWeek(weekStartIso);
        return;
      }
      const { error } = await supabase.from('week_locks').delete().eq('week_start', weekStartIso);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.weekLocks() }),
  });
}
