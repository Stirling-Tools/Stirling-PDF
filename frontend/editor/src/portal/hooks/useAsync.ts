import { useEffect, useMemo, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Derived render flags for a panel backed by {@link useAsync}.
 *
 * Every async-driven section in the portal renders the same three-state shape:
 *
 *   - `isLoading` — first load, no data yet → render skeletons
 *   - `isEmpty` — fetch failed OR data is genuinely empty → render <EmptyState>
 *   - ready (neither flag set) — data is present → render the real UI
 *
 * Error and empty collapse into one branch on purpose: when there's no
 * backend yet, fetch failures should surface as an empty page rather than
 * an alarming error banner. The section header always renders regardless of
 * which branch is active.
 *
 * The `ready` state is intentionally NOT exposed as a flag — callers should
 * gate the ready branch on the actual data (`{events && events.length > 0
 * && …}`) so TypeScript can narrow `events` from `T[] | null` to `T[]`.
 */
export interface SectionFlags {
  isLoading: boolean;
  isEmpty: boolean;
}

export function deriveSectionFlags<T>(state: AsyncState<T>): SectionFlags {
  const { data, loading, error } = state;
  const dataIsEmpty =
    data === null || (Array.isArray(data) && data.length === 0);
  return {
    isLoading: loading && data === null,
    isEmpty: !loading && (error !== null || dataIsEmpty),
  };
}

/** Memoised variant for use inside components. */
export function useSectionFlags<T>(state: AsyncState<T>): SectionFlags {
  return useMemo(() => deriveSectionFlags(state), [state]);
}

/**
 * Lightweight loading-state hook for async functions. Cancels the in-flight
 * effect on unmount and on dependency change, so race conditions don't
 * resolve into stale state.
 *
 * Intentionally minimal — when we want caching, retries, and revalidation
 * we'll move this to TanStack Query or similar. For mocked data with sub-
 * second latency, this is enough.
 *
 * @example
 *   const { data, loading } = useAsync(() => fetchDeployedPipelines(), []);
 *   if (loading) return <Spinner />;
 *   if (!data) return null;
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fn(controller.signal)
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: err });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Callers own the dependency array — `fn` is intentionally not listed
    // here so the effect only re-runs when the caller asks it to.
  }, deps);

  return state;
}
