import { describe, expect, it } from 'vitest';
import {
  computeProjectTotals,
  computeScopeTotals,
  computeTaskBenchmarks,
  computeWeeklyPnL,
  computeWorkerWeek,
} from './aggregations';
import type {
  MaterialEntry,
  Project,
  ProjectScope,
  ProjectVariation,
  TimeEntry,
  Worker,
} from '@/types/db';

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
  { id: 't1', entry_date: '2026-04-20', worker_id: 'w1', project_id: 'p1', hours: 10, task: null, notes: null, scope_id: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
  { id: 't2', entry_date: '2026-04-20', worker_id: 'w2', project_id: 'p1', hours: 8,  task: null, notes: null, scope_id: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
];

const me: MaterialEntry[] = [
  { id: 'm1', entry_date: '2026-04-20', project_id: 'p1', scope_id: null, description: 'Paint', cost: 500, supplier: null, created_by: 'u', ai_source_id: null, created_at: now },
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

describe('Project scopes', () => {
  const scopes: ProjectScope[] = [
    { id: 'sc-ext', project_id: 'p1', name: 'Exterior', quoted_price: 5000, quoted_hours: 50, materials_budget: 800, target_profit: 1000, status: 'active', order_index: 0, notes: null, created_at: now, updated_at: now },
    { id: 'sc-int', project_id: 'p1', name: 'Interior', quoted_price: 8000, quoted_hours: 70, materials_budget: 1200, target_profit: 1500, status: 'active', order_index: 1, notes: null, created_at: now, updated_at: now },
    { id: 'sc-other', project_id: 'other', name: 'Wrong project', quoted_price: 9999, quoted_hours: null, materials_budget: null, target_profit: null, status: 'active', order_index: 0, notes: null, created_at: now, updated_at: now },
  ];

  const scopedTE: TimeEntry[] = [
    // Jerry 10h on Exterior, Gavin 8h on Interior — same totals as the base fixture.
    { ...te[0], scope_id: 'sc-ext' },
    { ...te[1], scope_id: 'sc-int' },
  ];

  it('project total quote = Σ scope quoted_prices when scopes exist', () => {
    const t = computeProjectTotals(project, scopedTE, me, workers, 0, [], scopes);
    // Σ for p1 only: 5000 + 8000 = 13000
    expect(t.totalQuote).toBe(13000);
  });

  it('project.quoted_price is ignored once scopes exist', () => {
    // project.quoted_price is 10000 in the fixture; scope-rollup should override.
    const t = computeProjectTotals(project, scopedTE, me, workers, 0, [], scopes);
    expect(t.totalQuote).toBe(13000);
    expect(t.totalQuote).not.toBe(10000);
  });

  it('falls back to project.quoted_price when no scopes', () => {
    const t = computeProjectTotals(project, te, me, workers, 0, [], []);
    expect(t.totalQuote).toBe(10000);
  });

  it('computeScopeTotals filters entries by scope_id', () => {
    const ext = computeScopeTotals(scopes[0], scopedTE, me, workers);
    // Exterior: Jerry 10h × 30 = 300 labour cost, × 65 = 650 revenue, no materials in scope (m1 has scope_id=null)
    expect(ext.labourHours).toBe(10);
    expect(ext.labourCost).toBe(300);
    expect(ext.labourRevenue).toBe(650);
    expect(ext.materialCost).toBe(0);
    // quoted 5000 − 300 labour − 0 mat = 4700
    expect(ext.quoteProfit).toBe(4700);
    // hours used: 10/50 = 20%
    expect(ext.hoursUsedPct).toBe(20);
  });

  it('computeScopeTotals returns null quoteProfit when scope is unquoted', () => {
    const unquoted: ProjectScope = { ...scopes[0], quoted_price: null };
    const t = computeScopeTotals(unquoted, scopedTE, me, workers);
    expect(t.quoteProfit).toBe(null);
    // projectedProfit still computes (revenue − labour − materials).
    expect(t.projectedProfit).toBe(650 - 300 - 0);
  });
});

describe('computeWorkerWeek — cost includes weekly_wage when worker logged hours', () => {
  const weekEntries: TimeEntry[] = [
    ...te,
    // Pierce logs 20h on p1
    { id: 't3', entry_date: '2026-04-20', worker_id: 'w3', project_id: 'p1', hours: 20, task: null, notes: null, scope_id: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
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
      { id: 't3', entry_date: '2026-04-20', worker_id: 'w3', project_id: 'p1', hours: 20, task: null, notes: null, scope_id: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
      { id: 't4', entry_date: '2026-04-21', worker_id: 'w4', project_id: 'p1', hours: 5,  task: null, notes: null, scope_id: null, created_by: 'u', ai_source_id: null, created_at: now, updated_at: now },
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

describe('computeTaskBenchmarks — how long tasks generally take', () => {
  const mk = (id: string, hours: number, task: string | null): TimeEntry => ({
    id,
    entry_date: '2026-04-20',
    worker_id: 'w1',
    project_id: 'p1',
    hours,
    task,
    notes: null,
    scope_id: null,
    created_by: 'u',
    ai_source_id: null,
    created_at: now,
    updated_at: now,
  });

  it('groups by task and reports count/total/avg/min/max', () => {
    const rows = computeTaskBenchmarks([
      mk('a', 2, 'Sanding windows'),
      mk('b', 4, 'Sanding windows'),
      mk('c', 3, 'Sanding windows'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      task: 'Sanding windows',
      count: 3,
      totalHours: 9,
      avgHours: 3,
      minHours: 2,
      maxHours: 4,
    });
  });

  it('folds case + plural variants into one task, keeping the most-used spelling', () => {
    const rows = computeTaskBenchmarks([
      mk('a', 2, 'Sanding windows'),
      mk('b', 3, 'Sanding windows'),
      mk('c', 2.5, 'sanding window'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].task).toBe('Sanding windows'); // modal spelling
    expect(rows[0].count).toBe(3);
  });

  it('skips entries with no task label', () => {
    const rows = computeTaskBenchmarks([
      mk('a', 5, null),
      mk('b', 5, '   '),
      mk('c', 2, 'Gap filling skirts'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].task).toBe('Gap filling skirts');
  });

  it('sorts by sample size (count) descending', () => {
    const rows = computeTaskBenchmarks([
      mk('a', 1, 'Ceilings'),
      mk('b', 1, 'Ceilings'),
      mk('c', 1, 'Trims'),
    ]);
    expect(rows.map((r) => r.task)).toEqual(['Ceilings', 'Trims']);
  });

  it('breaks count ties by total hours (higher first)', () => {
    const rows = computeTaskBenchmarks([
      mk('a', 2, 'Ceilings'),
      mk('b', 3, 'Ceilings'), // count 2, total 5
      mk('c', 1, 'Trims'),
      mk('d', 1, 'Trims'), // count 2, total 2
    ]);
    expect(rows.map((r) => r.task)).toEqual(['Ceilings', 'Trims']);
  });
});
