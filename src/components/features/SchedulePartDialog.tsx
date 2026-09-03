import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Scissors, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { defaultPartLabel, partMidpoint } from '@/lib/schedule';
import type { ProjectScheduleBlock } from '@/types/db';

export interface PartDraft {
  label: string;
  start: string;
  end: string;
}

/**
 * Type the dates instead of dragging them. Dragging is good for "roughly
 * there"; this is for "the scaffold comes down on the 14th" — and it's the
 * only way to hit an exact day at the 6- and 12-month zooms, where a drag
 * snaps to whole weeks.
 */
export function SchedulePartDialog({
  open,
  part,
  index,
  projectName,
  partCount,
  onSave,
  onSplit,
  onDelete,
  onClose,
}: {
  open: boolean;
  part: ProjectScheduleBlock | null;
  /** Position among the project's parts, for the "Part A" placeholder. */
  index: number;
  projectName: string;
  partCount: number;
  onSave: (draft: PartDraft) => void;
  onSplit: (atIso: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PartDraft>({ label: '', start: '', end: '' });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!part) return;
    setDraft({ label: part.label ?? '', start: part.start_date, end: part.end_date });
    setConfirmingDelete(false);
  }, [part]);

  const dirty =
    !!part &&
    (draft.label !== (part.label ?? '') ||
      draft.start !== part.start_date ||
      draft.end !== part.end_date);

  const error = useMemo(() => {
    if (!draft.start || !draft.end) return 'Both dates are needed.';
    if (draft.end < draft.start) return 'The finish date is before the start date.';
    return null;
  }, [draft.start, draft.end]);

  const days = useMemo(() => {
    if (error) return null;
    return differenceInCalendarDays(parseISO(draft.end), parseISO(draft.start)) + 1;
  }, [draft.start, draft.end, error]);

  // Only offered when the part is long enough to divide, and only on the
  // saved dates — splitting an unsaved edit would silently discard it.
  const splitAt = useMemo(() => {
    if (!part || dirty) return null;
    return partMidpoint(part);
  }, [part, dirty]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit part</DialogTitle>
          <DialogDescription>
            {projectName}
            {partCount > 1 ? ` · part ${index + 1} of ${partCount}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="part-label">Name</Label>
            <Input
              id="part-label"
              value={draft.label}
              placeholder={defaultPartLabel(index)}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Optional — call it what the crew calls it ("Scaffold week", "Return visit").
              Left blank it reads “{defaultPartLabel(index)}”.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="part-start">Starts</Label>
              <Input
                id="part-start"
                type="date"
                value={draft.start}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-end">Finishes</Label>
              <Input
                id="part-end"
                type="date"
                value={draft.end}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {format(parseISO(draft.start), 'EEE d MMM yyyy')} →{' '}
              {format(parseISO(draft.end), 'EEE d MMM yyyy')} ·{' '}
              <span className="font-medium text-foreground">
                {days} day{days === 1 ? '' : 's'}
              </span>
            </p>
          )}

          {splitAt && (
            <div className="rounded-md border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                Job pausing partway through? Split it and drag the second half to when you
                actually come back.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onSplit(splitAt)}
              >
                <Scissors className="h-3.5 w-3.5" /> Split at {format(parseISO(splitAt), 'd MMM')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {partCount === 1 ? 'Takes the job off the calendar.' : 'Remove this part?'}
              </span>
              <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
                Remove
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove part
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!!error || !dirty} onClick={() => onSave(draft)}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
