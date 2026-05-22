import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/queryKeys';
import { demoStore } from '@/lib/demoStore';
import { useDemoStore } from './useDemoStore';
import { toISODate, weekEnd, weekStart } from '@/lib/dates';
import type { TimeEntry } from '@/types/db';

export function useAllTimeEntries() {
  const store = useDemoStore();
  return useQuery<TimeEntry[]>({
    queryKey: queryKeys.timeEntries(),
    queryFn: async () => {
      if (env.demoMode) return store.timeEntries;
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data as TimeEntry[];
    },
  });
}

export function useTimeEntriesForWeek(anchor: Date | string) {
  const store = useDemoStore();
  const start = toISODate(weekStart(anchor));
  const end = toISODate(weekEnd(anchor));
  return useQuery<TimeEntry[]>({
    queryKey: queryKeys.timeEntriesByWeek(start),
    queryFn: async () => {
      if (env.demoMode) {
        return store.timeEntries.filter((t) => t.entry_date >= start && t.entry_date <= end);
      }
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .gte('entry_date', start)
        .lte('entry_date', end)
        .order('entry_date');
      if (error) throw error;
      return data as TimeEntry[];
    },
  });
}

export function useTimeEntriesForProject(projectId: string) {
  const store = useDemoStore();
  return useQuery<TimeEntry[]>({
    queryKey: queryKeys.timeEntriesByProject(projectId),
    queryFn: async () => {
      if (env.demoMode) return store.timeEntries.filter((t) => t.project_id === projectId);
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('project_id', projectId)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data as TimeEntry[];
    },
  });
}

export function useCreateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<TimeEntry, 'id' | 'created_at' | 'updated_at' | 'created_by'>,
    ) => {
      if (env.demoMode) return demoStore.createTimeEntry(input);
      const { data, error } = await supabase.from('time_entries').insert(input).select().single();
      if (error) throw error;
      return data as TimeEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries() }),
  });
}

export function useUpdateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TimeEntry> }) => {
      if (env.demoMode) {
        demoStore.updateTimeEntry(id, patch);
        return;
      }
      const { error } = await supabase.from('time_entries').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries() }),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (env.demoMode) {
        demoStore.deleteTimeEntry(id);
        return;
      }
      const { error } = await supabase.from('time_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries() }),
  });
}
