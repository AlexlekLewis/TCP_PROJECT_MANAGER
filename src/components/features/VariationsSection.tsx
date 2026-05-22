import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
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

interface Props {
  projectId: string;
  variations: ProjectVariation[];
  approvedTotal: number;
  onAdd: (input: { description: string; amount: number; notes: string | null; status: VariationStatus }) => Promise<void>;
  onSetStatus: (id: string, status: VariationStatus) => Promise<void>;
}

/**
 * Variations = extra scope a client signs off mid-job ("while you're here,
 * can you do the bathroom too?"). Only `approved` rolls into the quote.
 * Admin-only at the DB layer; this component never renders for manager.
 */
export function VariationsSection({
  variations,
  approvedTotal,
  onAdd,
  onSetStatus,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const sorted = [...variations].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Variations</h2>
        {approvedTotal > 0 && (
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
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(v.amount, { whole: true })}
                  </p>
                  <StatusBadge status={v.status} />
                </div>
                {v.status === 'pending' && (
                  <div className="flex flex-col gap-1">
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
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddVariationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await onAdd(input);
          setAddOpen(false);
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

function AddVariationDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { description: string; amount: number; notes: string | null; status: VariationStatus }) => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [approvedAlready, setApprovedAlready] = useState(false);

  const submit = async () => {
    const amt = Number.parseFloat(amount);
    if (!description.trim() || !amt) {
      toast.error('Description and amount required');
      return;
    }
    await onSubmit({
      description: description.trim(),
      amount: amt,
      notes: notes.trim() || null,
      status: approvedAlready ? 'approved' : 'pending',
    });
    setDescription('');
    setAmount('');
    setNotes('');
    setApprovedAlready(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add variation</DialogTitle>
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
          <div className="space-y-1.5">
            <Label>Amount $ *</Label>
            <Input
              type="number"
              step="50"
              placeholder="2500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional: who approved, date confirmed, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approvedAlready}
              onChange={(e) => setApprovedAlready(e.target.checked)}
            />
            Client has already approved — mark approved immediately
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
