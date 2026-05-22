// Hand-written Supabase schema types.
// Re-generate after schema changes with:
//   supabase gen types typescript --local > src/types/db.generated.ts

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export type Role = 'admin' | 'manager';
export type ProjectStatus = 'active' | 'complete' | 'archived';
export type EntryStatus = 'pending' | 'in_progress' | 'complete';

export interface Profile {
  id: UUID;
  role: Role;
  display_name: string;
  created_at: ISODateTime;
}

export interface Worker {
  id: UUID;
  name: string;
  /**
   * Admin only. Managers reading via the `workers_visible` view receive
   * `null` here — `useCanSeeFinancials()` should already be gating any UI
   * that surfaces this number, and downstream maths must coalesce to 0.
   */
  hourly_rate: number | null;
  active: boolean;
  created_at: ISODateTime;
}

export interface Project {
  id: UUID;
  name: string;
  client_name: string | null;
  address: string | null;
  quoted_price: number | null;
  quoted_hours: number | null;
  materials_budget: number | null;
  /**
   * Optional per-worker per-day soft cap on this project. When a worker
   * logs more than this many hours on this project in a single day, the
   * UI flags the entry (yellow). Does not block the save.
   */
  daily_hours_warning: number | null;
  status: ProjectStatus;
  color_tag: string | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TimeEntry {
  id: UUID;
  entry_date: ISODate;
  worker_id: UUID;
  project_id: UUID;
  hours: number;
  /** Free-text label for the sub-task (e.g., "Ceilings", "Skirtings"). */
  task: string | null;
  notes: string | null;
  created_by: UUID;
  ai_source_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface MaterialEntry {
  id: UUID;
  entry_date: ISODate;
  project_id: UUID;
  description: string;
  cost: number;
  supplier: string | null;
  created_by: UUID;
  ai_source_id: UUID | null;
  created_at: ISODateTime;
}

export interface VoiceLog {
  id: UUID;
  transcript: string;
  parsed_json: unknown;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface WeekLock {
  week_start: ISODate; // Monday
  locked_at: ISODateTime;
  locked_by: UUID;
}

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditLogRow {
  id: number;
  occurred_at: ISODateTime;
  actor: UUID;
  table_name: string;
  row_id: UUID;
  action: AuditAction;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface Settings {
  id: number;
  overhead_percent: number;
  hours_per_day: number;
  updated_at: ISODateTime;
}

// Convenience: parsed voice log output shape from the Edge Function
export interface ParsedEntry {
  date: ISODate;
  worker_name: string;
  project_name: string;
  hours: number;
  notes?: string;
  confidence: number;
  source_phrase: string;
}

export interface ParsedMaterial {
  date: ISODate;
  project_name: string;
  description: string;
  cost: number;
  confidence: number;
  source_phrase: string;
}

export interface ParsedVoiceResult {
  entries: ParsedEntry[];
  materials: ParsedMaterial[];
  unresolved: string[];
}
