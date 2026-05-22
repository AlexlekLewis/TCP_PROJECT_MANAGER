import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useDemoStore } from './useDemoStore';
import { demoStore } from '@/lib/demoStore';
import type { ProjectVariation, VariationStatus } from '@/types/db';

/**
 * Admin-only. The project_variations table is gated to admins via RLS;
 * for managers the read returns [] (and the UI never renders the
 * variations section anyway).
 */
export function useProjectVariations(projectId: string | null | undefined) {
  const store = useDemoStore();
  return useQuery<ProjectVariation[]>({
    queryKey: ['project-variations', projectId ?? 'none'],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [];
      if (env.demoMode) {
        return store.variations.filter((v) => v.project_id === projectId);
      }
      const { data, error } = await supabase
        .from('project_variations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) {
        // Manager hits RLS deny — return [] rather than crash.
        if (/permission denied|RLS/i.test(error.message)) return [];
        throw error;
      }
      return data as ProjectVariation[];
    },
  });
}

export function useCreateVariation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<
        ProjectVariation,
        'id' | 'created_at' | 'created_by' | 'approved_at' | 'approved_by'
      >,
    ) => {
      if (env.demoMode) return demoStore.createVariation(input);
      const { data, error } = await supabase
        .from('project_variations')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectVariation;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['project-variations', row?.project_id] });
    },
  });
}

export function useUpdateVariationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VariationStatus }) => {
      if (env.demoMode) {
        demoStore.updateVariationStatus(id, status);
        return;
      }
      const patch: Partial<ProjectVariation> = { status };
      if (status === 'approved') {
        patch.approved_at = new Date().toISOString();
      } else {
        patch.approved_at = null;
        patch.approved_by = null;
      }
      const { error } = await supabase.from('project_variations').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-variations'] }),
  });
}
