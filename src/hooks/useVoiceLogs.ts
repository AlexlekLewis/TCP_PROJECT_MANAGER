import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { useDemoStore } from './useDemoStore';
import type { VoiceLog } from '@/types/db';

export function useVoiceLogsDemo() {
  const store = useDemoStore();
  return useQuery<VoiceLog[]>({
    queryKey: queryKeys.voiceLogs(),
    queryFn: async () => {
      if (env.demoMode) return store.voiceLogs;
      const { data, error } = await supabase
        .from('voice_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as VoiceLog[];
    },
  });
}
