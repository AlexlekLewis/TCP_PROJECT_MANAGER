import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  DollarSign,
  MoreVertical,
  Pencil,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectForm } from '@/components/features/ProjectForm';
import { ConfirmDialog } from '@/components/features/ConfirmDialog';
import {
  useArchiveProject,
  useDeleteProject,
  useProject,
  useProjectCanDelete,
} from '@/hooks/useProjects';
import { useWorkers } from '@/hooks/useWorkers';
import { useTimeEntriesForProject } from '@/hooks/useTimeEntries';
import { useMaterialEntriesForProject } from '@/hooks/useMaterialEntries';
import {
  useCreateVariation,
  useProjectVariations,
  useUpdateVariation,
  useUpdateVariationStatus,
} from '@/hooks/useProjectVariations';
import {
  useCreateScope,
  useDeleteScope,
  useProjectScopes,
  useUpdateScope,
} from '@/hooks/useProjectScopes';
import { useUpdateProject } from '@/hooks/useProjects';
import { computeProjectTotals } from '@/lib/aggregations';
import { VariationsSection } from '@/components/features/VariationsSection';
import { ScopesSection } from '@/components/features/ScopesSection';
import { formatCurrency } from '@/lib/currency';
import { formatHours } from '@/lib/hours';
import { useAuth } from '@/context/AuthContext';
import { useCanSeeFinancials } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const canSeeFinancials = useCanSeeFinancials();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState<'archive' | 'unarchive' | 'delete' | null>(null);
  const { data: project } = useProject(id ?? null);
  const { data: workers = [] } = useWorkers();
  const { data: timeEntries = [] } = useTimeEntriesForProject(id ?? '');
  const { data: materials = [] } = useMaterialEntriesForProject(id ?? '');
  const { data: variations = [] } = useProjectVariations(id ?? null);
  const { data: scopes = [] } = useProjectScopes(id ?? null);
  const canDelete = useProjectCanDelete(id);
  const archive = useArchiveProject();
  const del = useDeleteProject();
  const updateProject = useUpdateProject();
  const createVariation = useCreateVariation();
  const updateVariation = useUpdateVariation();
  const updateVariationStatus = useUpdateVariationStatus();
  const createScope = useCreateScope();
  const updateScope = useUpdateScope();
  const deleteScope = useDeleteScope();
  const working = archive.isPending || del.isPending;

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const totals = useMemo(
    () =>
      project
        ? computeProjectTotals(project, timeEntries, materials, workers, 0, variations, scopes)
        : null,
    [project, timeEntries, materials, workers, variations, scopes],
  );

  // Gavin's world is the scoped breakdown. `project.quoted_hours` is Alex's
  // internal (deliberately tighter) target and stays admin-only — the manager
  // sees the sum of scope hours instead.
  const scopedHours = useMemo(
    () => scopes.reduce((sum, s) => sum + Number(s.quoted_hours ?? 0), 0),
    [scopes],
  );

  const markReviewed = async () => {
    if (!project) return;
    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: { needs_admin_review: false },
      });
      toast.success('Project marked as reviewed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  if (!project) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="link" asChild>
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  // Manager sees scoped hours as the planned target; admin sees the internal quote.
  const plannedHours = canSeeFinancials
    ? project.quoted_hours ?? null
    : scopedHours > 0
      ? scopedHours
      : null;
  const hoursUsedPct =
    plannedHours && plannedHours > 0 ? ((totals?.labourHours ?? 0) / plannedHours) * 100 : null;

  return (
    <div className="space-y-6">
      <div
        className="-mx-4 h-1.5 rounded-full"
        style={{ background: project.color_tag ?? 'hsl(var(--border))' }}
      />

      {/* Needs-review banner — surfaced to admin when a manager-created draft is awaiting completion. */}
      {project.needs_admin_review && role === 'admin' && (
        <div
          data-testid="needs-review-banner"
          className="flex items-start gap-3 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/60 dark:text-amber-100"
        >
          <Pencil className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-0.5">
            <p className="font-semibold">Draft project — needs your review</p>
            <p className="text-xs">
              Gavin created this project so he could log hours. Fill in the quote, materials budget, and target profit, then mark it reviewed.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100"
            onClick={() => setEditOpen(true)}
          >
            Open edit form
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900"
            onClick={markReviewed}
          >
            Mark reviewed
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/projects" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
            <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {project.client_name ?? '—'}
            {project.address && ` · ${project.address}`}
          </p>
        </div>
        {role === 'admin' && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {project.status === 'archived' ? (
                  <DropdownMenuItem onSelect={() => setPending('unarchive')}>
                    <ArchiveRestore className="h-4 w-4" /> Restore to active
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setPending('archive')}>
                    <Archive className="h-4 w-4" /> Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  disabled={canDelete !== true}
                  onSelect={canDelete === true ? () => setPending('delete') : undefined}
                >
                  <Trash2 className="h-4 w-4" />
                  {canDelete === undefined
                    ? 'Delete (checking…)'
                    : canDelete
                      ? 'Delete permanently'
                      : 'Delete (has entries)'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Financials overview — admin only */}
      {totals && canSeeFinancials && (
        <section className="grid gap-3 sm:grid-cols-4">
          <StatCard
            label="Labour"
            value={formatCurrency(totals.labourCost, { whole: true })}
            sub={`${formatHours(totals.labourHours)}${
              project.quoted_hours ? ` / ${formatHours(project.quoted_hours)}` : ''
            }`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Materials"
            value={formatCurrency(totals.materialCost, { whole: true })}
            sub={
              project.materials_budget
                ? `of ${formatCurrency(project.materials_budget, { whole: true })}`
                : 'no budget'
            }
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            label={totals.approvedVariations > 0 ? 'Quoted (incl. variations)' : 'Quoted'}
            value={formatCurrency(totals.totalQuote ?? project.quoted_price, { whole: true })}
            sub={
              totals.approvedVariations > 0
                ? `${formatCurrency(project.quoted_price, { whole: true })} base + ${formatCurrency(
                    totals.approvedVariations,
                    { whole: true },
                  )} variations`
                : undefined
            }
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            label="Gross margin"
            value={totals.profit != null ? formatCurrency(totals.profit, { whole: true }) : '—'}
            sub={
              totals.profitPercent != null ? `${totals.profitPercent.toFixed(0)}% of quote` : undefined
            }
            tone={
              totals.profit == null
                ? 'muted'
                : totals.profit < 0
                  ? 'danger'
                  : totals.profitPercent! < 15
                    ? 'warning'
                    : 'success'
            }
          />
          {totals.targetProfit != null && (
            <StatCard
              label={`Profit vs target (${formatCurrency(totals.targetProfit, { whole: true })})`}
              value={formatCurrency(totals.projectedProfit ?? 0, { whole: true })}
              sub={
                totals.profitHealth === 'on_track'
                  ? 'On track ✓'
                  : totals.profitHealth === 'at_risk'
                    ? 'At risk — within 10% under'
                    : totals.profitHealth === 'over_budget'
                      ? 'Over budget — more than 10% under'
                      : undefined
              }
              tone={
                totals.profitHealth === 'on_track'
                  ? 'success'
                  : totals.profitHealth === 'at_risk'
                    ? 'warning'
                    : totals.profitHealth === 'over_budget'
                      ? 'danger'
                      : 'muted'
              }
            />
          )}
        </section>
      )}

      {/* Hours-only summary for manager */}
      {totals && !canSeeFinancials && (
        <section>
          <StatCard
            label="Hours logged"
            value={formatHours(totals.labourHours)}
            sub={scopedHours > 0 ? `of ${formatHours(scopedHours)} scoped` : undefined}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </section>
      )}

      {/* Scopes — multi-area projects with separate priced sections. Both
          roles can add/edit; the manager sees hours only (no pricing). */}
      <ScopesSection
        projectId={project.id}
        scopes={scopes}
        timeEntries={timeEntries}
        materialEntries={materials}
        workers={workers}
        onCreate={async (input) => {
          await createScope.mutateAsync(input);
        }}
        onUpdate={async (id, patch) => {
          await updateScope.mutateAsync({ id, patch });
        }}
        onDelete={async (id) => {
          await deleteScope.mutateAsync(id);
        }}
      />

      {/* Variations. Both roles can log one; the manager logs it unpriced for
          Alex to price + approve. Approved variations roll into total quote. */}
      <VariationsSection
        projectId={project.id}
        variations={variations}
        canSeeFinancials={canSeeFinancials}
        onAdd={async (input) => {
          await createVariation.mutateAsync({ project_id: project.id, ...input });
          toast.success('Variation added');
        }}
        onUpdate={
          canSeeFinancials
            ? async (id, patch) => {
                await updateVariation.mutateAsync({ id, patch });
                toast.success('Variation updated');
              }
            : undefined
        }
        onSetStatus={
          canSeeFinancials
            ? async (id, status) => {
                await updateVariationStatus.mutateAsync({ id, status });
                toast.success(`Variation ${status}`);
              }
            : undefined
        }
        approvedTotal={totals?.approvedVariations ?? 0}
      />

      {/* Progress bars */}
      {totals && (plannedHours != null || (canSeeFinancials && project.materials_budget)) && (
        <div className="space-y-3 rounded-md border bg-card p-4">
          {plannedHours != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Hours used</span>
                <span className="font-semibold tabular-nums">
                  {hoursUsedPct?.toFixed(0)}%
                </span>
              </div>
              <Progress
                value={hoursUsedPct ?? 0}
                variant={
                  (hoursUsedPct ?? 0) > 100
                    ? 'danger'
                    : (hoursUsedPct ?? 0) > 80
                      ? 'warning'
                      : 'default'
                }
              />
            </div>
          )}
          {canSeeFinancials && project.materials_budget != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Materials budget</span>
                <span className="font-semibold tabular-nums">
                  {totals.materialsUsedPct?.toFixed(0)}%
                </span>
              </div>
              <Progress
                value={totals.materialsUsedPct ?? 0}
                variant={
                  (totals.materialsUsedPct ?? 0) > 100
                    ? 'danger'
                    : (totals.materialsUsedPct ?? 0) > 80
                      ? 'warning'
                      : 'default'
                }
              />
            </div>
          )}
          {(hoursUsedPct ?? 0) > 80 && (
            <div className="flex items-start gap-2 rounded bg-warning/10 p-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
              <span>
                At {hoursUsedPct?.toFixed(0)}% of {canSeeFinancials ? 'quoted' : 'scoped'} hours.
                {canSeeFinancials ? ' Review scope with Alex.' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          {timeEntries.length === 0 ? (
            <EmptyCard text="No time logged yet." />
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {timeEntries.map((e) => {
                  const w = workerById.get(e.worker_id);
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div className="w-28 text-xs text-muted-foreground">
                        {format(parseISO(e.entry_date), 'EEE d MMM')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{w?.name ?? '—'}</p>
                        {e.notes && (
                          <p className="truncate text-xs text-muted-foreground">{e.notes}</p>
                        )}
                      </div>
                      <span className="tabular-nums font-semibold">
                        {Number(e.hours).toFixed(1)}h
                      </span>
                      {canSeeFinancials && (
                        <span className="w-20 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(Number(e.hours) * Number(w?.cost_rate ?? 0), {
                            whole: true,
                          })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="materials">
          {materials.length === 0 ? (
            <EmptyCard text="No materials logged yet." />
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {materials.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="w-28 text-xs text-muted-foreground">
                      {format(parseISO(m.entry_date), 'EEE d MMM')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.description}</p>
                      {m.supplier && (
                        <p className="text-xs text-muted-foreground">{m.supplier}</p>
                      )}
                    </div>
                    {canSeeFinancials && (
                      <span className="tabular-nums font-semibold">{formatCurrency(m.cost)}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Project notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {project.notes ?? 'No notes.'}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProjectForm open={editOpen} onClose={() => setEditOpen(false)} project={project} />

      <ConfirmDialog
        open={pending === 'archive'}
        title={`Archive ${project.name}?`}
        description="Archived projects are hidden from Active but stay in the system. All time and material entries are preserved."
        confirmLabel="Archive"
        loading={working}
        onConfirm={async () => {
          try {
            await archive.archive(project.id);
            toast.success(`Archived ${project.name}`);
            setPending(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Archive failed');
          }
        }}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === 'unarchive'}
        title={`Restore ${project.name}?`}
        description="Moves the project back to Active."
        confirmLabel="Restore"
        loading={working}
        onConfirm={async () => {
          try {
            await archive.unarchive(project.id);
            toast.success(`Restored ${project.name}`);
            setPending(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Restore failed');
          }
        }}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        title={`Delete ${project.name}?`}
        description="This permanently removes the project. Only available when the project has no time or material entries."
        confirmLabel="Delete permanently"
        destructive
        loading={working}
        onConfirm={async () => {
          try {
            await del.mutateAsync(project.id);
            toast.success(`Deleted ${project.name}`);
            setPending(null);
            navigate('/projects');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Delete failed');
          }
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const toneClass = {
    default: '',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-xl font-semibold tabular-nums', toneClass)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {icon && <div className="rounded-md bg-secondary p-1.5">{icon}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

function statusVariant(s: string) {
  switch (s) {
    case 'active':
      return 'default' as const;
    case 'complete':
      return 'success' as const;
    case 'archived':
      return 'secondary' as const;
    default:
      return 'secondary' as const;
  }
}
