import {
  navigatorLock,
  NavigatorLockAcquireTimeoutError,
} from "@supabase/supabase-js";

/**
 * A wrapper around Supabase's default `navigatorLock` that never lets a
 * lock-acquisition timeout escape as an uncaught exception.
 *
 * Supabase serializes auth-token access (getSession / refreshSession /
 * background auto-refresh) behind a Web Locks lock named
 * `lock:sb-<ref>-auth-token`. When it can't acquire that lock in time it throws
 * a `NavigatorLockAcquireTimeoutError` (the classic
 * `Acquiring an exclusive Navigator LockManager lock "…" timed out waiting
 * 10000ms`). We hammer that lock constantly — the axios request interceptor
 * reads the session on every authenticated call, `getAccessToken` reads it on
 * every token lookup, and Supabase's own timer refreshes it — so a
 * hung/backgrounded tab holding the lock, or a burst of concurrent callers, can
 * make an acquisition time out. Crucially, some of those acquisitions
 * (Supabase's internal auto-refresh tick, the `onAuthStateChange` bootstrap)
 * are not wrapped by any of our try/catch blocks, so the thrown timeout
 * surfaces as an uncaught exception and breaks sign-in / session refresh, with
 * a page reload as the only workaround.
 *
 * We delegate to the stock `navigatorLock` so its orphaned-lock recovery
 * (stealing a lock left behind by e.g. a React Strict Mode double-mount) still
 * applies, and only step in when it gives up: rather than propagate the
 * timeout, we degrade to a best-effort unguarded run of the operation. Losing
 * the cross-context lock briefly is far less harmful than a fatal auth error —
 * within a tab, concurrent refreshes are already deduped (see
 * `refreshSessionOnce` in apiClient), and no reload is needed to recover.
 */

function isAcquireTimeout(err: unknown): boolean {
  if (err instanceof NavigatorLockAcquireTimeoutError) {
    return true;
  }
  // The base LockAcquireTimeoutError isn't exported from supabase-js, so fall
  // back to its documented `isAcquireTimeout` marker (set on all timeout errors).
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { isAcquireTimeout?: unknown }).isAcquireTimeout === true
  );
}

export async function resilientNavigatorLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  // No Web Locks API (older browsers / some embedded webviews): the stock
  // navigatorLock throws on access, so run unguarded like its own fallback.
  const locks =
    typeof globalThis !== "undefined" ? globalThis.navigator?.locks : undefined;
  if (!locks) {
    return await fn();
  }

  try {
    return await navigatorLock(name, acquireTimeout, fn);
  } catch (err) {
    if (!isAcquireTimeout(err)) {
      throw err;
    }
    console.warn(
      `[Supabase] Auth lock "${name}" not acquired within ${acquireTimeout}ms; proceeding without it`,
    );
    return await fn();
  }
}
