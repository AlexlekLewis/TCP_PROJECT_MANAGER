import { useState } from 'react';
import { Plus, Pencil, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { computeScopeTotals } from '@/lib/aggregations';
import { formatCurrency } from '@/lib/currency';
import { formatHours } from '@/lib/hours';
import { useCanSeeFinancials } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  MaterialEntry,
  ProjectScope,
  ProjectStatus,
  TimeEntry,
  Worker,
} from '@/types/db';

interface Props {
  projectId: string;
  scopes: ProjectScope[];
  timeEntries: TimeEntry[];
  materialEntries: MaterialEntry[];
  workers: Worker[];
  onCreate: (input: Omit<ProjectScope, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ProjectScope>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Multi-scope project breakdown. Renders a card per priced area
 * (Exterior / Interior / Studio). Empty state shows a single "Add
 * scope" call-to-action. Admin only.
 */
export function ScopesSection({
  projectId,
  scopes,
  timeEntries,
  materialEntries,
  workers,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const canSeeFinancials = useCanSeeFinancials();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectScope | null>(null);
  const [deleting, setDeleting] = useState<ProjectScope | null>(null);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Scopes</h2>
        {scopes.length > 0 && (
          <Badge variant="secondary" className="font-mono">
            {scopes.length} {scopes.length === 1 ? 'scope' : 'scopes'}
          </Badge>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> Add scope
        </Button>
      </div>

      {scopes.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-4 text-center text-xs text-muted-foreground">
            <p>No scopes yet — this is a single-quote project.</p>
            <p>Add scopes if the job has separate priced areas (e.g. exterior + interior + studio).</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {scopes.map((s) => (
            <ScopeCard
              key={s.id}
              scope={s}
              timeEntries={timeEntries}
              materialEntries={materialEntries}
              workers={workers}
              canSeeFinancials={canSeeFinancials}
              onEdit={() => setEditing(s)}
              onDelete={() => setDeleting(s)}
            />
          ))}
        </div>
      )}

      <ScopeDialog
        open={creating}
        onClose={() => setCreating(false)}
        nextOrderIndex={scopes.length}
        canSeeFinancials={canSeeFinancials}
        onSubmit={async (input) => {
          await onCreate({ ...input, project_id: projectId });
          setCreating(false);
        }}
      />
      <ScopeDialog
        key={editing?.id ?? 'edit'}
        open={!!editing}
        onClose={() => setEditing(null)}
        scope={editing ?? undefined}
        nextOrderIndex={editing?.order_index ?? 0}
        canSeeFinancials={canSeeFinancials}
        onSubmit={async (patch) => {
          if (editing) {
            await onUpdate(editing.id, patch);
            setEditing(null);
          }
        }}
      />
      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scope?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{deleting?.name}" will be removed. Any time or material entries tagged to it become
            project-general (the entries themselves are kept).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await onDelete(deleting.id);
                  toast.success(`Deleted scope "${deleting.name}"`);
                  setDeleting(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Delete failed');
                }
              }}
            >
              Delete scope
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ScopeCard({
  scope,
  timeEntries,
  materialEntries,
  workers,
  canSeeFinancials,
  onEdit,
  onDelete,
}: {
  scope: ProjectScope;
  timeEntries: TimeEntry[];
  materialEntries: MaterialEntry[];
  workers: Worker[];
  canSeeFinancials: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = computeScopeTotals(scope, timeEntries, materialEntries, workers);
  const profitTone =
    t.quoteProfit == null
      ? 'muted'
      : t.quoteProfit < 0
        ? 'danger'
        : t.quoteProfit < (scope.quoted_price ?? 0) * 0.15
          ? 'warning'
          : 'success';

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{scope.name}</p>
            <p className="text-xs text-muted-foreground">
              {scope.status !== 'active' && (
                <Badge variant="secondary" className="mr-1">
                  {scope.status}
                </Badge>
              )}
              {canSeeFinancials && scope.quoted_price != null
                ? `Quoted ${formatCurrency(scope.quoted_price, { whole: true })}`
                : 'Unquoted'}
              {scope.quoted_hours != null && ` · ${formatHours(scope.quoted_hours)} planned`}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Scope actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              {/* Delete stays admin-only: removing a scope changes the project
                  quote rollup. Manager (Gavin) can add + edit, not delete. */}
              {canSeeFinancials && (
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Hours progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Hours logged</span>
            <span className="font-semibold tabular-nums">
              {formatHours(t.labourHours)}
              {scope.quoted_hours ? ` / ${formatHours(scope.quoted_hours)}` : ''}
            </span>
          </div>
          {scope.quoted_hours != null && (
            <Progress
              value={t.hoursUsedPct ?? 0}
              className={cn(
                (t.hoursUsedPct ?? 0) > 100 && 'bg-destructive/20',
                (t.hoursUsedPct ?? 0) > 80 && (t.hoursUsedPct ?? 0) <= 100 && 'bg-amber-200/40',
              )}
            />
          )}
        </div>

        {/* Cost + profit (admin only) */}
        {canSeeFinancials && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Labour cost</p>
              <p className="font-semibold tabular-nums">
                {formatCurrency(t.labourCost, { whole: true })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Materials</p>
              <p className="font-semibold tabular-nums">
                {formatCurrency(t.materialCost, { whole: true })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Profit so far</p>
              <p
                className={cn(
                  'font-semibold tabular-nums',
                  profitTone === 'danger' && 'text-destructive',
                  profitTone === 'success' && 'text-emerald-600 dark:text-emerald-400',
                  profitTone === 'warning' && 'text-amber-600 dark:text-amber-400',
                )}
              >
                {t.quoteProfit != null
                  ? formatCurrency(t.quoteProfit, { whole: true })
                  : formatCurrency(t.projectedProfit, { whole: true })}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScopeDialog({
  open,
  onClose,
  scope,
  nextOrderIndex,
  canSeeFinancials,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  scope?: ProjectScope;
  nextOrderIndex: number;
  /** Manager (Gavin) is $-blind: pricing fields are hidden and any existing
   *  values are preserved unchanged on save. */
  canSeeFinancials: boolean;
  onSubmit: (input: Omit<ProjectScope, 'id' | 'project_id' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const [name, setName] = useState(scope?.name ?? '');
  const [quotedPrice, setQuotedPrice] = useState(String(scope?.quoted_price ?? ''));
  const [quotedHours, setQuotedHours] = useState(String(scope?.quoted_hours ?? ''));
  const [materialsBudget, setMaterialsBudget] = useState(String(scope?.materials_budget ?? ''));
  const [targetProfit, setTargetProfit] = useState(String(scope?.target_profit ?? ''));
  const [status, setStatus] = useState<ProjectStatus>(scope?.status ?? 'active');
  const [notes, setNotes] = useState(scope?.notes ?? '');

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Scope name is required');
      return;
    }
    try {
      await onSubmit({
        name: name.trim(),
        quoted_price: quotedPrice ? +quotedPrice : null,
        quoted_hours: quotedHours ? +quotedHours : null,
        materials_budget: materialsBudget ? +materialsBudget : null,
        target_profit: targetProfit ? +targetProfit : null,
        status,
        order_index: scope?.order_index ?? nextOrderIndex,
        notes: notes.trim() || null,
      });
      toast.success(scope ? 'Scope updated' : 'Scope added');
      setName('');
      setQuotedPrice('');
      setQuotedHours('');
      setMaterialsBudget('');
      setTargetProfit('');
      setStatus('active');
      setNotes('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{scope ? 'Edit scope' : 'Add scope'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              placeholder="e.g. Exterior / Interior / Studio"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {canSeeFinancials ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quote $</Label>
                  <Input
                    type="number"
                    step="100"
                    value={quotedPrice}
                    onChange={(e) => setQuotedPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quoted hours</Label>
                  <Input
                    type="number"
                    step="1"
                    value={quotedHours}
                    onChange={(e) => setQuotedHours(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Materials budget $</Label>
                  <Input
                    type="number"
                    step="50"
                    value={materialsBudget}
                    onChange={(e) => setMaterialsBudget(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Target profit $</Label>
                  <Input
                    type="number"
                    step="100"
                    value={targetProfit}
                    onChange={(e) => setTargetProfit(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            // Manager: hours only. Pricing (quote / materials budget / target)
            // stays Alex's job and is never shown here.
            <div className="space-y-1.5">
              <Label>Planned hours (optional)</Label>
              <Input
                type="number"
                step="1"
                value={quotedHours}
                onChange={(e) => setQuotedHours(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{scope ? 'Save' : 'Add scope'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
