import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Clock, Download, Pencil, Plus, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/currency';
import { formatHours } from '@/lib/hours';
import { downloadCSV, slugify, variationWorksheetCSV } from '@/lib/csv';
import { computeVariationTotals, type VariationTotals } from '@/lib/aggregations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  MaterialEntry,
  ProjectVariation,
  TimeEntry,
  VariationStatus,
  Worker,
} from '@/types/db';

interface AddInput {
  description: string;
  amount: number | null;
  notes: string | null;
  status: VariationStatus;
}

interface Props {
  projectId: string;
  projectName: string;
  variations: ProjectVariation[];
  /** All time / material entries on the project — filtered per variation here. */
  timeEntries: TimeEntry[];
  materialEntries: MaterialEntry[];
  workers: Worker[];
  approvedTotal: number;
  /** Admin sees + sets the dollar amount and can approve/reject. Manager
   *  (Gavin) logs the extra scope by description only and never sees money. */
  canSeeFinancials: boolean;
  onAdd: (input: AddInput) => Promise<void>;
  onUpdate?: (
    id: string,
    patch: { description: string; amount: number | null; notes: string | null },
  ) => Promise<void>;
  onSetStatus?: (id: string, status: VariationStatus) => Promise<void>;
}

/**
 * Variations = extra scope a client signs off mid-job ("while you're here,
 * can you do the bathroom too?"). Only `approved` rolls into the quote.
 *
 * Each one carries its own itemised ledger — who worked on it, what day, how
 * many hours, what they did — because that's what Alex needs to put a price on
 * it and what the client gets when they query the charge. Both roles can add a
 * variation and log work against it; pricing and approval are admin-only.
 */
export function VariationsSection({
  projectId,
  projectName,
  variations,
  timeEntries,
  materialEntries,
  workers,
  approvedTotal,
  canSeeFinancials,
  onAdd,
  onUpdate,
  onSetStatus,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectVariation | null>(null);
  const sorted = [...variations].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Variations</h2>
        {canSeeFinancials && approvedTotal > 0 && (
          <Badge variant="secondary" className="font-mono">
            +{formatCurrency(approvedTotal, { whole: true })} approved
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Add variation
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-4 text-center text-xs text-muted-foreground">
            No variations on this project yet. Add one when the client asks for extra work.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((v) => (
            <VariationCard
              key={v.id}
              variation={v}
              projectId={projectId}
              projectName={projectName}
              totals={computeVariationTotals(v, timeEntries, materialEntries, workers)}
              canSeeFinancials={canSeeFinancials}
              onEdit={onUpdate ? () => setEditing(v) : undefined}
              onSetStatus={onSetStatus}
            />
          ))}
        </div>
      )}

      {/* Add — both roles. Manager form is description + notes only. */}
      <VariationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        canSeeFinancials={canSeeFinancials}
        onSubmit={async (input) => {
          await onAdd(input);
          setAddOpen(false);
        }}
      />

      {/* Edit / price — admin only. */}
      <VariationDialog
        key={editing?.id ?? 'edit'}
        open={!!editing}
        onClose={() => setEditing(null)}
        canSeeFinancials
        variation={editing ?? undefined}
        loggedTotals={
          editing
            ? computeVariationTotals(editing, timeEntries, materialEntries, workers)
            : undefined
        }
        onSubmit={async (input) => {
          if (editing && onUpdate) {
            await onUpdate(editing.id, {
              description: input.description,
              amount: input.amount,
              notes: input.notes,
            });
            setEditing(null);
          }
        }}
      />
    </section>
  );
}

/**
 * One variation and its ledger. Collapsed it reads as a headline (what, what
 * state, how many hours); expanded it itemises every line of work so the four
 * facts Alex needs — who, when, how long, what — are all on screen.
 */
function VariationCard({
  variation: v,
  projectId,
  projectName,
  totals,
  canSeeFinancials,
  onEdit,
  onSetStatus,
}: {
  variation: ProjectVariation;
  projectId: string;
  projectName: string;
  totals: VariationTotals;
  canSeeFinancials: boolean;
  onEdit?: () => void;
  onSetStatus?: (id: string, status: VariationStatus) => Promise<void>;
}) {
  const hasWork = totals.lines.length > 0 || totals.materials.length > 0;
  const [open, setOpen] = useState(false);
  // Work logged against a rejected variation is work nobody is paying for.
  const unbillable = v.status === 'rejected' && totals.labourHours > 0;

  const exportWorksheet = () => {
    if (totals.lines.length === 0) {
      toast.error('No hours logged against this variation yet');
      return;
    }
    downloadCSV(
      `variation-${slugify(projectName)}-${slugify(v.description)}.csv`,
      variationWorksheetCSV(totals.lines, canSeeFinancials),
    );
  };

  return (
    <Card className={cn(unbillable && 'border-destructive/50')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium leading-snug">{v.description}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={v.status} amount={v.amount} canSeeFinancials={canSeeFinancials} />
              {unbillable && (
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  Unbillable — {formatHours(totals.labourHours)} logged
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Added {format(parseISO(v.created_at.slice(0, 10)), 'd MMM')}
              </span>
            </div>
            {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
          </div>
          {canSeeFinancials && v.amount != null && (
            <p className="shrink-0 font-semibold tabular-nums">
              {formatCurrency(v.amount, { whole: true })}
            </p>
          )}
        </div>

        {/* Rollup — the headline numbers, always visible. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-secondary/50 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{formatHours(totals.labourHours)}</span>
            <span className="text-muted-foreground">labour</span>
          </span>
          {canSeeFinancials && totals.materialCost > 0 && (
            <span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(totals.materialCost)}
              </span>{' '}
              <span className="text-muted-foreground">materials</span>
            </span>
          )}
          {canSeeFinancials && totals.labourRevenue > 0 && (
            <span className="text-muted-foreground">
              worth {formatCurrency(totals.labourRevenue, { whole: true })} at charge-out
            </span>
          )}
          {hasWork && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="ml-auto flex items-center gap-1 font-medium text-foreground hover:underline"
              data-testid={`variation-toggle-${v.id}`}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {open ? 'Hide' : 'Show'} breakdown
            </button>
          )}
        </div>

        {/* The ledger — who, what day, how long, what they did. */}
        {open && hasWork && (
          <div className="space-y-2" data-testid={`variation-ledger-${v.id}`}>
            {totals.lines.length > 0 && (
              <div className="divide-y rounded-md border text-sm">
                {totals.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {format(parseISO(l.date), 'EEE d MMM')}
                    </span>
                    <span className="w-16 shrink-0 font-medium">{l.workerName}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {l.task ?? l.notes ?? '—'}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold">
                      {l.hours.toFixed(1)}h
                    </span>
                    {canSeeFinancials && (
                      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(l.revenue, { whole: true })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {totals.materials.length > 0 && (
              <div className="divide-y rounded-md border text-sm">
                {totals.materials.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {format(parseISO(m.entry_date), 'EEE d MMM')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{m.description}</span>
                    {canSeeFinancials && (
                      <span className="shrink-0 tabular-nums font-semibold">
                        {formatCurrency(m.cost)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {v.status !== 'rejected' && (
            <Button size="sm" variant="outline" className="h-7" asChild>
              <Link to={`/calendar?log=today&project=${projectId}&variation=${v.id}`}>
                <Plus className="h-3 w-3" /> Log time
              </Link>
            </Button>
          )}
          {totals.lines.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={exportWorksheet}
              data-testid={`variation-export-${v.id}`}
            >
              <Download className="h-3 w-3" /> Export
            </Button>
          )}
          {/* Admin: price/edit + approve/reject. Manager sees neither. */}
          {canSeeFinancials && onEdit && (
            <Button size="sm" variant="outline" className="h-7" onClick={onEdit}>
              <Pencil className="h-3 w-3" /> {v.amount == null ? 'Price' : 'Edit'}
            </Button>
          )}
          {canSeeFinancials && v.status === 'pending' && onSetStatus && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950"
                onClick={() => onSetStatus(v.id, 'approved')}
              >
                <Check className="h-3 w-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => onSetStatus(v.id, 'rejected')}
              >
                <X className="h-3 w-3" /> Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * State has to be unambiguous — the whole point of the feature is knowing which
 * work has been done but not yet turned into money. A pending variation reads
 * differently depending on whether it has a price on it yet.
 */
function StatusBadge({
  status,
  amount,
  canSeeFinancials,
}: {
  status: VariationStatus;
  amount: number | null;
  canSeeFinancials: boolean;
}) {
  const base = 'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';
  if (status === 'approved') {
    return (
      <span className={cn(base, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
        Approved
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className={cn(base, 'bg-muted text-muted-foreground line-through')}>Rejected</span>
    );
  }
  // Pending. Admin distinguishes "I haven't priced it" from "priced, waiting on
  // the client"; the manager just sees that Alex hasn't finished with it.
  if (canSeeFinancials && amount == null) {
    return (
      <span className={cn(base, 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
        Needs pricing
      </span>
    );
  }
  return (
    <span className={cn(base, 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
      {canSeeFinancials ? 'Awaiting approval' : 'With Alex'}
    </span>
  );
}

function VariationDialog({
  open,
  onClose,
  canSeeFinancials,
  variation,
  loggedTotals,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  canSeeFinancials: boolean;
  variation?: ProjectVariation;
  /** Work already logged — shown while pricing so Alex prices off real hours. */
  loggedTotals?: VariationTotals;
  onSubmit: (input: AddInput) => Promise<void>;
}) {
  const isEdit = !!variation;
  const [description, setDescription] = useState(variation?.description ?? '');
  const [amount, setAmount] = useState(variation?.amount != null ? String(variation.amount) : '');
  const [notes, setNotes] = useState(variation?.notes ?? '');
  const [approvedAlready, setApprovedAlready] = useState(false);

  const submit = async () => {
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }
    // Manager: never sets a dollar amount — logs it for Alex to price.
    const amt = canSeeFinancials && amount ? Number.parseFloat(amount) : null;
    if (amt != null && (!Number.isFinite(amt) || amt === 0)) {
      toast.error('Enter a non-zero amount, or leave it blank to price later');
      return;
    }
    await onSubmit({
      description: description.trim(),
      amount: amt,
      notes: notes.trim() || null,
      status: approvedAlready ? 'approved' : 'pending',
    });
    if (!isEdit) {
      setDescription('');
      setAmount('');
      setNotes('');
      setApprovedAlready(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit variation' : 'Add variation'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Description *</Label>
            <Input
              placeholder="e.g. Sick bay — repaint walls + trim"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {/* Price off what was actually spent, not off memory. */}
          {canSeeFinancials && loggedTotals && loggedTotals.labourHours > 0 && (
            <div className="rounded-md border bg-secondary/50 px-3 py-2 text-xs">
              <p className="font-medium">
                {formatHours(loggedTotals.labourHours)} labour
                {loggedTotals.materialCost > 0 &&
                  ` · ${formatCurrency(loggedTotals.materialCost)} materials`}{' '}
                logged so far
              </p>
              <p className="text-muted-foreground">
                Worth {formatCurrency(loggedTotals.labourRevenue, { whole: true })} at charge-out ·
                cost {formatCurrency(loggedTotals.labourCost + loggedTotals.materialCost, { whole: true })}
              </p>
            </div>
          )}
          {canSeeFinancials ? (
            <div className="space-y-1.5">
              <Label>Amount $ (optional — leave blank to price later)</Label>
              <Input
                type="number"
                step="50"
                placeholder="2500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          ) : (
            <p className="rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              Alex will price and approve this. Just describe the extra work and add any notes —
              then log your hours against it as you go.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              placeholder={
                canSeeFinancials
                  ? 'Optional: who approved, date confirmed, etc.'
                  : 'Optional: who asked, where, any detail'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {canSeeFinancials && !isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={approvedAlready}
                onChange={(e) => setApprovedAlready(e.target.checked)}
              />
              Client has already approved — mark approved immediately
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{isEdit ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
