import type {
  MaterialEntry,
  Project,
  ProjectScope,
  ProjectVariation,
  TimeEntry,
  Worker,
} from '@/types/db';
import { cleanTask, mostFrequent, taskKey } from './tasks';

// =============================================================================
// Per-project totals (used on ProjectDetail + Reports breakdown)
// =============================================================================

export interface ProjectTotals {
  /** Every hour on the job — base scope + variations. Payroll's view. */
  labourHours: number;
  /**
   * Hours against the original quote (entries with no `variation_id`). This is
   * what the quoted-hours progress bar measures: a job that grew because the
   * client added work shouldn't read as a job that's blowing its budget.
   */
  baseLabourHours: number;
  /** Hours against client variations — extra work, billed on top of the quote. */
  variationLabourHours: number;
  /** Internal labour cost: Σ (hours × worker.cost_rate). */
  labourCost: number;
  /** What we'd bill at charge-out rates: Σ (hours × worker.charge_out_rate). */
  labourRevenue: number;
  materialCost: number;
  totalCost: number;
  /** Σ (approved variation amounts) — extra scope client signed off. */
  approvedVariations: number;
  /** base quote + approvedVariations. null if no quote. */
  totalQuote: number | null;
  /** Profit vs totalQuote. null if not quoted. */
  profit: number | null;
  profitPercent: number | null;
  /**
   * Profit-so-far vs target_profit. Health buckets give the admin a quick
   * traffic-light read on whether the job is tracking to plan.
   */
  projectedProfit: number | null;
  targetProfit: number | null;
  /**
   * `on_track` (>= target), `at_risk` (within 10% under), `over_budget`
   * (more than 10% under target), or `null` when target isn't set.
   */
  profitHealth: 'on_track' | 'at_risk' | 'over_budget' | null;
  hoursUsedPct: number | null;
  materialsUsedPct: number | null;
}

export function computeProjectTotals(
  project: Project,
  timeEntries: TimeEntry[],
  materialEntries: MaterialEntry[],
  workers: Worker[],
  overheadPercent = 0,
  variations: ProjectVariation[] = [],
  scopes: ProjectScope[] = [],
): ProjectTotals {
  const costRateById = new Map(workers.map((w) => [w.id, Number(w.cost_rate ?? 0)]));
  const chargeRateById = new Map(workers.map((w) => [w.id, Number(w.charge_out_rate ?? 0)]));
  const projectTE = timeEntries.filter((t) => t.project_id === project.id);
  const projectME = materialEntries.filter((m) => m.project_id === project.id);

  const labourHours = projectTE.reduce((s, t) => s + Number(t.hours), 0);
  const baseLabourHours = projectTE
    .filter((t) => t.variation_id == null)
    .reduce((s, t) => s + Number(t.hours), 0);
  const variationLabourHours = labourHours - baseLabourHours;
  const labourCost = projectTE.reduce(
    (s, t) => s + Number(t.hours) * (costRateById.get(t.worker_id) ?? 0),
    0,
  );
  const labourRevenue = projectTE.reduce(
    (s, t) => s + Number(t.hours) * (chargeRateById.get(t.worker_id) ?? 0),
    0,
  );
  const materialCost = projectME.reduce((s, m) => s + Number(m.cost), 0);
  const overhead = (labourCost + materialCost) * (overheadPercent / 100);
  const totalCost = labourCost + materialCost + overhead;

  // Approved variations roll into the total quote — extra scope that's
  // been signed off by the client gets added to what we'll bill.
  const approvedVariations = variations
    .filter((v) => v.project_id === project.id && v.status === 'approved')
    .reduce((s, v) => s + Number(v.amount ?? 0), 0);

  // Base quote = Σ scope quoted_prices if scopes exist (multi-area project),
  // else the legacy project.quoted_price field. This means once Alex
  // adds scopes to a project, the per-scope quotes become the source of
  // truth; project.quoted_price is effectively ignored for math.
  const scopeQuoteSum = scopes
    .filter((s) => s.project_id === project.id)
    .reduce((sum, sc) => sum + (sc.quoted_price != null ? Number(sc.quoted_price) : 0), 0);
  const hasScopeQuotes =
    scopes.some((s) => s.project_id === project.id && s.quoted_price != null);
  const baseQuote = hasScopeQuotes ? scopeQuoteSum : project.quoted_price ?? null;
  const totalQuote = baseQuote != null ? baseQuote + approvedVariations : null;
  const profit = totalQuote != null ? totalQuote - totalCost : null;
  const profitPercent =
    totalQuote != null && totalQuote > 0 ? (profit! / totalQuote) * 100 : null;

  // Projected profit = revenue we'd bill on hours-so-far minus our actual
  // cost (labour + materials). When target_profit is set, we bucket
  // health against it.
  const projectedProfit = labourRevenue - totalCost;
  const targetProfit = project.target_profit ?? null;
  let profitHealth: ProjectTotals['profitHealth'] = null;
  if (targetProfit != null && targetProfit > 0) {
    const ratio = projectedProfit / targetProfit;
    profitHealth = ratio >= 1 ? 'on_track' : ratio >= 0.9 ? 'at_risk' : 'over_budget';
  } else if (targetProfit != null && targetProfit === 0) {
    // target=0 → just check if we're not in the red
    profitHealth = projectedProfit >= 0 ? 'on_track' : 'over_budget';
  }

  // Base hours only — variation work is billed on top of the quote, so
  // counting it here would make a job that grew look like a job that's late.
  const hoursUsedPct =
    project.quoted_hours && project.quoted_hours > 0
      ? (baseLabourHours / project.quoted_hours) * 100
      : null;
  const materialsUsedPct =
    project.materials_budget && project.materials_budget > 0
      ? (materialCost / project.materials_budget) * 100
      : null;

  return {
    labourHours: round2(labourHours),
    baseLabourHours: round2(baseLabourHours),
    variationLabourHours: round2(variationLabourHours),
    labourCost: round2(labourCost),
    labourRevenue: round2(labourRevenue),
    materialCost: round2(materialCost),
    totalCost: round2(totalCost),
    approvedVariations: round2(approvedVariations),
    totalQuote: totalQuote != null ? round2(totalQuote) : null,
    profit: profit != null ? round2(profit) : null,
    profitPercent: profitPercent != null ? round2(profitPercent) : null,
    projectedProfit: round2(projectedProfit),
    targetProfit: targetProfit != null ? round2(targetProfit) : null,
    profitHealth,
    hoursUsedPct: hoursUsedPct != null ? round2(hoursUsedPct) : null,
    materialsUsedPct: materialsUsedPct != null ? round2(materialsUsedPct) : null,
  };
}

// =============================================================================
// Per-worker week (used in Reports + Payroll CSV math)
// =============================================================================

export interface WorkerWeekRow {
  worker: Worker;
  totalHours: number;
  /** Internal cost for the week: hours × cost_rate + (optional) weekly_wage. */
  totalCost: number;
  /** What we'd bill if every hour invoiced at charge_out_rate. */
  totalRevenue: number;
  byProject: Array<{ projectId: string; hours: number; cost: number; revenue: number }>;
}

export function computeWorkerWeek(
  weekEntries: TimeEntry[],
  workers: Worker[],
): WorkerWeekRow[] {
  return workers
    .filter((w) => w.active || weekEntries.some((e) => e.worker_id === w.id))
    .map((w) => {
      const cost = Number(w.cost_rate ?? 0);
      const charge = Number(w.charge_out_rate ?? 0);
      const weekly = Number(w.weekly_wage ?? 0);
      const entries = weekEntries.filter((e) => e.worker_id === w.id);
      const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
      // Weekly wage is a fixed cost; counted once per worker per week,
      // not per hour. Hourly cost is on top.
      const totalCost = totalHours * cost + weekly;
      const totalRevenue = totalHours * charge;
      const byProjectMap = new Map<string, { hours: number; cost: number; revenue: number }>();
      entries.forEach((e) => {
        const prev = byProjectMap.get(e.project_id) ?? { hours: 0, cost: 0, revenue: 0 };
        prev.hours += Number(e.hours);
        prev.cost += Number(e.hours) * cost;
        prev.revenue += Number(e.hours) * charge;
        byProjectMap.set(e.project_id, prev);
      });
      return {
        worker: w,
        totalHours: round2(totalHours),
        totalCost: round2(totalCost),
        totalRevenue: round2(totalRevenue),
        byProject: Array.from(byProjectMap.entries()).map(([projectId, v]) => ({
          projectId,
          hours: round2(v.hours),
          cost: round2(v.cost),
          revenue: round2(v.revenue),
        })),
      };
    });
}

// =============================================================================
// Weekly team P&L (used on Admin dashboard)
// =============================================================================

export interface WeeklyPnL {
  /** Σ (hours × charge_out_rate) across all workers. */
  revenue: number;
  /** Σ (hours × cost_rate) for hourly crew. */
  hourlyLabourCost: number;
  /** Σ (weekly_wage) — owner draw + apprentice stipend, fired once per week. */
  fixedWeeklyWages: number;
  /** hourlyLabourCost + fixedWeeklyWages. */
  totalLabourCost: number;
  /** Σ (material_entries.cost) for the week. */
  materialCost: number;
  /** revenue − totalLabourCost − materialCost. */
  profit: number;
  /** profit / revenue × 100; null if no revenue. */
  marginPercent: number | null;
}

export function computeWeeklyPnL(
  weekEntries: TimeEntry[],
  weekMaterials: MaterialEntry[],
  workers: Worker[],
): WeeklyPnL {
  const costRateById = new Map(workers.map((w) => [w.id, Number(w.cost_rate ?? 0)]));
  const chargeRateById = new Map(workers.map((w) => [w.id, Number(w.charge_out_rate ?? 0)]));

  const revenue = weekEntries.reduce(
    (s, e) => s + Number(e.hours) * (chargeRateById.get(e.worker_id) ?? 0),
    0,
  );
  const hourlyLabourCost = weekEntries.reduce(
    (s, e) => s + Number(e.hours) * (costRateById.get(e.worker_id) ?? 0),
    0,
  );
  // Charge a worker's fixed weekly wage IF they logged any hours that week.
  // Otherwise (e.g. on leave) we don't deduct — they're not earning that week.
  // (Owner draw could be argued to apply regardless, but the simpler model is
  // "if Alex didn't log a single hour this week, we don't charge $1250 to
  // this week's P&L"; he'd accrue it instead.)
  const workersWhoLogged = new Set(weekEntries.map((e) => e.worker_id));
  const fixedWeeklyWages = workers
    .filter((w) => workersWhoLogged.has(w.id))
    .reduce((s, w) => s + Number(w.weekly_wage ?? 0), 0);
  const totalLabourCost = hourlyLabourCost + fixedWeeklyWages;
  const materialCost = weekMaterials.reduce((s, m) => s + Number(m.cost), 0);
  const profit = revenue - totalLabourCost - materialCost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : null;

  return {
    revenue: round2(revenue),
    hourlyLabourCost: round2(hourlyLabourCost),
    fixedWeeklyWages: round2(fixedWeeklyWages),
    totalLabourCost: round2(totalLabourCost),
    materialCost: round2(materialCost),
    profit: round2(profit),
    marginPercent: marginPercent != null ? round2(marginPercent) : null,
  };
}

// =============================================================================
// Per-scope rollup (used inside ProjectDetail's Scopes section)
// =============================================================================

export interface ScopeTotals {
  labourHours: number;
  labourCost: number;
  labourRevenue: number;
  materialCost: number;
  /** Internal-cost-vs-charge-out profit so far, ignoring quote. */
  projectedProfit: number;
  /** Quote − costs (null when scope unquoted). */
  quoteProfit: number | null;
  hoursUsedPct: number | null;
}

export function computeScopeTotals(
  scope: ProjectScope,
  timeEntries: TimeEntry[],
  materialEntries: MaterialEntry[],
  workers: Worker[],
): ScopeTotals {
  const costRateById = new Map(workers.map((w) => [w.id, Number(w.cost_rate ?? 0)]));
  const chargeRateById = new Map(workers.map((w) => [w.id, Number(w.charge_out_rate ?? 0)]));
  const scopeTE = timeEntries.filter((t) => t.scope_id === scope.id);
  const scopeME = materialEntries.filter((m) => m.scope_id === scope.id);

  const labourHours = scopeTE.reduce((s, t) => s + Number(t.hours), 0);
  const labourCost = scopeTE.reduce(
    (s, t) => s + Number(t.hours) * (costRateById.get(t.worker_id) ?? 0),
    0,
  );
  const labourRevenue = scopeTE.reduce(
    (s, t) => s + Number(t.hours) * (chargeRateById.get(t.worker_id) ?? 0),
    0,
  );
  const materialCost = scopeME.reduce((s, m) => s + Number(m.cost), 0);

  const projectedProfit = labourRevenue - labourCost - materialCost;
  const quoteProfit =
    scope.quoted_price != null ? Number(scope.quoted_price) - labourCost - materialCost : null;
  const hoursUsedPct =
    scope.quoted_hours && scope.quoted_hours > 0
      ? (labourHours / Number(scope.quoted_hours)) * 100
      : null;

  return {
    labourHours: round2(labourHours),
    labourCost: round2(labourCost),
    labourRevenue: round2(labourRevenue),
    materialCost: round2(materialCost),
    projectedProfit: round2(projectedProfit),
    quoteProfit: quoteProfit != null ? round2(quoteProfit) : null,
    hoursUsedPct: hoursUsedPct != null ? round2(hoursUsedPct) : null,
  };
}

// =============================================================================
// Per-variation rollup (used inside ProjectDetail's Variations section)
// =============================================================================

/**
 * One line of work done against a variation — the itemised record Alex needs
 * to price and invoice it: who, what day, how long, and what they did.
 */
export interface VariationLine {
  id: string;
  date: string;
  workerId: string;
  workerName: string;
  task: string | null;
  notes: string | null;
  hours: number;
  /** hours × cost_rate. Admin-only in the UI. */
  cost: number;
  /** hours × charge_out_rate — what this line is worth billed out. Admin-only. */
  revenue: number;
}

export interface VariationTotals {
  labourHours: number;
  labourCost: number;
  labourRevenue: number;
  materialCost: number;
  /** Date-sorted labour lines — the ledger rendered on screen and exported. */
  lines: VariationLine[];
  /** Material purchases tagged to this variation, oldest first. */
  materials: MaterialEntry[];
}

/**
 * Roll up everything logged against one variation. Mirrors computeScopeTotals,
 * but also returns the individual lines — a variation's whole point is the
 * itemised "who did what, when" record, not just a total.
 */
export function computeVariationTotals(
  variation: ProjectVariation,
  timeEntries: TimeEntry[],
  materialEntries: MaterialEntry[],
  workers: Worker[],
): VariationTotals {
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const varTE = timeEntries.filter((t) => t.variation_id === variation.id);
  const varME = materialEntries
    .filter((m) => m.variation_id === variation.id)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const lines: VariationLine[] = varTE
    .map((t) => {
      const w = workerById.get(t.worker_id);
      const hours = Number(t.hours);
      return {
        id: t.id,
        date: t.entry_date,
        workerId: t.worker_id,
        workerName: w?.name ?? '—',
        task: t.task,
        notes: t.notes,
        hours: round2(hours),
        cost: round2(hours * Number(w?.cost_rate ?? 0)),
        revenue: round2(hours * Number(w?.charge_out_rate ?? 0)),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.workerName.localeCompare(b.workerName));

  return {
    labourHours: round2(lines.reduce((s, l) => s + l.hours, 0)),
    labourCost: round2(lines.reduce((s, l) => s + l.cost, 0)),
    labourRevenue: round2(lines.reduce((s, l) => s + l.revenue, 0)),
    materialCost: round2(varME.reduce((s, m) => s + Number(m.cost), 0)),
    lines,
    materials: varME,
  };
}

export interface UnbilledVariationWork {
  /** How many variations have work logged but aren't approved yet. */
  variationCount: number;
  labourHours: number;
  materialCost: number;
  /** What the unbilled hours are worth at charge-out. Admin-only in the UI. */
  labourRevenue: number;
  /** True when any of it sits on a variation Alex hasn't put a price on yet. */
  hasUnpriced: boolean;
}

/**
 * Work the crew has already done against variations that aren't approved yet —
 * either still unpriced, or priced but awaiting client sign-off. Until a
 * variation is approved it isn't in the quote, so this is labour and materials
 * spent with nothing billed against them. Surfaced prominently because it's the
 * easiest money on a job to lose track of.
 *
 * Rejected variations are excluded — that work is never going to be billed, so
 * it's a different (and worse) problem, flagged on the variation row itself.
 */
export function computeUnbilledVariationWork(
  variations: ProjectVariation[],
  timeEntries: TimeEntry[],
  materialEntries: MaterialEntry[],
  workers: Worker[],
): UnbilledVariationWork {
  const pending = variations.filter((v) => v.status === 'pending');
  let variationCount = 0;
  let labourHours = 0;
  let materialCost = 0;
  let labourRevenue = 0;
  let hasUnpriced = false;

  for (const v of pending) {
    const t = computeVariationTotals(v, timeEntries, materialEntries, workers);
    if (t.labourHours === 0 && t.materialCost === 0) continue;
    variationCount += 1;
    labourHours += t.labourHours;
    materialCost += t.materialCost;
    labourRevenue += t.labourRevenue;
    if (v.amount == null) hasUnpriced = true;
  }

  return {
    variationCount,
    labourHours: round2(labourHours),
    materialCost: round2(materialCost),
    labourRevenue: round2(labourRevenue),
    hasUnpriced,
  };
}

// =============================================================================
// Task-time benchmarks (used on Reports → "Task times")
// =============================================================================

export interface TaskBenchmark {
  /** Display label — the most-frequent spelling logged for this task. */
  task: string;
  /** How many time entries carry this task (the sample size). */
  count: number;
  totalHours: number;
  avgHours: number;
  minHours: number;
  maxHours: number;
}

/**
 * "How long does <task> generally take." Groups every time entry by a
 * normalized task key (so "Sanding windows" / "sand window" fold together) and
 * reports count + total/avg/min/max hours per task. Entries with no task label
 * are skipped. Sorted by count desc — best-sampled tasks first.
 */
export function computeTaskBenchmarks(timeEntries: TimeEntry[]): TaskBenchmark[] {
  const groups = new Map<string, { spellings: Map<string, number>; hours: number[] }>();
  for (const e of timeEntries) {
    const label = cleanTask(e.task);
    if (!label) continue;
    const key = taskKey(label);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), hours: [] };
    g.spellings.set(label, (g.spellings.get(label) ?? 0) + 1);
    g.hours.push(Number(e.hours));
    groups.set(key, g);
  }
  const rows: TaskBenchmark[] = [];
  for (const g of groups.values()) {
    const total = g.hours.reduce((s, h) => s + h, 0);
    rows.push({
      task: mostFrequent(g.spellings),
      count: g.hours.length,
      totalHours: round2(total),
      avgHours: round2(total / g.hours.length),
      minHours: round2(Math.min(...g.hours)),
      maxHours: round2(Math.max(...g.hours)),
    });
  }
  return rows.sort((a, b) => b.count - a.count || b.totalHours - a.totalHours);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
