import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
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
import { toast } from 'sonner';
import type { ProjectVariation, VariationStatus } from '@/types/db';

interface AddInput {
  description: string;
  amount: number | null;
  notes: string | null;
  status: VariationStatus;
}

interface Props {
  projectId: string;
  variations: ProjectVariation[];
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
 * Both roles can add one; pricing and approval are admin-only.
 */
export function VariationsSection({
  variations,
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
            No variations on this project yet. Add one when the client signs off extra scope.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {sorted.map((v) => (
              <div key={v.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">{v.description}</p>
                  {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleDateString('en-AU')}
                  </p>
                </div>
                <div className="text-right">
                  {canSeeFinancials &&
                    (v.amount != null ? (
                      <p className="font-semibold tabular-nums">
                        {formatCurrency(v.amount, { whole: true })}
                      </p>
                    ) : (
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Unpriced
                      </p>
                    ))}
                  <StatusBadge status={v.status} />
                </div>
                {/* Admin: price/edit + approve/reject. Manager sees neither. */}
                {canSeeFinancials && (
                  <div className="flex flex-col gap-1">
                    {onUpdate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => setEditing(v)}
                      >
                        <Pencil className="h-3 w-3" /> {v.amount == null ? 'Price' : 'Edit'}
                      </Button>
                    )}
                    {v.status === 'pending' && onSetStatus && (
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
                )}
              </div>
            ))}
          </CardContent>
        </Card>
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

function StatusBadge({ status }: { status: VariationStatus }) {
  if (status === 'approved') {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Approved
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-through">
        Rejected
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
      Pending
    </span>
  );
}

function VariationDialog({
  open,
  onClose,
  canSeeFinancials,
  variation,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  canSeeFinancials: boolean;
  variation?: ProjectVariation;
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
              placeholder="e.g. Bathroom — repaint walls + trim"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
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
              Alex will price and approve this. Just describe the extra work and add any notes.
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
