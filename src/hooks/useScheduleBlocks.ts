import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { assertRowsAffected } from '@/lib/errors';
import { queryKeys } from '@/lib/queryKeys';
import { demoStore } from '@/lib/demoStore';
import { useDemoStore } from './useDemoStore';
import type { ProjectScheduleBlock } from '@/types/db';

/**
 * Every schedule part across all projects — the board plots them all at once,
 * so there's no point fetching per project. No `*_visible` view: parts carry
 * no money, so there's nothing to mask from the manager.
 */
export function useScheduleBlocks() {
  const store = useDemoStore();
  return useQuery<ProjectScheduleBlock[]>({
    queryKey: queryKeys.scheduleBlocks(),
    queryFn: async () => {
      if (env.demoMode) return store.scheduleBlocks;
      const { data, error } = await supabase
        .from('project_schedule_blocks')
        .select('*')
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data as ProjectScheduleBlock[];
    },
    staleTime: env.demoMode ? 0 : 30_000,
  });
}

/**
 * Writing a part moves `projects.start_date`/`end_date` too (DB trigger), so
 * every mutation here also invalidates the projects query — otherwise the
 * board's own rows are right while the rest of the app shows stale dates.
 */
function useInvalidateSchedule() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.scheduleBlocks() });
    qc.invalidateQueries({ queryKey: queryKeys.projects() });
  };
}

export function useCreateScheduleBlock() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: async (
      input: Omit<ProjectScheduleBlock, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      if (env.demoMode) return demoStore.createScheduleBlock(input);
      const { data, error } = await supabase
        .from('project_schedule_blocks')
        .insert(input)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProjectScheduleBlock;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateScheduleBlock() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<ProjectScheduleBlock>;
    }) => {
      if (env.demoMode) {
        demoStore.updateScheduleBlock(id, patch);
        return;
      }
      // Admin-only write under RLS; a manager's drag comes back 204 with zero
      // rows and no error. Read the id back so the board can roll the bar
      // straight back instead of leaving it where it was dropped.
      const { data, error } = await supabase
        .from('project_schedule_blocks')
        .update(patch)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      assertRowsAffected(data, 'schedule part');
    },
    onSuccess: invalidate,
  });
}

export function useDeleteScheduleBlock() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: async (id: string) => {
      if (env.demoMode) {
        demoStore.deleteScheduleBlock(id);
        return;
      }
      const { data, error } = await supabase
        .from('project_schedule_blocks')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      assertRowsAffected(data, 'schedule part', 'delete');
    },
    onSuccess: invalidate,
  });
}
