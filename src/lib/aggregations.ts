import type { MaterialEntry, Project, TimeEntry, Worker } from '@/types/db';

export interface ProjectTotals {
  labourHours: number;
  labourCost: number;
  materialCost: number;
  totalCost: number;
  profit: number | null;
  profitPercent: number | null;
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
  const rateById = new Map(workers.map((w) => [w.id, w.hourly_rate]));
  const projectTE = timeEntries.filter((t) => t.project_id === project.id);
  const projectME = materialEntries.filter((m) => m.project_id === project.id);

  const labourHours = projectTE.reduce((s, t) => s + Number(t.hours), 0);
  const labourCost = projectTE.reduce(
    (s, t) => s + Number(t.hours) * Number(rateById.get(t.worker_id) ?? 0),
    0,
  );
  const materialCost = projectME.reduce((s, m) => s + Number(m.cost), 0);
  const overhead = (labourCost + materialCost) * (overheadPercent / 100);
  const totalCost = labourCost + materialCost + overhead;

  const quoted = project.quoted_price ?? null;
  const profit = quoted != null ? quoted - totalCost : null;
  const profitPercent = quoted != null && quoted > 0 ? (profit! / quoted) * 100 : null;

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
    materialCost: round2(materialCost),
    totalCost: round2(totalCost),
    profit: profit != null ? round2(profit) : null,
    profitPercent: profitPercent != null ? round2(profitPercent) : null,
    hoursUsedPct: hoursUsedPct != null ? round2(hoursUsedPct) : null,
    materialsUsedPct: materialsUsedPct != null ? round2(materialsUsedPct) : null,
  };
}

export interface WorkerWeekRow {
  worker: Worker;
  totalHours: number;
  totalCost: number;
  byProject: Array<{ projectId: string; hours: number; cost: number }>;
}

export function computeWorkerWeek(
  weekEntries: TimeEntry[],
  workers: Worker[],
): WorkerWeekRow[] {
  return workers
    .filter((w) => w.active || weekEntries.some((e) => e.worker_id === w.id))
    .map((w) => {
      const entries = weekEntries.filter((e) => e.worker_id === w.id);
      const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
      const totalCost = totalHours * Number(w.hourly_rate);
      const byProjectMap = new Map<string, { hours: number; cost: number }>();
      entries.forEach((e) => {
        const prev = byProjectMap.get(e.project_id) ?? { hours: 0, cost: 0 };
        prev.hours += Number(e.hours);
        prev.cost += Number(e.hours) * Number(w.hourly_rate);
        byProjectMap.set(e.project_id, prev);
      });
      return {
        worker: w,
        totalHours: round2(totalHours),
        totalCost: round2(totalCost),
        byProject: Array.from(byProjectMap.entries()).map(([projectId, v]) => ({
          projectId,
          hours: round2(v.hours),
          cost: round2(v.cost),
        })),
      };
    });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
