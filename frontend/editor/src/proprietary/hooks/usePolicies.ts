/**
 * Read-only Policies state for the editor's enforcement path. The backend
 * (`/api/v1/policies`) is the source of truth: on mount we reconcile the local
 * cache against the stored policies. localStorage is a fast-render cache +
 * offline fallback. Managing policies (create/edit/pause/delete) lives on the
 * portal Pipelines page, not here; the editor only reads them and runs them.
 */

import { useState, useEffect, useRef } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
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

export function usePolicies() {
  const [policies, setPolicies] = useState<PoliciesByKey>(loadPolicies);
  const { refetch: refetchAppConfig } = useAppConfig();

  useEffect(() => onPoliciesChange(() => setPolicies(loadPolicies())), []);

  // Latest refetch, read from inside the retry loop without re-triggering it.
  const refetchAppConfigRef = useRef(refetchAppConfig);
  refetchAppConfigRef.current = refetchAppConfig;

  // Reconcile local cache against the backend (source of truth), preserving the
  // locally-cached folderId; retry with backoff since the backend may not be up yet.
  // On recovery, also re-resolve app config in case its admin/team-leader flags settled false while down.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reconcile = async () => {
      let byCategory;
      try {
        byCategory = await fetchPoliciesByCategory();
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
          ? decodedToState(decoded, local[cat.id]?.folderId)
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
        reconciled[key] = decodedToState(decoded, local[key]?.folderId);
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
  }, []);

  return { policies };
}
