// In-memory fixtures used when VITE_DEMO_MODE=true. Lets the dev server run
// without a live Supabase project so Alex can click through the UI.

import { addDays, format } from 'date-fns';
import type {
  MaterialEntry,
  Profile,
  Project,
  TimeEntry,
  VoiceLog,
  WeekLock,
  Worker,
} from '@/types/db';
import { weekStart } from './dates';

const today = new Date();
const monday = weekStart(today);
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export const DEMO_USER_ID = 'demo-admin-0000-0000-000000000001';
export const DEMO_MANAGER_ID = 'demo-manager-000-0000-000000000002';

export const DEMO_PROFILES: Profile[] = [
  { id: DEMO_USER_ID, role: 'admin', display_name: 'Alex Lewis', created_at: iso(today) },
  { id: DEMO_MANAGER_ID, role: 'manager', display_name: 'Gavin', created_at: iso(today) },
];

export const DEMO_WORKERS: Worker[] = [
  // Values match the live tricoat-pm seed (2026-05-22).
  { id: 'w-jerry',  name: 'Jerry',  cost_rate: 30, weekly_wage: 0,    charge_out_rate: 65, active: true, created_at: iso(today) },
  { id: 'w-pierce', name: 'Pierce', cost_rate: 35, weekly_wage: 900,  charge_out_rate: 65, active: true, created_at: iso(today) },
  { id: 'w-gavin',  name: 'Gavin',  cost_rate: 50, weekly_wage: 0,    charge_out_rate: 65, active: true, created_at: iso(today) },
  { id: 'w-alex',   name: 'Alex',   cost_rate: 0,  weekly_wage: 1250, charge_out_rate: 65, active: true, created_at: iso(today) },
];

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'p-northcote',
    name: 'Northcote High School',
    client_name: 'DET VIC',
    address: 'Northcote, VIC',
    quoted_price: 48000,
    quoted_hours: 320,
    materials_budget: 6500,
    daily_hours_warning: 8,
    target_profit: null,
    quote_type: 'fixed_quote',
    needs_admin_review: false,
    status: 'active',
    color_tag: '#7ba48f',
    start_date: iso(addDays(monday, -14)),
    end_date: iso(addDays(monday, 28)),
    notes: 'Heritage sections require two-pack primer.',
    created_at: iso(today),
    updated_at: iso(today),
  },
  {
    id: 'p-preston',
    name: 'Preston High School',
    client_name: 'DET VIC',
    address: 'Preston, VIC',
    quoted_price: 22000,
    quoted_hours: 140,
    materials_budget: 3000,
    daily_hours_warning: 8,
    target_profit: null,
    quote_type: 'fixed_quote',
    needs_admin_review: false,
    status: 'active',
    color_tag: '#c8a46a',
    start_date: iso(addDays(monday, -7)),
    end_date: iso(addDays(monday, 14)),
    notes: null,
    created_at: iso(today),
    updated_at: iso(today),
  },
  {
    id: 'p-belmore',
    name: 'Belmore School',
    client_name: 'DET VIC',
    address: 'Belmore, NSW',
    quoted_price: 12000,
    quoted_hours: 80,
    materials_budget: 1800,
    daily_hours_warning: 6,
    target_profit: null,
    quote_type: 'fixed_quote',
    needs_admin_review: false,
    status: 'active',
    color_tag: '#c08a8a',
    start_date: iso(addDays(monday, -3)),
    end_date: iso(addDays(monday, 7)),
    notes: 'Night work for gym — check school access times.',
    created_at: iso(today),
    updated_at: iso(today),
  },
  {
    id: 'p-ivanhoe',
    name: 'Ivanhoe Heritage Terrace',
    client_name: 'The Thompsons',
    address: '14 Noel St, Ivanhoe',
    quoted_price: 18500,
    quoted_hours: 120,
    materials_budget: 2400,
    daily_hours_warning: null,
    target_profit: 4500,
    quote_type: 'fixed_quote',
    needs_admin_review: false,
    status: 'complete',
    color_tag: '#8b8b94',
    start_date: iso(addDays(monday, -56)),
    end_date: iso(addDays(monday, -21)),
    notes: 'Completed on budget. Client referral potential.',
    created_at: iso(today),
    updated_at: iso(today),
  },
];

// Seed a week of realistic entries across the two active projects
function mkTimeEntry(
  id: string,
  dayOffset: number,
  workerId: string,
  projectId: string,
  hours: number,
  notes: string | null = null,
  task: string | null = null,
): TimeEntry {
  const d = iso(addDays(monday, dayOffset));
  return {
    id,
    entry_date: d,
    worker_id: workerId,
    project_id: projectId,
    scope_id: null,
    hours,
    task,
    notes,
    created_by: DEMO_MANAGER_ID,
    ai_source_id: null,
    created_at: iso(today),
    updated_at: iso(today),
  };
}

export const DEMO_TIME_ENTRIES: TimeEntry[] = [
  // Monday — Jerry split across two tasks on Northcote
  mkTimeEntry('t1', 0, 'w-jerry', 'p-northcote', 4, 'Heritage trims', 'Trims'),
  mkTimeEntry('t1b', 0, 'w-jerry', 'p-northcote', 6, 'Ceilings PM', 'Ceilings'),
  mkTimeEntry('t2', 0, 'w-pierce', 'p-preston', 3, 'Reception prep', 'Prep'),
  mkTimeEntry('t3', 0, 'w-pierce', 'p-belmore', 4.5, 'Gym poles undercoat', 'Undercoat'),
  mkTimeEntry('t4', 0, 'w-gavin', 'p-preston', 8, null, 'Walls'),
  // Tuesday
  mkTimeEntry('t5', 1, 'w-jerry', 'p-northcote', 9, null, 'Ceilings'),
  mkTimeEntry('t6', 1, 'w-pierce', 'p-belmore', 7.5, null, 'Final coat'),
  mkTimeEntry('t7', 1, 'w-gavin', 'p-preston', 8, null, 'Walls'),
  // Wednesday
  mkTimeEntry('t8', 2, 'w-jerry', 'p-northcote', 8),
  mkTimeEntry('t9', 2, 'w-pierce', 'p-belmore', 8),
  mkTimeEntry('t10', 2, 'w-gavin', 'p-northcote', 6, 'Helped Jerry finish heritage section'),
  // Recurring tasks across jobs — gives Reports → "Task times" real sample
  // sizes. "sanding window" (t13) is a deliberate lower-case/singular variant
  // that folds into "Sanding windows" to show the benchmark de-duplicates.
  mkTimeEntry('t11', 0, 'w-pierce', 'p-northcote', 2.5, 'Office crack repairs', 'Sanding windows'),
  mkTimeEntry('t12', 1, 'w-gavin', 'p-belmore', 3, null, 'Sanding windows'),
  mkTimeEntry('t13', 2, 'w-jerry', 'p-preston', 2, null, 'sanding window'),
  mkTimeEntry('t14', 1, 'w-pierce', 'p-northcote', 4, null, 'Gap filling skirts'),
  mkTimeEntry('t15', 2, 'w-gavin', 'p-preston', 3.5, null, 'Gap filling skirts'),
];

export const DEMO_MATERIAL_ENTRIES: MaterialEntry[] = [
  {
    id: 'm1',
    entry_date: iso(monday),
    project_id: 'p-northcote',
    description: 'Haymes Ultra Premium Low Sheen x 20L (heritage cream)',
    cost: 340,
    supplier: 'Haymes Paint',
    scope_id: null,
    created_by: DEMO_MANAGER_ID,
    ai_source_id: null,
    created_at: iso(today),
  },
  {
    id: 'm2',
    entry_date: iso(addDays(monday, 1)),
    project_id: 'p-belmore',
    description: 'Dulux Weathershield x 10L (satin black, gym poles)',
    cost: 185,
    supplier: 'Bunnings',
    scope_id: null,
    created_by: DEMO_MANAGER_ID,
    ai_source_id: null,
    created_at: iso(today),
  },
  {
    id: 'm3',
    entry_date: iso(addDays(monday, 2)),
    project_id: 'p-preston',
    description: 'Rollers, masking tape, drop sheets',
    cost: 92.5,
    supplier: 'Bunnings',
    scope_id: null,
    created_by: DEMO_MANAGER_ID,
    ai_source_id: null,
    created_at: iso(today),
  },
];

export const DEMO_VOICE_LOGS: VoiceLog[] = [];
export const DEMO_WEEK_LOCKS: WeekLock[] = [];
