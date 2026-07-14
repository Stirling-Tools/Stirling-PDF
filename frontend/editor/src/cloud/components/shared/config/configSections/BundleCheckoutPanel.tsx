/**
 * Stripe Embedded Checkout panel for a one-time prepaid-bundle purchase — the
 * sibling of {@link StripeCheckoutPanel} for the {@code mode:payment} bundle flow
 * rather than the metered subscription. Lazy-imported by {@code
 * BundleCheckoutModal} so the {@code @stripe/*} chunks stay out of the main bundle
 * until the buyer actually reaches the payment step.
 *
 * The capacity + price are fixed by a server-issued quote ticket ({@code quoteId},
 * from {@code POST /api/v1/payg/bundle/quote}); this panel only hands that id to
 * the {@code create-payg-bundle-checkout} edge function via the {@code
 * @app/services/billing} seam, so the client never dictates quantity or price.
 * The pool is credited on the Stripe webhook, never here.
 */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import {
  createBundleCheckoutSession,
  getStripePublishableKey,
} from "@app/services/billing";
import { openExternal } from "@app/platform/openExternal";
import { getWalletDevPreview } from "@app/hooks/walletDevPreview";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";

export interface BundleCheckoutPanelProps {
  /** The caller's team_id — required by the edge function (runs outside Spring Security). */
  teamId: number;
  /** Server-issued quote ticket id the edge fn reads the capacity + price off. */
  quoteId: number;
  /** Called when Stripe (or the mock continue button) signals completion. */
  onComplete: () => void;
  /** Called when the checkout session couldn't be created. */
  onError?: (message: string) => void;
}

// Singleton Stripe promise — created on first use and reused for the tab's
// lifetime. loadStripe is dynamically imported so the SDK chunk only loads here.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    stripePromise = import("@stripe/stripe-js").then((mod) =>
      mod.loadStripe(publishableKey),
    );
  }
  return stripePromise;
}

const BundleCheckoutPanel: React.FC<BundleCheckoutPanelProps> = ({
  teamId,
  quoteId,
  onComplete,
  onError,
}) => {
  const { t } = useTranslation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const onErrorRef = useRef<typeof onError>(onError);
  onErrorRef.current = onError;
  const tRef = useRef(t);
  tRef.current = t;

  const publishableKey = getStripePublishableKey();

  // Dev preview route has no backend — go straight to the mock placeholder so
  // the design + completion path stay testable (same seam as the wallet).
  const devPreview = getWalletDevPreview() !== null;

  useEffect(() => {
    if (devPreview) {
      setClientSecret("cs_mock_devpreview");
      setIsMock(true);
      setLoading(false);
      return;
    }

    // React 18 strict-mode double-mount: discard the first mount's response via
    // `cancelled`; the live mount's response wins (mirrors StripeCheckoutPanel).
    let cancelled = false;
    async function createSession() {
      try {
        const session = await createBundleCheckoutSession({ teamId, quoteId });
        if (cancelled) return;
        if (session.url && !session.clientSecret) {
          await openExternal(session.url);
          return;
        }
        if (!session.clientSecret) {
          throw new Error("Edge function returned no client_secret");
        }
        setClientSecret(session.clientSecret);
        setIsMock(
          Boolean(session.mock) || session.clientSecret.startsWith("cs_mock_"),
        );
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : tRef.current(
                "payg.checkout.error.startFailed",
                "Couldn't start checkout session",
              );
        setError(msg);
        onErrorRef.current?.(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void createSession();
    return () => {
      cancelled = true;
    };
  }, [teamId, quoteId, devPreview]);

  if (loading) {
    return (
      <div className="upm-stripe-mount" data-state="loading">
        <div className="upm-stripe-mount__title">
          {t("payg.checkout.connecting", "Connecting to Stripe…")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="upm-stripe-mount" data-state="error">
        <div className="upm-stripe-mount__title">
          {t("payg.checkout.errorTitle", "Stripe error")}
        </div>
        <div>{error}</div>
      </div>
    );
  }

  const showMockPlaceholder = isMock || publishableKey.length === 0;

  if (showMockPlaceholder) {
    return (
      <div className="upm-stripe-mount" data-state="mock">
        <div className="upm-stripe-mount__title">
          {t(
            "payg.checkout.mock.title",
            "Stripe Embedded Checkout (mock mode)",
          )}
        </div>
        <div>
          {publishableKey.length === 0
            ? t(
                "payg.checkout.mock.noKey",
                "VITE_STRIPE_PUBLISHABLE_KEY is unset. Real iframe mounts here once configured.",
              )
            : t(
                "payg.checkout.mock.backend",
                "Backend is in mock mode — no real Stripe session was created.",
              )}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={onComplete}>
            {t(
              "payg.prepaid.checkout.mockContinue",
              "Continue with mock purchase",
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (!clientSecret) return null;

  return (
    <div className="upm-stripe-mount" data-state="live">
      <EmbeddedCheckoutProvider
        stripe={getStripe(publishableKey)}
        options={{ clientSecret, onComplete }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
};

export default BundleCheckoutPanel;
