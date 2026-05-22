import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/queryKeys';
import { demoStore } from '@/lib/demoStore';
import { useDemoStore } from './useDemoStore';
import type { MaterialEntry } from '@/types/db';

export function useMaterialEntries() {
  const store = useDemoStore();
  return useQuery<MaterialEntry[]>({
    queryKey: queryKeys.materialEntries(),
    queryFn: async () => {
      if (env.demoMode) return store.materialEntries;
      const { data, error } = await supabase
        .from('material_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data as MaterialEntry[];
    },
  });
}

export function useMaterialEntriesForProject(projectId: string) {
  const store = useDemoStore();
  return useQuery<MaterialEntry[]>({
    queryKey: queryKeys.materialEntriesByProject(projectId),
    queryFn: async () => {
      if (env.demoMode) return store.materialEntries.filter((m) => m.project_id === projectId);
      const { data, error } = await supabase
        .from('material_entries')
        .select('*')
        .eq('project_id', projectId)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data as MaterialEntry[];
    },
  });
}

export function useCreateMaterialEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MaterialEntry, 'id' | 'created_at' | 'created_by'>) => {
      if (env.demoMode) return demoStore.createMaterialEntry(input);
      const { data, error } = await supabase
        .from('material_entries')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as MaterialEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.materialEntries() }),
  });
}

export function useDeleteMaterialEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (env.demoMode) {
        demoStore.deleteMaterialEntry(id);
        return;
      }
      const { error } = await supabase.from('material_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.materialEntries() }),
  });
}
