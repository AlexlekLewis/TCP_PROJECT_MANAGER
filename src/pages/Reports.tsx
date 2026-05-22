import { useMemo, useState } from 'react';
import { addWeeks, format, parseISO, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTimeEntriesForWeek } from '@/hooks/useTimeEntries';
import { useMaterialEntries } from '@/hooks/useMaterialEntries';
import { useWorkers } from '@/hooks/useWorkers';
import { useProjects } from '@/hooks/useProjects';
import { useLockWeek, useUnlockWeek, useWeekLocks } from '@/hooks/useWeekLocks';
import { computeWorkerWeek } from '@/lib/aggregations';
import { formatCurrency } from '@/lib/currency';
import { formatHours } from '@/lib/hours';
import { toISODate, weekEnd, weekLabel, weekStart } from '@/lib/dates';
import { downloadCSV, toCSV } from '@/lib/csv';
import { useAuth } from '@/context/AuthContext';
import { useCanSeeFinancials } from '@/lib/permissions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const startIso = toISODate(weekStart(anchor));
  const endIso = toISODate(weekEnd(anchor));

  const { data: entries = [] } = useTimeEntriesForWeek(anchor);
  const { data: allMaterials = [] } = useMaterialEntries();
  const { data: workers = [] } = useWorkers();
  const { data: projects = [] } = useProjects();
  const { data: locks = [] } = useWeekLocks();
  const lockWeek = useLockWeek();
  const unlockWeek = useUnlockWeek();
  const { role } = useAuth();
  const canSeeFinancials = useCanSeeFinancials();

  const isLocked = locks.some((l) => l.week_start === startIso);
  const materialsThisWeek = allMaterials.filter(
    (m) => m.entry_date >= startIso && m.entry_date <= endIso,
  );

  const workerRows = useMemo(() => computeWorkerWeek(entries, workers), [entries, workers]);
  const projectRows = useMemo(() => {
    const rateById = new Map(workers.map((w) => [w.id, w.hourly_rate]));
    return projects
      .map((p) => {
        const te = entries.filter((t) => t.project_id === p.id);
        const hours = te.reduce((s, e) => s + Number(e.hours), 0);
        const labour = te.reduce(
          (s, e) => s + Number(e.hours) * Number(rateById.get(e.worker_id) ?? 0),
          0,
        );
        const mats = materialsThisWeek
          .filter((m) => m.project_id === p.id)
          .reduce((s, m) => s + Number(m.cost), 0);
        return { project: p, hours, labour, mats };
      })
      .filter((r) => r.hours > 0 || r.mats > 0);
  }, [entries, projects, materialsThisWeek, workers]);

  const weekTotalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const weekTotalLabour = workerRows.reduce((s, w) => s + w.totalCost, 0);
  const weekTotalMats = materialsThisWeek.reduce((s, m) => s + Number(m.cost), 0);

  const exportPayrollCSV = () => {
    const workerById = new Map(workers.map((w) => [w.id, w]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const rows = entries.map((e) => {
      const w = workerById.get(e.worker_id);
      const p = projectById.get(e.project_id);
      const rate = Number(w?.hourly_rate ?? 0);
      return {
        date: e.entry_date,
        worker: w?.name ?? '',
        project: p?.name ?? '',
        hours: Number(e.hours).toFixed(2),
        rate: rate.toFixed(2),
        amount: (Number(e.hours) * rate).toFixed(2),
        notes: e.notes ?? '',
      };
    });
    const csv = toCSV(rows, ['date', 'worker', 'project', 'hours', 'rate', 'amount', 'notes']);
    downloadCSV(`payroll-${startIso}.csv`, csv);
    toast.success('Payroll CSV downloaded');
  };

  const exportProjectsCSV = () => {
    const rows = projectRows.map((r) => ({
      project: r.project.name,
      client: r.project.client_name ?? '',
      hours: r.hours.toFixed(2),
      labour_cost: r.labour.toFixed(2),
      material_cost: r.mats.toFixed(2),
      total: (r.labour + r.mats).toFixed(2),
    }));
    const csv = toCSV(rows, ['project', 'client', 'hours', 'labour_cost', 'material_cost', 'total']);
    downloadCSV(`projects-${startIso}.csv`, csv);
    toast.success('Projects CSV downloaded');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <Badge variant="secondary">{weekLabel(startIso)}</Badge>
        {isLocked && <Badge variant="warning"><Lock className="mr-1 h-3 w-3" />Locked</Badge>}
        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => subWeeks(d, 1))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            This week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor((d) => addWeeks(d, 1))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'grid gap-3',
          canSeeFinancials ? 'sm:grid-cols-3' : 'sm:grid-cols-1',
        )}
      >
        <SummaryCell label="Total hours" value={formatHours(weekTotalHours)} />
        {canSeeFinancials && (
          <>
            <SummaryCell
              label="Labour cost"
              value={formatCurrency(weekTotalLabour, { whole: true })}
            />
            <SummaryCell label="Materials" value={formatCurrency(weekTotalMats, { whole: true })} />
          </>
        )}
      </div>

      {/* Worker breakdown */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Per worker</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Worker</th>
                  <th className="px-4 py-2 text-right">Hours</th>
                  {canSeeFinancials && <th className="px-4 py-2 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {workerRows.map((r) => (
                  <tr key={r.worker.id}>
                    <td className="px-4 py-2 font-medium">{r.worker.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatHours(r.totalHours)}
                    </td>
                    {canSeeFinancials && (
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(r.totalCost, { whole: true })}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Project breakdown */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Per project</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-right">Hours</th>
                  {canSeeFinancials && (
                    <>
                      <th className="px-4 py-2 text-right">Labour</th>
                      <th className="px-4 py-2 text-right">Materials</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {projectRows.map((r) => (
                  <tr key={r.project.id}>
                    <td className="px-4 py-2 font-medium">{r.project.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatHours(r.hours)}</td>
                    {canSeeFinancials && (
                      <>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(r.labour, { whole: true })}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(r.mats, { whole: true })}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">
                          {formatCurrency(r.labour + r.mats, { whole: true })}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canSeeFinancials && (
          <>
            <Button variant="outline" onClick={exportPayrollCSV}>
              <Download className="h-4 w-4" /> Payroll CSV
            </Button>
            <Button variant="outline" onClick={exportProjectsCSV}>
              <Download className="h-4 w-4" /> Projects CSV
            </Button>
          </>
        )}
        {role === 'admin' && (
          <div className="ml-auto flex gap-2">
            {isLocked ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await unlockWeek.mutateAsync(startIso);
                  toast.success(`Week ${weekLabel(startIso)} unlocked`);
                }}
              >
                <Unlock className="h-4 w-4" /> Unlock week
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  await lockWeek.mutateAsync(startIso);
                  toast.success(`Week ${weekLabel(startIso)} locked`);
                }}
              >
                <Lock className="h-4 w-4" /> Lock week
              </Button>
            )}
          </div>
        )}
      </div>

      {entries.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No entries logged for {format(parseISO(startIso), 'MMM yyyy')}.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
