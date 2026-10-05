/**
 * Read-only Policies state for the editor's enforcement path. The backend
 * (`/api/v1/policies`) is the source of truth: we reconcile the local cache
 * against the stored policies on mount and whenever the signed-in user
 * changes. localStorage is a fast-render cache + offline fallback. Managing
 * policies (create/edit/pause/delete) lives on the portal Pipelines page, not
 * here; the editor only reads them and runs them.
 */

import { useState, useEffect, useRef } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";
import {
  loadPolicies,
  onPoliciesChange,
  updatePolicy,
  forgetPolicies,
} from "@app/services/policyStorage";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import {
  fetchPoliciesByCategory,
  decodedToState,
} from "@app/services/policyBackend";
import type { PoliciesByKey } from "@app/types/policies";

/** Cold-start reconcile retry budget + capped backoff (≈0.5s→5s, ~1 min total),
 *  enough to outlast a backend that starts a little after the frontend. */
const RECONCILE_MAX_ATTEMPTS = 15;
const reconcileRetryDelay = (attempt: number) =>
  Math.min(500 * 2 ** attempt, 5000);

// One in-flight reconcile read shared across mounts. A remount (or StrictMode
// double-invoke) would otherwise fire an identical fetch; the entry clears on
// settle so retries and later sessions still refetch. Keyed by session so a
// sign-in mid-flight cannot join the outgoing session's read and reconcile its
// team policies into the new one.
let reconcileInFlight: {
  sessionKey: string | null;
  promise: ReturnType<typeof fetchPoliciesByCategory>;
} | null = null;

function fetchPoliciesShared(
  sessionKey: string | null,
): ReturnType<typeof fetchPoliciesByCategory> {
  if (reconcileInFlight?.sessionKey === sessionKey) {
    return reconcileInFlight.promise;
  }
  const entry = {
    sessionKey,
    promise: fetchPoliciesByCategory().finally(() => {
      // Identity check: a newer session's entry must survive this settle.
      if (reconcileInFlight === entry) reconcileInFlight = null;
    }),
  };
  reconcileInFlight = entry;
  return entry.promise;
}

export function usePolicies() {
  const [policies, setPolicies] = useState<PoliciesByKey>(loadPolicies);
  const { refetch: refetchAppConfig } = useAppConfig();
  // Reconciling only on mount leaves the cache in its unconfigured default when the fetch ran
  // before there was a session, and every consumer reads that default as "no policy".
  // The session is unknown until auth settles; reconciling earlier fetches for
  // nobody and re-fires once the user resolves.
  const { user, loading: authLoading } = useAuth();
  const sessionKey = user?.id ?? null;

  useEffect(() => onPoliciesChange(() => setPolicies(loadPolicies())), []);

  // Latest refetch, read from inside the retry loop without re-triggering it.
  const refetchAppConfigRef = useRef(refetchAppConfig);
  refetchAppConfigRef.current = refetchAppConfig;

  // Retry with backoff since the backend may not be up yet.
  // On recovery, also re-resolve app config in case its admin/team-leader flags settled false while down.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reconcile = async () => {
      let byCategory;
      try {
        byCategory = await fetchPoliciesShared(sessionKey);
      } catch {
        if (cancelled || attempt >= RECONCILE_MAX_ATTEMPTS) return;
        timer = setTimeout(reconcile, reconcileRetryDelay(attempt++));
        return;
      }
      if (cancelled) return;
      const local = loadPolicies();
      const reconciled: PoliciesByKey = {};
      for (const cat of loadPolicyCatalog().categories) {
        const decoded = byCategory.get(cat.id);
        reconciled[cat.id] = decoded
          ? decodedToState(decoded)
          : {
              ...local[cat.id],
              configured: false,
              enabled: false,
              backendId: undefined,
            };
      }
      // Builder-made pipelines have no category, so the built-in loop above skips them. They are
      // still policies: one set to run on the editor has to reach the auto-run.
      for (const [key, decoded] of byCategory) {
        if (reconciled[key]) continue;
        reconciled[key] = decodedToState(decoded);
      }
      // A builder pipeline the backend no longer has was deleted on the Pipelines page. Its cached
      // entry keeps a dead backendId that still satisfies the auto-run filter, so the dispatch
      // fails, the run never completes, and the chain behind it never advances.
      forgetPolicies(
        Object.keys(local).filter(
          (id) => !reconciled[id] && !byCategory.has(id),
        ),
      );
      for (const [id, state] of Object.entries(reconciled)) {
        updatePolicy(id, state);
      }
      // The backend was down at first load (we retried) — re-resolve the app
      // config so the admin/team-leader gate isn't stuck on its offline default.
      if (attempt > 0) void refetchAppConfigRef.current();
    };
    void reconcile();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionKey, authLoading]);

  return { policies };
}
