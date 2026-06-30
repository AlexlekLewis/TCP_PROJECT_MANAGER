import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { AlertTriangle, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Project, TimeEntry, Worker } from '@/types/db';
import {
  useBatchCreateTimeEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useTimeEntriesForWeek,
  useUpdateTimeEntry,
} from '@/hooks/useTimeEntries';
import { useCreateMaterialEntry, useMaterialEntries, useDeleteMaterialEntry } from '@/hooks/useMaterialEntries';
import { formatCurrency } from '@/lib/currency';
import { validateHours } from '@/lib/hours';
import { useProjectScopes } from '@/hooks/useProjectScopes';
import { useCanSeeFinancials } from '@/lib/permissions';
import { cn } from '@/lib/utils';

interface Props {
  date: string | null;
  locked: boolean;
  workers: Worker[];
  projects: Project[];
  onClose: () => void;
  /** Pre-seed the time entry form with these values (used by Quick Log chips). */
  initialWorkerId?: string;
  initialProjectId?: string;
}

export function DayEntryDialog({
  date,
  locked,
  workers,
  projects,
  onClose,
  initialWorkerId,
  initialProjectId,
}: Props) {
  return (
    <Dialog open={!!date} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {date ? format(parseISO(date), 'EEEE d MMMM') : '—'}
            {locked && <Badge variant="warning">Locked</Badge>}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? 'This week is locked. Only the admin can edit.'
              : 'Log hours per worker and any materials bought today.'}
          </DialogDescription>
        </DialogHeader>
        {date && (
          <DayEntryBody
            date={date}
            workers={workers}
            projects={projects.filter((p) => p.status === 'active')}
            locked={locked}
            initialWorkerId={initialWorkerId}
            initialProjectId={initialProjectId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DayEntryBody({
  date,
  workers,
  projects,
  locked,
  initialWorkerId,
  initialProjectId,
}: {
  date: string;
  workers: Worker[];
  projects: Project[];
  locked: boolean;
  initialWorkerId?: string;
  initialProjectId?: string;
}) {
  const { data: weekEntries = [] } = useTimeEntriesForWeek(date);
  const { data: materialsAll = [] } = useMaterialEntries();
  const createTE = useCreateTimeEntry();
  const batchCreateTE = useBatchCreateTimeEntries();
  const deleteTE = useDeleteTimeEntry();
  const updateTE = useUpdateTimeEntry();
  const createME = useCreateMaterialEntry();
  const deleteME = useDeleteMaterialEntry();
  const canSeeFinancials = useCanSeeFinancials();

  const dayTE = weekEntries.filter((e) => e.entry_date === date);
  const dayME = materialsAll.filter((m) => m.entry_date === date);

  // Yesterday's entries — used by the "Same as yesterday" shortcut.
  const yesterdayIso = format(addDays(parseISO(date), -1), 'yyyy-MM-dd');
  const yesterdayTE = weekEntries.filter((e) => e.entry_date === yesterdayIso);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Form state for adding a time entry — seeded from the quick-log chip if given.
  const [workerId, setWorkerId] = useState<string>(initialWorkerId ?? '');
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? '');
  const [scopeId, setScopeId] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [task, setTask] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // When set, the "Add time" form is in edit mode for this entry id — used to
  // correct a mis-logged worker / project / hours rather than add a new row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const timeFormRef = useRef<HTMLFieldSetElement | null>(null);

  // Scopes for the currently-picked project (time entry). Empty array
  // when project has no scopes — picker is then hidden entirely.
  const { data: timeScopes = [] } = useProjectScopes(projectId || null);
  // Clear scope selection when project changes.
  const handleProjectChange = (next: string) => {
    setProjectId(next);
    setScopeId('');
  };
  const hoursInputRef = useRef<HTMLInputElement | null>(null);

  // Live tallies — sum each worker's hours across all of today's entries,
  // and per worker × project so we can flag when a worker exceeds the
  // project's `daily_hours_warning` for the day.
  type Tally = {
    workerId: string;
    workerName: string;
    totalHours: number;
    perProject: Array<{
      projectId: string;
      projectName: string;
      hours: number;
      warning: number | null;
      overWarning: boolean;
    }>;
    overSoftCap: boolean; // any project over warning
  };
  const dailyTallies: Tally[] = useMemo(() => {
    const byWorker = new Map<string, Map<string, number>>();
    for (const e of dayTE) {
      const inner = byWorker.get(e.worker_id) ?? new Map<string, number>();
      inner.set(e.project_id, (inner.get(e.project_id) ?? 0) + Number(e.hours));
      byWorker.set(e.worker_id, inner);
    }
    const rows: Tally[] = [];
    for (const [wId, inner] of byWorker) {
      const worker = workerById.get(wId);
      if (!worker) continue;
      let total = 0;
      const perProject: Tally['perProject'] = [];
      let overAny = false;
      for (const [pId, hrs] of inner) {
        const project = projectById.get(pId);
        const warning = project?.daily_hours_warning ?? null;
        const overWarning = warning != null && hrs > warning;
        if (overWarning) overAny = true;
        total += hrs;
        perProject.push({
          projectId: pId,
          projectName: project?.name ?? '—',
          hours: hrs,
          warning,
          overWarning,
        });
      }
      rows.push({
        workerId: wId,
        workerName: worker.name,
        totalHours: total,
        perProject,
        overSoftCap: overAny,
      });
    }
    return rows.sort((a, b) => a.workerName.localeCompare(b.workerName));
  }, [dayTE, workerById, projectById]);

  // Pre-submit preview of the new entry's effect on the soft cap.
  const previewWarning = useMemo(() => {
    if (!workerId || !projectId || !hours) return null;
    const h = Number.parseFloat(hours);
    if (!Number.isFinite(h)) return null;
    const project = projectById.get(projectId);
    const cap = project?.daily_hours_warning;
    if (cap == null) return null;
    const already = dayTE
      // Exclude the row being edited so a correction doesn't double-count it.
      .filter((e) => e.worker_id === workerId && e.project_id === projectId && e.id !== editingId)
      .reduce((s, e) => s + Number(e.hours), 0);
    const total = already + h;
    if (total > cap) {
      return `${workerById.get(workerId)?.name ?? 'Worker'} would be at ${total.toFixed(1)}h on ${
        project?.name
      } today — over the ${cap}h soft cap.`;
    }
    return null;
  }, [workerId, projectId, hours, dayTE, projectById, workerById, editingId]);

  // Auto-focus the Hours input once both worker + project are picked. Saves
  // a tap on phones where the worker comes from a chip and project from a tap.
  useEffect(() => {
    if (workerId && projectId && !hours) {
      hoursInputRef.current?.focus();
    }
  }, [workerId, projectId, hours]);

  // Form state for adding a material
  const [matProjectId, setMatProjectId] = useState<string>('');
  const [matScopeId, setMatScopeId] = useState<string>('');
  const [matDesc, setMatDesc] = useState<string>('');
  const [matCost, setMatCost] = useState<string>('');
  const [matSupplier, setMatSupplier] = useState<string>('');
  const { data: matScopes = [] } = useProjectScopes(matProjectId || null);
  const handleMatProjectChange = (next: string) => {
    setMatProjectId(next);
    setMatScopeId('');
  };

  // Load an existing entry into the form to correct it. Scrolls the form into
  // view inside the scrollable dialog so the fields are visible on a phone.
  const startEdit = (e: TimeEntry) => {
    setEditingId(e.id);
    setWorkerId(e.worker_id);
    setProjectId(e.project_id);
    setScopeId(e.scope_id ?? '');
    setHours(String(Number(e.hours)));
    setTask(e.task ?? '');
    setNotes(e.notes ?? '');
    requestAnimationFrame(() => {
      timeFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      hoursInputRef.current?.focus();
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setWorkerId('');
    setProjectId('');
    setScopeId('');
    setHours('');
    setTask('');
    setNotes('');
  };

  const submitTime = async () => {
    if (!workerId || !projectId || !hours) return;
    const h = Number.parseFloat(hours);
    const v = validateHours(h);
    if (!v.ok) {
      toast.error(v.error!);
      return;
    }
    if (v.warning) toast.warning(v.warning);

    if (editingId) {
      // Correcting an existing entry.
      await updateTE.mutateAsync({
        id: editingId,
        patch: {
          worker_id: workerId,
          project_id: projectId,
          scope_id: scopeId || null,
          hours: h,
          task: task || null,
          notes: notes || null,
        },
      });
      if (previewWarning) toast.warning(previewWarning);
      else toast.success('Entry updated');
      cancelEdit();
      return;
    }

    await createTE.mutateAsync({
      entry_date: date,
      worker_id: workerId,
      project_id: projectId,
      scope_id: scopeId || null,
      hours: h,
      task: task || null,
      notes: notes || null,
      ai_source_id: null,
    });
    // Soft-cap flag — informational, doesn't block (and the entry's already saved)
    if (previewWarning) toast.warning(previewWarning);
    else toast.success('Time entry added');
    // Keep worker + project for fast multi-entry; clear the rest.
    setHours('');
    setTask('');
    setNotes('');
    setScopeId('');
  };

  const submitMaterial = async () => {
    if (!matProjectId || !matDesc || !matCost) return;
    await createME.mutateAsync({
      entry_date: date,
      project_id: matProjectId,
      scope_id: matScopeId || null,
      description: matDesc,
      cost: Number.parseFloat(matCost),
      supplier: matSupplier || null,
      ai_source_id: null,
    });
    toast.success('Material added');
    setMatDesc('');
    setMatCost('');
    setMatSupplier('');
  };

  // One-tap clone yesterday's time entries into today. Atomic — uses a
  // single batch insert so a mid-flight network drop can't leave half a
  // day cloned. Skips entries whose worker is no longer active or whose
  // project has been archived.
  const cloneYesterday = async () => {
    const validatedEntries = yesterdayTE.filter((e) => {
      const w = workerById.get(e.worker_id);
      const p = projectById.get(e.project_id);
      return w?.active && p;
    });
    if (validatedEntries.length === 0) {
      toast.error('Nothing from yesterday to copy');
      return;
    }
    try {
      await batchCreateTE.mutateAsync(
        validatedEntries.map((e) => ({
          entry_date: date,
          worker_id: e.worker_id,
          project_id: e.project_id,
          // Preserve scope tagging from yesterday's entries so clone-day
          // recreates the same scope split (Pierce on Exterior etc.).
          scope_id: e.scope_id ?? null,
          hours: Number(e.hours),
          task: e.task,
          notes: e.notes,
          ai_source_id: null,
        })),
      );
      toast.success(
        `Copied ${validatedEntries.length} entr${validatedEntries.length === 1 ? 'y' : 'ies'} from yesterday`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Copy from yesterday failed');
    }
  };

  const HOURS_PRESETS = [2, 4, 6, 7.6, 8, 10];

  return (
    <div className="space-y-6">
      {/* Same as yesterday — one-tap clone */}
      {!locked && yesterdayTE.length > 0 && dayTE.length === 0 && (
        <button
          type="button"
          onClick={cloneYesterday}
          className="flex w-full items-center justify-between rounded-md border border-dashed border-[hsl(var(--brand-accent))]/40 bg-[hsl(var(--brand-accent-soft))]/40 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-[hsl(var(--brand-accent-soft))]"
        >
          <span className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-[hsl(var(--brand-accent))]" />
            <span>
              <span className="font-medium">Same as yesterday</span>
              <span className="ml-1 text-muted-foreground">
                · copy {yesterdayTE.length} entr{yesterdayTE.length === 1 ? 'y' : 'ies'}
              </span>
            </span>
          </span>
          <Plus className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Existing entries */}
      {dayTE.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Time today</h3>
          <div className="divide-y rounded-md border">
            {dayTE.map((e) => {
              const proj = projectById.get(e.project_id);
              const cap = proj?.daily_hours_warning ?? null;
              // Sum hours for this worker × project across today's entries
              const workerProjectTotal = dayTE
                .filter((x) => x.worker_id === e.worker_id && x.project_id === e.project_id)
                .reduce((s, x) => s + Number(x.hours), 0);
              const overCap = cap != null && workerProjectTotal > cap;
              return (
              <div
                key={e.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  overCap && 'bg-warning/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {workerById.get(e.worker_id)?.name ?? '—'}
                    {e.task && (
                      <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                        {e.task}
                      </span>
                    )}
                    {overCap && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium uppercase text-warning"
                        title={`Over ${cap}h soft cap for this job today`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Over cap
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {projectById.get(e.project_id)?.name ?? '—'}
                    {e.notes && ` · ${e.notes}`}
                  </p>
                </div>
                <span className="tabular-nums font-semibold">{Number(e.hours).toFixed(1)}h</span>
                {!locked && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit entry"
                      onClick={() => startEdit(e)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete entry"
                      onClick={() => {
                        deleteTE.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily tally — per worker totals + soft-cap flags */}
      {dailyTallies.length > 0 && (
        <div
          data-testid="daily-tally"
          className="rounded-md border bg-card/60 p-3"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Day tally — per worker</span>
            {dailyTallies.some((t) => t.overSoftCap) && (
              <span className="inline-flex items-center gap-1 text-warning">
                <AlertTriangle className="h-3 w-3" /> One or more soft caps exceeded
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            {dailyTallies.map((t) => (
              <div key={t.workerId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="min-w-[5rem] font-medium">{t.workerName}</span>
                <span
                  className={cn(
                    'tabular-nums font-semibold',
                    t.totalHours > 10 && 'text-warning',
                  )}
                >
                  {t.totalHours.toFixed(1)}h
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.perProject.map((pp, i) => (
                    <span key={pp.projectId}>
                      {i > 0 && ' · '}
                      <span className={cn(pp.overWarning && 'font-semibold text-warning')}>
                        {pp.projectName} {pp.hours.toFixed(1)}h
                        {pp.warning != null && pp.overWarning && (
                          <span className="ml-1 text-[10px] uppercase">
                            ({pp.warning}h cap)
                          </span>
                        )}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / edit time entry */}
      {!locked && (
        <fieldset ref={timeFormRef} className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium uppercase text-muted-foreground">
            {editingId ? 'Edit time' : 'Add time'}
          </legend>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Worker</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick worker" />
                </SelectTrigger>
                <SelectContent>
                  {workers.filter((w) => w.active).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={handleProjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {timeScopes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Scope (optional)</Label>
              <Select
                value={scopeId || '__none__'}
                onValueChange={(v) => setScopeId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Project-general (travel, mob, etc.) —</SelectItem>
                  {timeScopes
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
            <div className="space-y-1.5">
              <Label>Hours</Label>
              <Input
                ref={hoursInputRef}
                type="number"
                step="0.25"
                min="0"
                max="14"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                data-testid="hours-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Task (optional)</Label>
              <Input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g. Ceilings"
                data-testid="task-input"
                list="task-suggestions"
              />
              {/* Native suggestions from prior entries — Gavin types
                  "Ceilings" once, sees it next time as a one-tap option. */}
              <datalist id="task-suggestions">
                {Array.from(
                  new Set(dayTE.map((e) => e.task).filter((x): x is string => !!x)),
                ).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was done"
              />
            </div>
          </div>
          {/* Inline preview — flag soft-cap overage BEFORE saving */}
          {previewWarning && (
            <div className="flex items-center gap-2 rounded bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{previewWarning}</span>
            </div>
          )}
          {/* Hours preset chips — one-tap common values for the phone-on-site flow */}
          <div className="flex flex-wrap gap-1.5" aria-label="Hours preset shortcuts">
            {HOURS_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                data-testid={`hours-preset-${h}`}
                onClick={() => setHours(String(h))}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs tabular-nums transition-colors',
                  hours === String(h)
                    ? 'border-[hsl(var(--brand-accent))] bg-[hsl(var(--brand-accent-soft))] text-[hsl(var(--brand-accent))] font-semibold'
                    : 'border-input bg-card hover:bg-accent',
                )}
              >
                {h}h
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={submitTime} disabled={!workerId || !projectId || !hours}>
              {editingId ? (
                'Save changes'
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Add time
                </>
              )}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </fieldset>
      )}

      {/* Materials */}
      {dayME.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Materials today</h3>
          <div className="divide-y rounded-md border">
            {dayME.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {projectById.get(m.project_id)?.name ?? '—'}
                    {m.supplier && ` · ${m.supplier}`}
                  </p>
                </div>
                {canSeeFinancials && (
                  <span className="tabular-nums font-semibold">{formatCurrency(m.cost)}</span>
                )}
                {!locked && (
                  <Button variant="ghost" size="icon" onClick={() => deleteME.mutate(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!locked && (
        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium uppercase text-muted-foreground">
            Add material
          </legend>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={matProjectId} onValueChange={handleMatProjectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pick project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {matScopes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Scope (optional)</Label>
              <Select
                value={matScopeId || '__none__'}
                onValueChange={(v) => setMatScopeId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Project-general —</SelectItem>
                  {matScopes
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={matDesc}
              onChange={(e) => setMatDesc(e.target.value)}
              placeholder="e.g. Haymes Low Sheen 20L"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cost (AUD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={matCost}
                onChange={(e) => setMatCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier (optional)</Label>
              <Input
                value={matSupplier}
                onChange={(e) => setMatSupplier(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={submitMaterial} disabled={!matProjectId || !matDesc || !matCost}>
            <Plus className="h-4 w-4" /> Add material
          </Button>
        </fieldset>
      )}
    </div>
  );
}
