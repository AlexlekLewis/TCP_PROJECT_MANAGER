// Mutable in-memory store used when VITE_DEMO_MODE=true.
// Everything goes through this module so UI state updates on writes without
// needing a real Supabase subscription.

import {
  DEMO_MATERIAL_ENTRIES,
  DEMO_PROJECTS,
  DEMO_TIME_ENTRIES,
  DEMO_USER_ID,
  DEMO_VOICE_LOGS,
  DEMO_WEEK_LOCKS,
  DEMO_WORKERS,
} from './demo';
import type {
  MaterialEntry,
  Project,
  ProjectVariation,
  TimeEntry,
  VariationStatus,
  VoiceLog,
  WeekLock,
  Worker,
} from '@/types/db';

type Listener = () => void;

class DemoStore {
  workers: Worker[] = [...DEMO_WORKERS];
  projects: Project[] = [...DEMO_PROJECTS];
  timeEntries: TimeEntry[] = [...DEMO_TIME_ENTRIES];
  materialEntries: MaterialEntry[] = [...DEMO_MATERIAL_ENTRIES];
  voiceLogs: VoiceLog[] = [...DEMO_VOICE_LOGS];
  weekLocks: WeekLock[] = [...DEMO_WEEK_LOCKS];
  variations: ProjectVariation[] = [];

  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private genId(prefix = '') {
    return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private now() {
    return new Date().toISOString();
  }

  // --- Workers -----------------------------------------------------------
  createWorker(w: Omit<Worker, 'id' | 'created_at'>) {
    const row: Worker = { ...w, id: this.genId('w-'), created_at: this.now() };
    this.workers = [...this.workers, row];
    this.notify();
    return row;
  }
  updateWorker(id: string, patch: Partial<Worker>) {
    this.workers = this.workers.map((w) => (w.id === id ? { ...w, ...patch } : w));
    this.notify();
  }
  deleteWorker(id: string) {
    // Soft delete — preserve foreign keys
    this.updateWorker(id, { active: false });
  }

  // --- Projects ----------------------------------------------------------
  createProject(p: Omit<Project, 'id' | 'created_at' | 'updated_at'>) {
    const row: Project = { ...p, id: this.genId('p-'), created_at: this.now(), updated_at: this.now() };
    this.projects = [...this.projects, row];
    this.notify();
    return row;
  }
  updateProject(id: string, patch: Partial<Project>) {
    this.projects = this.projects.map((p) =>
      p.id === id ? { ...p, ...patch, updated_at: this.now() } : p,
    );
    this.notify();
  }
  archiveProject(id: string) {
    this.updateProject(id, { status: 'archived' });
  }
  deleteProject(id: string) {
    this.projects = this.projects.filter((p) => p.id !== id);
    this.notify();
  }
  projectHasEntries(id: string) {
    return (
      this.timeEntries.some((t) => t.project_id === id) ||
      this.materialEntries.some((m) => m.project_id === id)
    );
  }

  // --- Time entries ------------------------------------------------------
  createTimeEntry(e: Omit<TimeEntry, 'id' | 'created_at' | 'updated_at' | 'created_by'>) {
    const row: TimeEntry = {
      ...e,
      id: this.genId('t-'),
      created_by: DEMO_USER_ID,
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.timeEntries = [...this.timeEntries, row];
    this.notify();
    return row;
  }
  updateTimeEntry(id: string, patch: Partial<TimeEntry>) {
    this.timeEntries = this.timeEntries.map((t) =>
      t.id === id ? { ...t, ...patch, updated_at: this.now() } : t,
    );
    this.notify();
  }
  deleteTimeEntry(id: string) {
    this.timeEntries = this.timeEntries.filter((t) => t.id !== id);
    this.notify();
  }

  // --- Material entries --------------------------------------------------
  createMaterialEntry(e: Omit<MaterialEntry, 'id' | 'created_at' | 'created_by'>) {
    const row: MaterialEntry = {
      ...e,
      id: this.genId('m-'),
      created_by: DEMO_USER_ID,
      created_at: this.now(),
    };
    this.materialEntries = [...this.materialEntries, row];
    this.notify();
    return row;
  }
  deleteMaterialEntry(id: string) {
    this.materialEntries = this.materialEntries.filter((m) => m.id !== id);
    this.notify();
  }

  // --- Week locks --------------------------------------------------------
  lockWeek(weekStart: string) {
    if (this.weekLocks.some((l) => l.week_start === weekStart)) return;
    this.weekLocks = [
      ...this.weekLocks,
      { week_start: weekStart, locked_at: this.now(), locked_by: DEMO_USER_ID },
    ];
    this.notify();
  }
  unlockWeek(weekStart: string) {
    this.weekLocks = this.weekLocks.filter((l) => l.week_start !== weekStart);
    this.notify();
  }
  isWeekLocked(date: string) {
    return this.weekLocks.some((l) => date >= l.week_start && date <= addDaysISO(l.week_start, 6));
  }

  // --- Variations --------------------------------------------------------
  createVariation(
    v: Omit<ProjectVariation, 'id' | 'created_at' | 'created_by' | 'approved_at' | 'approved_by'>,
  ) {
    const row: ProjectVariation = {
      ...v,
      id: this.genId('var-'),
      created_by: DEMO_USER_ID,
      created_at: this.now(),
      approved_at: null,
      approved_by: null,
    };
    this.variations = [row, ...this.variations];
    this.notify();
    return row;
  }
  updateVariationStatus(id: string, status: VariationStatus) {
    this.variations = this.variations.map((v) =>
      v.id === id
        ? {
            ...v,
            status,
            approved_at: status === 'approved' ? this.now() : null,
            approved_by: status === 'approved' ? DEMO_USER_ID : null,
          }
        : v,
    );
    this.notify();
  }

  // --- Voice logs --------------------------------------------------------
  createVoiceLog(transcript: string, parsed: unknown) {
    const row: VoiceLog = {
      id: this.genId('v-'),
      transcript,
      parsed_json: parsed,
      created_by: DEMO_USER_ID,
      created_at: this.now(),
    };
    this.voiceLogs = [row, ...this.voiceLogs];
    this.notify();
    return row;
  }
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const demoStore = new DemoStore();
