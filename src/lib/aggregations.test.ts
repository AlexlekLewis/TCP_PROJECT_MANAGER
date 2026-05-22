import { describe, expect, it } from 'vitest';
import { computeProjectTotals, computeWeeklyPnL, computeWorkerWeek } from './aggregations';
import type { MaterialEntry, Project, ProjectVariation, TimeEntry, Worker } from '@/types/db';

const now = '2026-04-21T00:00:00Z';

const workers: Worker[] = [
  // Hourly crew
  { id: 'w1', name: 'Jerry',  cost_rate: 30, weekly_wage: 0,    charge_out_rate: 65, active: true, created_at: now },
  { id: 'w2', name: 'Gavin',  cost_rate: 50, weekly_wage: 0,    charge_out_rate: 65, active: true, created_at: now },
  // Apprentice: hourly cost + fixed weekly stipend
  { id: 'w3', name: 'Pierce', cost_rate: 35, weekly_wage: 900,  charge_out_rate: 65, active: true, created_at: now },
  // Owner: fixed-weekly only, no per-hour cost
  { id: 'w4', name: 'Alex',   cost_rate: 0,  weekly_wage: 1250, charge_out_rate: 65, active: true, created_at: now },
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
  target_profit: 3000,
  quote_type: 'fixed_quote',
  needs_admin_review: false,
  status: 'active',
  color_tag: null,
  start_date: null,
  end_date: null,
  notes: null,
  created_at: now,
  updated_at: now,
};

const te: TimeEntry[] = [
  { id: 't1', entry_date: '2026-04-20', worker_id: 'w1', project_id: 'p1', hours: 10, task: null, notes: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
  { id: 't2', entry_date: '2026-04-20', worker_id: 'w2', project_id: 'p1', hours: 8,  task: null, notes: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
];

const me: MaterialEntry[] = [
  { id: 'm1', entry_date: '2026-04-20', project_id: 'p1', description: 'Paint', cost: 500, supplier: null, created_by: 'u', ai_source_id: null, created_at: now },
];

describe('computeProjectTotals — cost + revenue + profit health', () => {
  it('aggregates hours and labour cost using cost_rate', () => {
    const t = computeProjectTotals(project, te, me, workers);
    expect(t.labourHours).toBe(18);
    // Jerry 10h × $30 + Gavin 8h × $50 = 300 + 400 = 700
    expect(t.labourCost).toBe(700);
    expect(t.materialCost).toBe(500);
  });

  it('computes labour revenue using charge_out_rate', () => {
    const t = computeProjectTotals(project, te, me, workers);
    // 18h × $65 = $1170
    expect(t.labourRevenue).toBe(1170);
  });

  it('computes projected profit vs target_profit', () => {
    const t = computeProjectTotals(project, te, me, workers);
    // revenue 1170 − labour 700 − materials 500 = −30
    expect(t.projectedProfit).toBe(-30);
    expect(t.targetProfit).toBe(3000);
    // −30 / 3000 = −0.01 → ratio < 0.9 → over_budget
    expect(t.profitHealth).toBe('over_budget');
  });

  it('marks on_track when projected meets/exceeds target', () => {
    const denseEntries: TimeEntry[] = [
      { ...te[0], hours: 100 },
      { ...te[1], hours: 100 },
    ];
    const t = computeProjectTotals(project, denseEntries, me, workers);
    // revenue 200h × 65 = 13000; cost = 100×30 + 100×50 + 500 = 8500; profit 4500 ≥ target 3000
    expect(t.profitHealth).toBe('on_track');
  });

  it('returns null health when target_profit unset', () => {
    const t = computeProjectTotals({ ...project, target_profit: null }, te, me, workers);
    expect(t.profitHealth).toBe(null);
  });

  it('keeps legacy quote-based profit math working', () => {
    const t = computeProjectTotals(project, te, me, workers);
    // quote 10000 − labour 700 − materials 500 = 8800
    expect(t.profit).toBe(8800);
    expect(t.totalQuote).toBe(10000);
    expect(t.approvedVariations).toBe(0);
  });
});

describe('computeProjectTotals — variations roll into total quote', () => {
  const variations: ProjectVariation[] = [
    { id: 'v1', project_id: 'p1', description: 'Extra bathroom', amount: 1500, status: 'approved',  notes: null, created_at: now, created_by: 'u', approved_at: now, approved_by: 'u' },
    { id: 'v2', project_id: 'p1', description: 'Pending request',  amount: 500,  status: 'pending',   notes: null, created_at: now, created_by: 'u', approved_at: null, approved_by: null },
    { id: 'v3', project_id: 'p1', description: 'Rejected change',  amount: 800,  status: 'rejected',  notes: null, created_at: now, created_by: 'u', approved_at: null, approved_by: null },
    { id: 'v4', project_id: 'other-project', description: 'Wrong project', amount: 9999, status: 'approved', notes: null, created_at: now, created_by: 'u', approved_at: now, approved_by: 'u' },
  ];

  it('only approved variations matching project_id add to the quote', () => {
    const t = computeProjectTotals(project, te, me, workers, 0, variations);
    expect(t.approvedVariations).toBe(1500);
    expect(t.totalQuote).toBe(11500); // base 10000 + 1500 approved
  });

  it('profit math uses total quote (base + variations)', () => {
    const t = computeProjectTotals(project, te, me, workers, 0, variations);
    // 11500 − 700 − 500 = 10300
    expect(t.profit).toBe(10300);
  });
});

describe('computeWorkerWeek — cost includes weekly_wage when worker logged hours', () => {
  const weekEntries: TimeEntry[] = [
    ...te,
    // Pierce logs 20h on p1
    { id: 't3', entry_date: '2026-04-20', worker_id: 'w3', project_id: 'p1', hours: 20, task: null, notes: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
  ];

  it('hourly worker: cost = hours × cost_rate', () => {
    const rows = computeWorkerWeek(weekEntries, workers);
    const jerry = rows.find((r) => r.worker.id === 'w1')!;
    expect(jerry.totalHours).toBe(10);
    expect(jerry.totalCost).toBe(300); // 10 × 30
    expect(jerry.totalRevenue).toBe(650); // 10 × 65
  });

  it('apprentice (hourly + fixed weekly): cost = hours × cost_rate + weekly_wage', () => {
    const rows = computeWorkerWeek(weekEntries, workers);
    const pierce = rows.find((r) => r.worker.id === 'w3')!;
    expect(pierce.totalHours).toBe(20);
    expect(pierce.totalCost).toBe(20 * 35 + 900); // 1600
    expect(pierce.totalRevenue).toBe(20 * 65); // 1300
  });
});

describe('computeWeeklyPnL — admin weekly P&L', () => {
  it('rolls up revenue, labour, materials, profit', () => {
    const weekEntries: TimeEntry[] = [
      ...te,
      { id: 't3', entry_date: '2026-04-20', worker_id: 'w3', project_id: 'p1', hours: 20, task: null, notes: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
      { id: 't4', entry_date: '2026-04-21', worker_id: 'w4', project_id: 'p1', hours: 5,  task: null, notes: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
    ];
    const p = computeWeeklyPnL(weekEntries, me, workers);

    // Hours: Jerry 10, Gavin 8, Pierce 20, Alex 5 = 43h total
    // Revenue: 43 × 65 = 2795
    expect(p.revenue).toBe(2795);
    // Hourly cost: 10×30 + 8×50 + 20×35 + 5×0 = 300+400+700+0 = 1400
    expect(p.hourlyLabourCost).toBe(1400);
    // Fixed weekly: Pierce 900 + Alex 1250 = 2150 (all 4 logged hours but Jerry+Gavin have 0)
    expect(p.fixedWeeklyWages).toBe(2150);
    expect(p.totalLabourCost).toBe(3550);
    expect(p.materialCost).toBe(500);
    // Profit: 2795 − 3550 − 500 = −1255
    expect(p.profit).toBe(-1255);
  });

  it('does not charge weekly_wage for workers who logged zero hours', () => {
    // Only Jerry worked. Alex's $1250 must NOT count this week.
    const onlyJerry: TimeEntry[] = [te[0]];
    const p = computeWeeklyPnL(onlyJerry, [], workers);
    expect(p.fixedWeeklyWages).toBe(0);
  });
});
