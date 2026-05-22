// Hand-written Supabase schema types.
// Re-generate after schema changes with:
//   supabase gen types typescript --local > src/types/db.generated.ts

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export type Role = 'admin' | 'manager';
export type ProjectStatus = 'active' | 'complete' | 'archived';
export type EntryStatus = 'pending' | 'in_progress' | 'complete';
/**
 * `fixed_quote` — the classic painter-quote: agreed $ total, profit-vs-quote
 * applies. `time_and_materials` — no fixed quote, bill at charge-out rate;
 * the gross-margin card is omitted in favour of projected-profit.
 */
export type QuoteType = 'fixed_quote' | 'time_and_materials';
export type VariationStatus = 'pending' | 'approved' | 'rejected';

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
   * Cost per hour worked (what the business pays the worker per hour).
   * Admin only — managers see `null` via workers_visible. Was previously
   * named `hourly_rate`; renamed to clarify semantics in the 2026-05-22
   * profit-model migration.
   */
  cost_rate: number | null;
  /**
   * Fixed weekly amount (owner draw, apprentice stipend) on top of /
   * independent of cost_rate. Admin only.
   */
  weekly_wage: number | null;
  /**
   * Hourly rate billed to the client. Admin only. Default $65/hr.
   */
  charge_out_rate: number | null;
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
  /**
   * Planned profit on this job (Alex sets at quote time). Admin only —
   * managers see null. Used to compute profit health on the detail page.
   */
  target_profit: number | null;
  /** Fixed-quote vs time & materials. Determines which UI fields show. */
  quote_type: QuoteType;
  /**
   * Manager-created drafts land with this `true`. The admin Projects
   * list highlights them and the project detail shows a "review and
   * complete the quote" banner. Cleared via "Mark reviewed".
   */
  needs_admin_review: boolean;
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

/**
 * Variation = scope added to a project mid-job (client asked for X on top of
 * the quote). Only `approved` variations roll into the project total quote.
 * Admin-only at the DB layer.
 */
export interface ProjectVariation {
  id: UUID;
  project_id: UUID;
  description: string;
  amount: number;
  status: VariationStatus;
  notes: string | null;
  created_at: ISODateTime;
  created_by: UUID;
  approved_at: ISODateTime | null;
  approved_by: UUID | null;
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
