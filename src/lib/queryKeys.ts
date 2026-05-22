export const queryKeys = {
  all: ['tricoat'] as const,

  profile: () => [...queryKeys.all, 'profile'] as const,

  workers: () => [...queryKeys.all, 'workers'] as const,
  worker: (id: string) => [...queryKeys.workers(), id] as const,

  projects: () => [...queryKeys.all, 'projects'] as const,
  project: (id: string) => [...queryKeys.projects(), id] as const,

  timeEntries: () => [...queryKeys.all, 'timeEntries'] as const,
  timeEntriesByWeek: (weekStart: string) => [...queryKeys.timeEntries(), 'week', weekStart] as const,
  timeEntriesByProject: (projectId: string) =>
    [...queryKeys.timeEntries(), 'project', projectId] as const,

  materialEntries: () => [...queryKeys.all, 'materialEntries'] as const,
  materialEntriesByProject: (projectId: string) =>
    [...queryKeys.materialEntries(), 'project', projectId] as const,

  voiceLogs: () => [...queryKeys.all, 'voiceLogs'] as const,
  weekLocks: () => [...queryKeys.all, 'weekLocks'] as const,
  auditLog: () => [...queryKeys.all, 'auditLog'] as const,
  settings: () => [...queryKeys.all, 'settings'] as const,
};
