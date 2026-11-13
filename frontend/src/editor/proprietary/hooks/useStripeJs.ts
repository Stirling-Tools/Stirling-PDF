import { useCallback, useEffect, useState } from "react";
import type { Stripe } from "@stripe/stripe-js";
import {
  trackStripeJsLoadFailed,
  trackStripeJsRetrySucceeded,
} from "@editor/services/analytics";

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Tab-wide memoized Stripe.js loader. A rejection (blocker, firewall, offline)
 * clears the cache, so the next call injects the script again instead of
 * replaying the cached failure. `@stripe/stripe-js` is dynamically imported so
 * its chunk loads only when a checkout reaches its payment step.
 */
export function loadStripeJs(publishableKey: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    const attempt = import("@stripe/stripe-js").then((mod) =>
      mod.loadStripe(publishableKey),
    );
    stripePromise = attempt;
    attempt.catch(() => {
      if (stripePromise === attempt) stripePromise = null;
    });
  }
  return stripePromise;
}

export interface StripeJsState {
  stripe: Stripe | null;
  failed: boolean;
  retry: () => void;
}

/**
 * Loads Stripe.js for an embedded checkout. Pass the resolved `stripe` to
 * `EmbeddedCheckoutProvider` rather than the promise: the provider has no
 * rejection handler, so a failed load would leave an empty mount and an
 * unhandled rejection. A null `publishableKey` skips the load.
 */
export function useStripeJs(
  publishableKey: string | null,
  surface: string,
): StripeJsState {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!publishableKey) return;
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      trackStripeJsLoadFailed(surface, attempt);
    };
    loadStripeJs(publishableKey).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        fail();
        return;
      }
      setStripe(loaded);
      if (attempt > 0) trackStripeJsRetrySucceeded(surface, attempt);
    }, fail);
    return () => {
      cancelled = true;
    };
  }, [publishableKey, surface, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { stripe, failed, retry };
}
