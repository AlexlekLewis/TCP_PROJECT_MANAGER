import { useState } from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useVoiceLog } from '@/hooks/useVoiceLog';
import { useProjects } from '@/hooks/useProjects';
import { useWorkers } from '@/hooks/useWorkers';
import { resolveParsedVoice, type ResolvedVoiceResult } from '@/lib/voiceParser';
import { VoiceReview } from '@/components/features/VoiceReview';
import { cn } from '@/lib/utils';

export default function VoiceLogPage() {
  const { data: workers = [] } = useWorkers();
  const { data: projects = [] } = useProjects();
  const activeProjects = projects.filter((p) => p.status === 'active');
  const [review, setReview] = useState<{
    transcript: string;
    resolved: ResolvedVoiceResult;
  } | null>(null);

  const { state, transcript, error, supported, start, stop, cancel } = useVoiceLog({
    onResult: (t, parsed) => {
      const resolved = resolveParsedVoice(parsed, workers, activeProjects);
      setReview({ transcript: t, resolved });
    },
    onError: (msg) => toast.error(msg),
  });

  if (review) {
    return (
      <VoiceReview
        transcript={review.transcript}
        initial={review.resolved}
        workers={workers}
        projects={activeProjects}
        onCancel={() => {
          setReview(null);
          cancel();
        }}
        onSaved={() => {
          setReview(null);
          cancel();
          toast.success('Entries saved');
        }}
      />
    );
  }

  const recording = state === 'recording';
  const busy = state === 'transcribing' || state === 'parsing';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Voice log</h1>
        <p className="text-sm text-muted-foreground">
          Say what happened — who was on which site for how long, and any materials.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record</CardTitle>
          <CardDescription>
            Example: “Jerry was at Northcote High School for 10 hours on Monday. Pierce did Preston for 3 then Belmore for 4.5.”
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5 py-10">
          {!supported && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              Voice recognition isn't available on this browser. Use manual entry.
            </p>
          )}

          <button
            type="button"
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            onClick={recording ? stop : start}
            disabled={!supported || busy}
            className={cn(
              'flex h-24 w-24 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all',
              recording
                ? 'bg-destructive animate-pulse-record'
                : 'bg-primary hover:scale-105',
              (!supported || busy) && 'opacity-50',
            )}
          >
            {recording ? <Square className="h-8 w-8" /> : <Mic className="h-10 w-10" />}
          </button>

          <div className="min-h-[5rem] w-full max-w-md rounded-md border bg-muted/40 p-3 text-sm">
            {transcript || (
              <span className="text-muted-foreground">
                {recording
                  ? 'Listening…'
                  : busy
                    ? state === 'parsing'
                      ? 'Parsing with Claude…'
                      : 'Transcribing…'
                    : 'Your words will appear here.'}
              </span>
            )}
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <MicOff className="h-4 w-4" />
              {error}
            </p>
          )}

          {recording && (
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
