import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateProject, useUpdateProject } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import type { Project, ProjectStatus, QuoteType } from '@/types/db';

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project;
}

const COLOR_PRESETS = [
  { label: 'Platinum', value: '#8b8b94' },
  { label: 'Silver', value: '#a8a8b0' },
  { label: 'Ash', value: '#c9c9d0' },
  { label: 'Cloud', value: '#e8e8ee' },
  { label: 'Sage', value: '#7ba48f' },
  { label: 'Rose', value: '#c08a8a' },
  { label: 'Ochre', value: '#c8a46a' },
];

export function ProjectForm({ open, onClose, project }: Props) {
  const isEdit = !!project;
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const create = useCreateProject();
  const update = useUpdateProject();
  const [form, setForm] = useState<Partial<Project>>(() => project ?? defaultForm(isAdmin));

  const submit = async () => {
    if (!form.name) {
      toast.error('Name is required');
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: project!.id, patch: form });
        toast.success('Project updated');
      } else {
        // Manager-created projects are always drafts requiring admin review.
        const payload = isAdmin
          ? form
          : { ...form, needs_admin_review: true, quote_type: 'fixed_quote' as QuoteType };
        await create.mutateAsync(
          payload as Omit<Project, 'id' | 'created_at' | 'updated_at'>,
        );
        toast.success(
          isAdmin
            ? 'Project created'
            : 'Draft saved — Alex will review and add the quote details',
        );
      }
      onClose();
      setForm(defaultForm(isAdmin));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const quoteType = (form.quote_type ?? 'fixed_quote') as QuoteType;
  const showQuoteFields = isAdmin && quoteType === 'fixed_quote';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit project' : isAdmin ? 'New project' : 'New project (draft)'}
          </DialogTitle>
        </DialogHeader>

        {!isAdmin && !isEdit && (
          <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/60 dark:text-amber-100">
            Just the basics — Alex will review this and fill in the quote, budget, and target profit before payroll runs.
          </div>
        )}

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Northcote High School"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input
                value={form.client_name ?? ''}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              />
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status ?? 'active'}
                  onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Job type</Label>
              <Select
                value={quoteType}
                onValueChange={(v) => setForm({ ...form, quote_type: v as QuoteType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_quote">Fixed quote</SelectItem>
                  <SelectItem value="time_and_materials">Time &amp; materials</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Fixed quote uses the dollar fields below for margin tracking. Time &amp; materials bills hours × charge-out, no fixed total.
              </p>
            </div>
          )}

          {showQuoteFields && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Quote $</Label>
                <Input
                  type="number"
                  step="100"
                  value={form.quoted_price ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, quoted_price: e.target.value ? +e.target.value : null })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quoted hours</Label>
                <Input
                  type="number"
                  step="1"
                  value={form.quoted_hours ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, quoted_hours: e.target.value ? +e.target.value : null })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Materials budget $</Label>
                <Input
                  type="number"
                  step="50"
                  value={form.materials_budget ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, materials_budget: e.target.value ? +e.target.value : null })
                  }
                />
              </div>
            </div>
          )}

          {isAdmin && quoteType === 'time_and_materials' && (
            <div className="space-y-1.5">
              <Label>Quoted hours (optional estimate)</Label>
              <Input
                type="number"
                step="1"
                value={form.quoted_hours ?? ''}
                onChange={(e) =>
                  setForm({ ...form, quoted_hours: e.target.value ? +e.target.value : null })
                }
              />
              <p className="text-xs text-muted-foreground">
                No fixed quote on T&amp;M jobs — revenue is hours billed × charge-out rate. Quoted hours is just a rough scope estimate so the Hours-used % gauge has something to compare against.
              </p>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Target profit $ (optional)</Label>
              <Input
                type="number"
                step="100"
                min="0"
                placeholder="What you expect to clear on this job after all costs"
                value={form.target_profit ?? ''}
                onChange={(e) =>
                  setForm({ ...form, target_profit: e.target.value ? +e.target.value : null })
                }
              />
              <p className="text-xs text-muted-foreground">
                Used on the project detail page to show on-track / at-risk / over-budget as the job progresses.
              </p>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Daily hours warning per worker (optional)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="14"
                placeholder="e.g. 8 — flag if a worker logs over this on this job in a day"
                value={form.daily_hours_warning ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    daily_hours_warning: e.target.value ? +e.target.value : null,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Soft cap — the day-entry screen shows a flag when exceeded, but the save still goes through.
              </p>
            </div>
          )}

          {isAdmin && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.start_date ?? ''}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected end</Label>
                <Input
                  type="date"
                  value={form.end_date ?? ''}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value || null })}
                />
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Color tag</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, color_tag: c.value })}
                    className={
                      'flex items-center gap-2 rounded-md border px-2 py-1 text-xs ' +
                      (form.color_tag === c.value ? 'ring-2 ring-ring' : '')
                    }
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: c.value }}
                    />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isAdmin && isEdit && project?.needs_admin_review && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/60 dark:text-amber-100">
              <strong>Draft awaiting review.</strong> Tick the box below to mark this project complete (quote + budget filled in, ready for payroll).
              <label className="mt-2 flex items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  checked={form.needs_admin_review === false}
                  onChange={(e) => setForm({ ...form, needs_admin_review: !e.target.checked })}
                />
                Mark as reviewed
              </label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            {isEdit ? 'Save' : isAdmin ? 'Create project' : 'Save draft for review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultForm(isAdmin: boolean): Partial<Project> {
  return {
    name: '',
    client_name: null,
    address: null,
    quoted_price: null,
    quoted_hours: null,
    materials_budget: null,
    target_profit: null,
    quote_type: 'fixed_quote',
    needs_admin_review: !isAdmin,
    daily_hours_warning: null,
    status: 'active',
    color_tag: '#a8a8b0',
    start_date: null,
    end_date: null,
    notes: null,
  };
}
