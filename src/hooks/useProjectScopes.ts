import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useDemoStore } from './useDemoStore';
import { demoStore } from '@/lib/demoStore';
import type { ProjectScope } from '@/types/db';

export function useProjectScopes(projectId: string | null | undefined) {
  const store = useDemoStore();
  return useQuery<ProjectScope[]>({
    queryKey: ['project-scopes', projectId ?? 'none'],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [];
      if (env.demoMode) {
        return store.scopes
          .filter((s) => s.project_id === projectId)
          .sort((a, b) => a.order_index - b.order_index);
      }
      const { data, error } = await supabase
        .from('project_scopes_visible')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return data as ProjectScope[];
    },
  });
}

export function useCreateScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<ProjectScope, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      if (env.demoMode) return demoStore.createScope(input);
      // INSERT into base table (admin via RLS), re-fetch via view so the
      // returned shape matches what we read elsewhere.
      const ins = await supabase
        .from('project_scopes')
        .insert(input)
        .select('id')
        .single();
      if (ins.error) throw ins.error;
      const out = await supabase
        .from('project_scopes_visible')
        .select('*')
        .eq('id', ins.data.id)
        .single();
      if (out.error) throw out.error;
      return out.data as ProjectScope;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['project-scopes', row?.project_id] });
    },
  });
}

export function useUpdateScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProjectScope> }) => {
      if (env.demoMode) {
        demoStore.updateScope(id, patch);
        return;
      }
      const { error } = await supabase.from('project_scopes').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-scopes'] }),
  });
}

export function useDeleteScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (env.demoMode) {
        demoStore.deleteScope(id);
        return;
      }
      const { error } = await supabase.from('project_scopes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-scopes'] }),
  });
}
