import { Lock, Unlock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useVoiceLogsDemo } from '@/hooks/useVoiceLogs';
import { useUnlockWeek, useWeekLocks } from '@/hooks/useWeekLocks';
import { weekLabel } from '@/lib/dates';
import { toast } from 'sonner';

export default function AdminPage() {
  const { data: locks = [] } = useWeekLocks();
  const { data: voiceLogs = [] } = useVoiceLogsDemo();
  const unlockWeek = useUnlockWeek();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Week locks, voice-log audit, and settings.
        </p>
      </div>

      {/* Week locks */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Locked weeks</h2>
        {locks.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No locks set. Use the Lock week button on Reports.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {[...locks]
                .sort((a, b) => (a.week_start < b.week_start ? 1 : -1))
                .map((l) => (
                  <div key={l.week_start} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <Lock className="h-4 w-4 text-warning" />
                    <div className="flex-1">
                      <p className="font-medium">{weekLabel(l.week_start)}</p>
                      <p className="text-xs text-muted-foreground">
                        locked {new Date(l.locked_at).toLocaleString('en-AU')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await unlockWeek.mutateAsync(l.week_start);
                        toast.success('Week unlocked');
                      }}
                    >
                      <Unlock className="h-3.5 w-3.5" /> Unlock
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Voice logs audit */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Voice log audit</h2>
        {voiceLogs.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No voice logs yet. Try the mic on the Voice log page.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {voiceLogs.map((v) => (
                <div key={v.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {v.id.slice(-6)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString('en-AU')}
                    </span>
                  </div>
                  <p className="italic text-muted-foreground">“{v.transcript}”</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
