import type { MaterialEntry, Project, TimeEntry, Worker } from '@/types/db';

// =============================================================================
// Per-project totals (used on ProjectDetail + Reports breakdown)
// =============================================================================

export interface ProjectTotals {
  labourHours: number;
  /** Internal labour cost: Σ (hours × worker.cost_rate). */
  labourCost: number;
  /** What we'd bill at charge-out rates: Σ (hours × worker.charge_out_rate). */
  labourRevenue: number;
  materialCost: number;
  totalCost: number;
  /** Profit vs quoted_price (legacy). null if not quoted. */
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
): ProjectTotals {
  const costRateById = new Map(workers.map((w) => [w.id, Number(w.cost_rate ?? 0)]));
  const chargeRateById = new Map(workers.map((w) => [w.id, Number(w.charge_out_rate ?? 0)]));
  const projectTE = timeEntries.filter((t) => t.project_id === project.id);
  const projectME = materialEntries.filter((m) => m.project_id === project.id);

  const labourHours = projectTE.reduce((s, t) => s + Number(t.hours), 0);
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

  const quoted = project.quoted_price ?? null;
  const profit = quoted != null ? quoted - totalCost : null;
  const profitPercent = quoted != null && quoted > 0 ? (profit! / quoted) * 100 : null;

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

  const hoursUsedPct =
    project.quoted_hours && project.quoted_hours > 0
      ? (labourHours / project.quoted_hours) * 100
      : null;
  const materialsUsedPct =
    project.materials_budget && project.materials_budget > 0
      ? (materialCost / project.materials_budget) * 100
      : null;

  return {
    labourHours: round2(labourHours),
    labourCost: round2(labourCost),
    labourRevenue: round2(labourRevenue),
    materialCost: round2(materialCost),
    totalCost: round2(totalCost),
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
