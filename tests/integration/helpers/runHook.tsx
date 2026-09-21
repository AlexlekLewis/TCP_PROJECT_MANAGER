/**
 * Run the app's real TanStack Query hooks against the local stack.
 *
 * The point of the suite is that the *hook's own* supabase-js chain — the
 * `.insert(...).select('id').single()` and `.update(...).eq('id', id)` that
 * broke on a real database — is what reaches Postgres. So the tests render
 * the hooks rather than re-typing their queries, which would drift.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // A retried 403 would hide which call failed and slow every negative test.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

/** Render a mutation hook and drive it; resolves/rejects exactly as it does. */
export async function runMutation<THook, TResult>(
  hook: () => THook,
  use: (h: THook) => Promise<TResult>,
): Promise<TResult> {
  const { wrapper, queryClient } = makeWrapper();
  const { result, unmount } = renderHook(hook, { wrapper });
  try {
    let out: TResult;
    await act(async () => {
      out = await use(result.current);
    });
    return out!;
  } finally {
    unmount();
    queryClient.clear();
  }
}

interface QueryLike<T> {
  data: T | undefined;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
}

/** Render a query hook and wait for it to settle; throws what it threw. */
export async function runQuery<T>(hook: () => QueryLike<T>): Promise<T> {
  const { wrapper, queryClient } = makeWrapper();
  const { result, unmount } = renderHook(hook, { wrapper });
  try {
    await waitFor(
      () => {
        if (!result.current.isSuccess && !result.current.isError) {
          throw new Error('query still pending');
        }
      },
      { timeout: 15_000 },
    );
    if (result.current.isError) throw result.current.error;
    return result.current.data as T;
  } finally {
    unmount();
    queryClient.clear();
  }
}
