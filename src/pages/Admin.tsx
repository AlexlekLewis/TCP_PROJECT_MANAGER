import { useMemo, useState } from 'react';
import { Lock, Unlock, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useVoiceLogsDemo } from '@/hooks/useVoiceLogs';
import { useUnlockWeek, useWeekLocks } from '@/hooks/useWeekLocks';
import { useTimeEntriesForWeek } from '@/hooks/useTimeEntries';
import { useMaterialEntries } from '@/hooks/useMaterialEntries';
import { useWorkers } from '@/hooks/useWorkers';
import { computeWeeklyPnL, computeWorkerWeek } from '@/lib/aggregations';
import { formatCurrency } from '@/lib/currency';
import { formatHours } from '@/lib/hours';
import { toISODate, weekEnd, weekLabel, weekStart } from '@/lib/dates';
import { addWeeks, subWeeks } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function AdminPage() {
  const { data: locks = [] } = useWeekLocks();
  const { data: voiceLogs = [] } = useVoiceLogsDemo();
  const unlockWeek = useUnlockWeek();

  // Weekly P&L state
  const [anchor, setAnchor] = useState<Date>(new Date());
  const startIso = toISODate(weekStart(anchor));
  const endIso = toISODate(weekEnd(anchor));
  const { data: entries = [] } = useTimeEntriesForWeek(anchor);
  const { data: allMaterials = [] } = useMaterialEntries();
  const { data: workers = [] } = useWorkers();

  const weekMaterials = useMemo(
    () => allMaterials.filter((m) => m.entry_date >= startIso && m.entry_date <= endIso),
    [allMaterials, startIso, endIso],
  );
  const pnl = useMemo(
    () => computeWeeklyPnL(entries, weekMaterials, workers),
    [entries, weekMaterials, workers],
  );
  const workerRows = useMemo(() => computeWorkerWeek(entries, workers), [entries, workers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Weekly P&amp;L, week locks, voice-log audit.
        </p>
      </div>

      {/* Weekly team P&L */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Weekly team P&amp;L</h2>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => subWeeks(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {weekLabel(startIso)}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => addWeeks(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <PnLCell label="Revenue" value={formatCurrency(pnl.revenue, { whole: true })}
            sub={`${formatHours(workerRows.reduce((s, r) => s + r.totalHours, 0))} billed`} />
          <PnLCell
            label="Labour cost"
            value={formatCurrency(pnl.totalLabourCost, { whole: true })}
            sub={`${formatCurrency(pnl.hourlyLabourCost, { whole: true })} hourly + ${formatCurrency(pnl.fixedWeeklyWages, { whole: true })} fixed`}
          />
          <PnLCell label="Materials" value={formatCurrency(pnl.materialCost, { whole: true })} />
          <PnLCell
            label="Profit"
            value={formatCurrency(pnl.profit, { whole: true })}
            sub={pnl.marginPercent != null ? `${pnl.marginPercent.toFixed(0)}% margin` : undefined}
            tone={pnl.profit < 0 ? 'danger' : pnl.profit > 0 ? 'success' : 'muted'}
            icon={pnl.profit < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          />
        </div>

        {/* Per-worker contribution */}
        <Card className="mt-3">
          <CardContent className="p-0">
            <div className="grid grid-cols-12 gap-2 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <div className="col-span-3">Worker</div>
              <div className="col-span-2 text-right">Hours</div>
              <div className="col-span-3 text-right">Revenue (@ charge-out)</div>
              <div className="col-span-2 text-right">Cost</div>
              <div className="col-span-2 text-right">Contribution</div>
            </div>
            {workerRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No hours logged this week.
              </div>
            ) : (
              workerRows.map((r) => {
                const contribution = r.totalRevenue - r.totalCost;
                return (
                  <div
                    key={r.worker.id}
                    className="grid grid-cols-12 gap-2 border-b px-4 py-2 text-sm last:border-b-0"
                  >
                    <div className="col-span-3 font-medium">{r.worker.name}</div>
                    <div className="col-span-2 text-right tabular-nums">{formatHours(r.totalHours)}</div>
                    <div className="col-span-3 text-right tabular-nums">
                      {formatCurrency(r.totalRevenue, { whole: true })}
                    </div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(r.totalCost, { whole: true })}
                    </div>
                    <div
                      className={cn(
                        'col-span-2 text-right tabular-nums font-medium',
                        contribution < 0 && 'text-destructive',
                        contribution > 0 && 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {formatCurrency(contribution, { whole: true })}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <p className="mt-2 text-xs text-muted-foreground">
          Revenue = hours × charge-out rate. Cost = hours × cost rate + fixed weekly wage (owner draw, apprentice stipend) charged once per week if the worker logged any hours.
        </p>
      </section>

      {/* Week locks */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Locked weeks</h2>
        {locks.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No locks set. Use the Lock week button on Reports.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {[...locks]
                .sort((a, b) => (a.week_start < b.week_start ? 1 : -1))
                .map((l) => (
                  <div key={l.week_start} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <Lock className="h-4 w-4 text-warning" />
                    <div className="flex-1">
                      <p className="font-medium">{weekLabel(l.week_start)}</p>
                      <p className="text-xs text-muted-foreground">
                        locked {new Date(l.locked_at).toLocaleString('en-AU')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await unlockWeek.mutateAsync(l.week_start);
                        toast.success('Week unlocked');
                      }}
                    >
                      <Unlock className="h-3.5 w-3.5" /> Unlock
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Voice logs audit */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Voice log audit</h2>
        {voiceLogs.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No voice logs yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {voiceLogs.map((v) => (
                <div key={v.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {v.id.slice(-6)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString('en-AU')}
                    </span>
                  </div>
                  <p className="italic text-muted-foreground">“{v.transcript}”</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function PnLCell({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'success' | 'warning' | 'danger' | 'muted';
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
            tone === 'danger' && 'text-destructive',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
          )}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
