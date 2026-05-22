import { describe, expect, it } from 'vitest';
import { computeProjectTotals, computeWorkerWeek } from './aggregations';
import type { MaterialEntry, Project, TimeEntry, Worker } from '@/types/db';

const now = '2026-04-21T00:00:00Z';

const workers: Worker[] = [
  { id: 'w1', name: 'Jerry', hourly_rate: 55, active: true, created_at: now },
  { id: 'w2', name: 'Pierce', hourly_rate: 50, active: true, created_at: now },
];

const project: Project = {
  id: 'p1',
  name: 'Northcote',
  client_name: null,
  address: null,
  quoted_price: 10000,
  quoted_hours: 100,
  materials_budget: 2000,
  daily_hours_warning: null,
  status: 'active',
  color_tag: null,
  start_date: null,
  end_date: null,
  notes: null,
  created_at: now,
  updated_at: now,
};

const te: TimeEntry[] = [
  {
    id: 't1',
    entry_date: '2026-04-20',
    worker_id: 'w1',
    project_id: 'p1',
    hours: 10,
    task: null,
    notes: null,
    created_by: 'u',
    ai_source_id: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: 't2',
    entry_date: '2026-04-20',
    worker_id: 'w2',
    project_id: 'p1',
    hours: 8,
    task: null,
    notes: null,
    created_by: 'u',
    ai_source_id: null,
    created_at: now,
    updated_at: now,
  },
];

const me: MaterialEntry[] = [
  {
    id: 'm1',
    entry_date: '2026-04-20',
    project_id: 'p1',
    description: 'Paint',
    cost: 500,
    supplier: null,
    created_by: 'u',
    ai_source_id: null,
    created_at: now,
  },
];

describe('computeProjectTotals', () => {
  it('aggregates hours and cost', () => {
    const t = computeProjectTotals(project, te, me, workers);
    expect(t.labourHours).toBe(18);
    expect(t.labourCost).toBe(10 * 55 + 8 * 50); // 950
    expect(t.materialCost).toBe(500);
  });

  it('computes profit and percentages', () => {
    const t = computeProjectTotals(project, te, me, workers);
    // quoted 10000 - labour 950 - materials 500 = 8550
    expect(t.profit).toBe(8550);
    expect(t.profitPercent).toBeCloseTo(85.5, 1);
    expect(t.hoursUsedPct).toBe(18);
    expect(t.materialsUsedPct).toBe(25);
  });

  it('applies overhead when provided', () => {
    const t = computeProjectTotals(project, te, me, workers, 20);
    // 20% overhead on 1450 = 290, total 1740
    expect(t.totalCost).toBe(1740);
    expect(t.profit).toBe(10000 - 1740);
  });
});

describe('computeWorkerWeek', () => {
  it('splits hours and cost by worker', () => {
    const rows = computeWorkerWeek(te, workers);
    const jerry = rows.find((r) => r.worker.id === 'w1')!;
    expect(jerry.totalHours).toBe(10);
    expect(jerry.totalCost).toBe(550);
  });
});
