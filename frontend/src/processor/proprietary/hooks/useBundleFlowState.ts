import { useCallback, useEffect, useState } from "react";
import {
  getLatestBundleQuote,
  type LatestBundleQuote,
} from "@portal/billing/stripe";

/**
 * Where a team sits in the prepaid-bundle purchase:
 *   - none    → no open quote; the buyer hasn't started (or the last one expired).
 *   - quote   → an open quote exists but hasn't been accepted (no invoice yet).
 *   - invoice → the quote is accepted and an invoice is awaiting payment.
 */
export type BundleFlowStatus = "none" | "quote" | "invoice";

export interface BundleFlowState {
  status: BundleFlowStatus;
  /** The underlying quote row, or null when {@code status === "none"}. */
  latest: LatestBundleQuote | null;
  /** First load (or a refresh) is in flight. */
  loading: boolean;
  /** Re-read the latest quote — call after the checkout modal closes so the CTA reflects new state. */
  refresh: () => void;
}

/**
 * Page-level probe for the prepaid-bundle flow, so the billing page can render the
 * right CTA on load — "View quote" once a quote exists, "Pay invoice to complete"
 * once it's accepted — instead of always restarting the activation fork. The heavy
 * hydration (sizing, re-accept) still lives in {@code BundleCheckoutModal}; this
 * only classifies the latest quote so the entry point can name the resume action.
 *
 * Effectively leader-scoped: {@code payg_get_latest_bundle_quote} 403s for
 * non-leaders, which (like an unconfigured backend) we treat as "none". Only
 * meaningful for a free team — a paid invoice flips the team to subscribed. Pass
 * {@code enabled: false} to skip the read entirely (non-leaders, no team).
 */
export function useBundleFlowState(
  teamId: number | null | undefined,
  enabled = true,
): BundleFlowState {
  const [latest, setLatest] = useState<LatestBundleQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled || teamId == null) {
      setLatest(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getLatestBundleQuote(teamId)
      .then((q) => {
        if (!cancelled) setLatest(q);
      })
      .catch(() => {
        // No backend / not a leader / transient — fall back to "none" rather than
        // block the page. The modal is the source of truth once it opens.
        if (!cancelled) setLatest(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, enabled, tick]);

  const status: BundleFlowStatus =
    latest == null ? "none" : latest.stripeRef ? "invoice" : "quote";

  return { status, latest, loading, refresh };
}
