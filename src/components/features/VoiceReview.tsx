import { useState } from 'react';
import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Project, Worker } from '@/types/db';
import type { ResolvedEntry, ResolvedMaterial, ResolvedVoiceResult } from '@/lib/voiceParser';
import { useCreateTimeEntry } from '@/hooks/useTimeEntries';
import { useCreateMaterialEntry } from '@/hooks/useMaterialEntries';
import { demoStore } from '@/lib/demoStore';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { validateHours } from '@/lib/hours';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

interface Props {
  transcript: string;
  initial: ResolvedVoiceResult;
  workers: Worker[];
  projects: Project[];
  onCancel: () => void;
  onSaved: () => void;
}

export function VoiceReview({ transcript, initial, workers, projects, onCancel, onSaved }: Props) {
  const [entries, setEntries] = useState(initial.entries);
  const [materials, setMaterials] = useState(initial.materials);
  // Demo-mode falls back to per-row inserts via these hooks; in real mode the
  // single atomic RPC below is used and these are not invoked.
  const createTE = useCreateTimeEntry();
  const createME = useCreateMaterialEntry();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const anyUnresolved =
    entries.some((e) => !e.worker_id || !e.project_id) ||
    materials.some((m) => !m.project_id);

  const save = async () => {
    const invalid = entries.find((e) => !validateHours(e.hours).ok);
    if (invalid) {
      toast.error(`Hours out of range on "${invalid.source_phrase}"`);
      return;
    }
    setSaving(true);
    try {
      if (env.demoMode) {
        // Demo: write the voice log + per-row inserts to the in-memory store
        // so the review UX renders identically without a network round trip.
        demoStore.createVoiceLog(transcript, { entries, materials });
        for (const e of entries) {
          if (!e.worker_id || !e.project_id) continue;
          await createTE.mutateAsync({
            entry_date: e.date,
            worker_id: e.worker_id,
            project_id: e.project_id,
            hours: e.hours,
            task: null,
            notes: e.notes ?? null,
            ai_source_id: null,
          });
        }
        for (const m of materials) {
          if (!m.project_id) continue;
          await createME.mutateAsync({
            entry_date: m.date,
            project_id: m.project_id,
            description: m.description,
            cost: m.cost,
            supplier: null,
            ai_source_id: null,
          });
        }
      } else {
        // Production: one atomic SECURITY DEFINER RPC writes voice_logs +
        // every time_entry + every material_entry in a single transaction.
        // ai_source_id on every entry is wired by the RPC to the voice_log row.
        const { data: voiceLogId, error } = await supabase.rpc('save_voice_log_entries', {
          transcript,
          parsed: { entries, materials },
          entries: entries
            .filter((e) => e.worker_id && e.project_id)
            .map((e) => ({
              date: e.date,
              worker_id: e.worker_id,
              project_id: e.project_id,
              hours: e.hours,
              notes: e.notes ?? null,
            })),
          materials: materials
            .filter((m) => m.project_id)
            .map((m) => ({
              date: m.date,
              project_id: m.project_id,
              description: m.description,
              cost: m.cost,
              supplier: null,
            })),
        });
        if (error) throw error;
        if (!voiceLogId) throw new Error('Voice log save returned no id');
        // Invalidate every collection the RPC may have touched
        qc.invalidateQueries({ queryKey: queryKeys.timeEntries() });
        qc.invalidateQueries({ queryKey: queryKeys.materialEntries() });
        qc.invalidateQueries({ queryKey: queryKeys.voiceLogs() });
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review entries</h1>
        <p className="text-sm text-muted-foreground">
          Check the parsed entries before saving. Low-confidence rows are highlighted.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Transcript</p>
          <p className="text-sm italic">“{transcript}”</p>
        </CardContent>
      </Card>

      {initial.unresolved.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div>
            <p className="font-medium text-warning">Unresolved phrases</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {initial.unresolved.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Time entries</h2>
          <div className="space-y-2">
            {entries.map((e, i) => (
              <EntryRow
                key={i}
                entry={e}
                workers={workers}
                projects={projects}
                onChange={(patch) =>
                  setEntries((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
                  )
                }
                onRemove={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        </section>
      )}

      {materials.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Materials</h2>
          <div className="space-y-2">
            {materials.map((m, i) => (
              <MaterialRow
                key={i}
                material={m}
                projects={projects}
                onChange={(patch) =>
                  setMaterials((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
                  )
                }
                onRemove={() => setMaterials((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        </section>
      )}

      {entries.length === 0 && materials.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing parsed. Try again or add entries manually from the week calendar.
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-4 flex gap-2 rounded-md border bg-background/95 p-3 shadow-md backdrop-blur">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          className="ml-auto"
          onClick={save}
          disabled={saving || anyUnresolved || (entries.length === 0 && materials.length === 0)}
        >
          <Check className="h-4 w-4" />
          {saving ? 'Saving…' : 'Confirm & save'}
        </Button>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  workers,
  projects,
  onChange,
  onRemove,
}: {
  entry: ResolvedEntry;
  workers: Worker[];
  projects: Project[];
  onChange: (patch: Partial<ResolvedEntry>) => void;
  onRemove: () => void;
}) {
  const needsReview = entry.needs_review || !entry.worker_id || !entry.project_id;
  return (
    <Card className={needsReview ? 'border-warning' : ''}>
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {needsReview && (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" /> Review
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            confidence {(entry.confidence * 100).toFixed(0)}%
          </span>
          <span className="ml-auto italic text-xs text-muted-foreground">
            “{entry.source_phrase}”
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_0.6fr_0.6fr_auto]">
          <Select
            value={entry.worker_id ?? ''}
            onValueChange={(v) => onChange({ worker_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Worker" />
            </SelectTrigger>
            <SelectContent>
              {workers.filter((w) => w.active).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={entry.project_id ?? ''}
            onValueChange={(v) => onChange({ project_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={entry.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
          <Input
            type="number"
            step="0.25"
            value={entry.hours}
            onChange={(e) => onChange({ hours: Number.parseFloat(e.target.value) })}
          />
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialRow({
  material,
  projects,
  onChange,
  onRemove,
}: {
  material: ResolvedMaterial;
  projects: Project[];
  onChange: (patch: Partial<ResolvedMaterial>) => void;
  onRemove: () => void;
}) {
  const needsReview = material.needs_review || !material.project_id;
  return (
    <Card className={needsReview ? 'border-warning' : ''}>
      <CardContent className="space-y-2 p-3 text-sm">
        {needsReview && (
          <Badge variant="warning">
            <AlertTriangle className="mr-1 h-3 w-3" /> Review
          </Badge>
        )}
        <div className="grid gap-2 md:grid-cols-[1.2fr_1.4fr_0.6fr_0.6fr_auto]">
          <Select
            value={material.project_id ?? ''}
            onValueChange={(v) => onChange({ project_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={material.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
          <Input
            type="date"
            value={material.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
          <Input
            type="number"
            step="0.01"
            value={material.cost}
            onChange={(e) => onChange({ cost: Number.parseFloat(e.target.value) })}
          />
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
