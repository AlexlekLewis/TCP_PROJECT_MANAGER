import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useDemoStore } from './useDemoStore';
import { demoStore } from '@/lib/demoStore';
import type { ProjectVariation, VariationStatus } from '@/types/db';

/**
 * Read variations for a project. Both roles can read:
 * - Admin sees the dollar `amount` and approval metadata.
 * - Manager (Gavin) reads through `project_variations_visible`, which masks
 *   `amount` / `approved_*` to null — he logs and tracks variations on-site
 *   but never sees the money. He can create (description only) but not price
 *   or approve. (See migration 20260612000001.)
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
        .from('project_variations_visible')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
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
      // INSERT into base table, re-fetch via the masked view so the manager's
      // returned row never carries the amount even via RETURNING.
      const ins = await supabase
        .from('project_variations')
        .insert(input)
        .select('id')
        .single();
      if (ins.error) throw ins.error;
      const out = await supabase
        .from('project_variations_visible')
        .select('*')
        .eq('id', ins.data.id)
        .single();
      if (out.error) throw out.error;
      return out.data as ProjectVariation;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['project-variations', row?.project_id] });
    },
  });
}

/**
 * Edit a variation's description / amount / notes. Admin only (this is where
 * the dollar amount gets set on a manager-logged variation before approval).
 */
export function useUpdateVariation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ProjectVariation, 'description' | 'amount' | 'notes'>>;
    }) => {
      if (env.demoMode) {
        demoStore.updateVariation(id, patch);
        return;
      }
      const { error } = await supabase.from('project_variations').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-variations'] }),
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
