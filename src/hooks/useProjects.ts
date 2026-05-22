import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/queryKeys';
import { demoStore } from '@/lib/demoStore';
import { useDemoStore } from './useDemoStore';
import type { Project } from '@/types/db';

export function useProjects() {
  const store = useDemoStore();
  return useQuery<Project[]>({
    queryKey: queryKeys.projects(),
    queryFn: async () => {
      if (env.demoMode) return store.projects;
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
    staleTime: env.demoMode ? 0 : 30_000,
  });
}

export function useProject(id: string | null) {
  const store = useDemoStore();
  return useQuery<Project | null>({
    queryKey: id ? queryKeys.project(id) : queryKeys.all,
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      if (env.demoMode) return store.projects.find((p) => p.id === id) ?? null;
      const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Project | null;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => {
      if (env.demoMode) return demoStore.createProject(input);
      const { data, error } = await supabase.from('projects').insert(input).select().single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects() }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Project> }) => {
      if (env.demoMode) {
        demoStore.updateProject(id, patch);
        return;
      }
      const { error } = await supabase.from('projects').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects() }),
  });
}

export function useArchiveProject() {
  const update = useUpdateProject();
  return {
    ...update,
    archive: (id: string) => update.mutateAsync({ id, patch: { status: 'archived' } }),
    unarchive: (id: string) => update.mutateAsync({ id, patch: { status: 'active' } }),
  };
}

/**
 * Hard-delete a project. Fails by design if time or material entries reference
 * it (payroll history must remain valid). Use archive for completed / retired
 * projects instead.
 */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (env.demoMode) {
        if (demoStore.projectHasEntries(id)) {
          throw new Error(
            'This project has time or material entries. Archive it instead to preserve the record.',
          );
        }
        demoStore.deleteProject(id);
        return;
      }
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) {
        // Supabase FK violation: force the admin towards archive
        if (/foreign key/i.test(error.message)) {
          throw new Error(
            'This project has time or material entries. Archive it instead to preserve the record.',
          );
        }
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects() }),
  });
}

/** Returns true if the project can be hard-deleted (no referencing entries). */
export function useProjectCanDelete(id: string | null | undefined) {
  const store = useDemoStore();
  if (!id) return false;
  if (env.demoMode) return !store.projectHasEntries(id);
  // Server-side: we can't cheaply check without a query; allow the attempt and
  // let `useDeleteProject` translate the FK error into a friendly message.
  return true;
}
