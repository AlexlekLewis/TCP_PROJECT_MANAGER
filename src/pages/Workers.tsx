import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateWorker, useUpdateWorker, useWorkers } from '@/hooks/useWorkers';
import { formatCurrency } from '@/lib/currency';
import type { Worker } from '@/types/db';

export default function WorkersPage() {
  const { data: workers = [] } = useWorkers();
  const [editing, setEditing] = useState<Worker | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Workers</h1>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add worker
        </Button>
      </div>

      {workers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No workers yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {workers.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
                  {w.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{w.name}</p>
                    {!w.active && <Badge variant="secondary">inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Number(w.cost_rate ?? 0) > 0 && (
                      <>cost {formatCurrency(w.cost_rate, { whole: false })}/h · </>
                    )}
                    {Number(w.weekly_wage ?? 0) > 0 && (
                      <>{formatCurrency(w.weekly_wage, { whole: true })}/wk · </>
                    )}
                    charge {formatCurrency(w.charge_out_rate, { whole: false })}/h
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(w)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <WorkerDialog open={creating} onClose={() => setCreating(false)} />
      <WorkerDialog open={!!editing} onClose={() => setEditing(null)} worker={editing ?? undefined} />
    </div>
  );
}

function WorkerDialog({
  open,
  onClose,
  worker,
}: {
  open: boolean;
  onClose: () => void;
  worker?: Worker;
}) {
  const create = useCreateWorker();
  const update = useUpdateWorker();
  const [name, setName] = useState(worker?.name ?? '');
  const [costRate, setCostRate] = useState(String(worker?.cost_rate ?? ''));
  const [weeklyWage, setWeeklyWage] = useState(String(worker?.weekly_wage ?? ''));
  const [chargeOut, setChargeOut] = useState(String(worker?.charge_out_rate ?? '65'));
  const [active, setActive] = useState(worker?.active ?? true);

  const submit = async () => {
    if (!name.trim()) return;
    const patch = {
      name,
      cost_rate: Number.parseFloat(costRate) || 0,
      weekly_wage: Number.parseFloat(weeklyWage) || 0,
      charge_out_rate: Number.parseFloat(chargeOut) || 65,
      active,
    };
    try {
      if (worker) {
        await update.mutateAsync({ id: worker.id, patch });
        toast.success('Worker updated');
      } else {
        await create.mutateAsync(patch);
        toast.success('Worker added');
      }
      onClose();
      setName('');
      setCostRate('');
      setWeeklyWage('');
      setChargeOut('65');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{worker ? 'Edit worker' : 'Add worker'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Cost rate $/h</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={costRate}
                onChange={(e) => setCostRate(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">What you pay per hour.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Fixed weekly $</Label>
              <Input
                type="number"
                step="50"
                min="0"
                value={weeklyWage}
                onChange={(e) => setWeeklyWage(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Owner draw / apprentice stipend.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Charge-out $/h</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={chargeOut}
                onChange={(e) => setChargeOut(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Billed to client.</p>
            </div>
          </div>
          {worker && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{worker ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
