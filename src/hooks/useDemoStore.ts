// React hook that re-renders when the demo in-memory store changes.
// This lets every list in the UI reflect demo-mode mutations instantly.

import { useSyncExternalStore } from 'react';
import { demoStore } from '@/lib/demoStore';

export function useDemoStore() {
  const snapshot = useSyncExternalStore(
    (cb) => demoStore.subscribe(cb),
    () => demoStore,
    () => demoStore,
  );
  return snapshot;
}
