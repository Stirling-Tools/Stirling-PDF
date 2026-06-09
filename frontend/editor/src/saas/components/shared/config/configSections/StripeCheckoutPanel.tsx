/**
 * Stripe Embedded Checkout panel — lives in its own module so it can be
 * imported lazily. {@code @stripe/stripe-js} pulls a fairly chunky third-party
 * SDK; we don't want it in the main bundle for users who never open the
 * UpgradeModal, let alone reach step 2.
 *
 * <h2>Lazy-load pattern</h2>
 *
 * <pre>
 * // In UpgradeModal.tsx — only when the user advances to step 2:
 * const StripeCheckoutPanel = React.lazy(
 *   () => import("./StripeCheckoutPanel"),
 * );
 * </pre>
 *
 * The {@code loadStripe()} call inside this module deferred-imports the SDK
 * itself, so the chunk graph is:
 *
 * <pre>
 *   StripeCheckoutPanel.chunk.js
 *     └─ @stripe/react-stripe-js  (pulled in by ESM static import here)
 *     └─ @stripe/stripe-js        (pulled in by loadStripe inside fetchStripe)
 * </pre>
 *
 * Both chunks are eligible for Vite tree-shaking + lazy load; nothing in the
 * main bundle references either package.
 *
 * <h2>Architecture</h2>
 *
 * Stripe-touching code lives in Supabase edge functions, not the Java
 * backend. This panel invokes {@code create-payg-team-subscription}
 * directly via {@code supabase.functions.invoke()} — same pattern {@link
 * usePlans} already uses for {@code stripe-price-lookup}. The auth JWT is
 * attached automatically by the Supabase client.
 *
 * <p>The edge function (SaaS PR #300) is the canonical place Stripe Checkout
 * Sessions get created — it uses the Stripe Sync Engine tables, has dedicated
 * unit tests, and shares Stripe SDK / secret-key plumbing with the metering +
 * webhook edge functions. Routing through Java would have meant a useless
 * proxy hop + a second Stripe SDK to maintain.
 *
 * <h2>Behaviour</h2>
 *
 * <ol>
 *   <li>On mount: calls {@code supabase.functions.invoke("create-payg-team-subscription", {capUsd, noCap})}
 *       to obtain a {@code client_secret}.
 *   <li>If no {@code VITE_STRIPE_PUBLISHABLE_KEY} is configured OR the edge
 *       function isn't deployed yet (errors out / returns a {@code cs_mock_}
 *       sentinel), render a clearly-labelled placeholder + "Continue with
 *       mock" button so the post-completion path stays testable.
 *   <li>Otherwise render the real {@code <EmbeddedCheckoutProvider>} +
 *       {@code <EmbeddedCheckout>} iframe.
 * </ol>
 *
 * The parent {@link UpgradeModal} passes {@code onComplete} which fires when
 * either the real Stripe checkout emits its complete event OR the user
 * presses "Continue with mock" in unconfigured environments.
 */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@app/auth/supabase";

// Eager static imports here are OK because this whole module is itself lazy-
// imported by the modal. They land in the same lazy chunk.
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";

export interface StripeCheckoutPanelProps {
  /** Cap in USD; null means no cap. */
  capUsd: number | null;
  /** Called when Stripe (or the mock continue button) signals completion. */
  onComplete: () => void;
  /** Called when the call to /api/v1/payg/checkout fails. */
  onError?: (message: string) => void;
}

/**
 * Response shape from the {@code create-payg-team-subscription} Supabase edge
 * function. Mirrors what the function returns in SaaS PR #300.
 */
interface CheckoutResponse {
  /** Stripe Checkout Session client_secret. */
  client_secret: string;
  /**
   * Optional sentinel: edge functions in non-prod environments may return a
   * stubbed secret prefixed {@code cs_mock_} so the FE knows to render the
   * placeholder rather than try to mount a real iframe with a bad secret.
   */
  mock?: boolean;
}

// Singleton Stripe promise — created on first use and reused for the lifetime
// of the tab. {@code loadStripe} is dynamically imported so the actual SDK
// chunk is only pulled when this code path runs.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    stripePromise = import("@stripe/stripe-js").then((mod) =>
      mod.loadStripe(publishableKey),
    );
  }
  return stripePromise;
}

const StripeCheckoutPanel: React.FC<StripeCheckoutPanelProps> = ({
  capUsd,
  onComplete,
  onError,
}) => {
  const { t } = useTranslation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Strict-Mode-safe single-flight: React 18 dev mounts effects twice; we use
  // a ref-guarded fetch so we don't burn two Stripe Checkout Sessions per
  // mount in dev. (Cap changes are handled via key= in the parent, so each
  // distinct cap gets a fresh mount — fetchedRef only protects within a
  // single logical mount.)
  const fetchedRef = useRef<boolean>(false);

  // Stable ref for the error callback so we don't have to include it in the
  // effect deps — keeps the single-flight semantics intact for callers that
  // pass an inline onError.
  const onErrorRef = useRef<typeof onError>(onError);
  onErrorRef.current = onError;

  // Stash t() in a ref so the effect — which is single-flight via fetchedRef
  // and deliberately not re-running on translation changes — can read the
  // current translator without forcing t into its deps.
  const tRef = useRef(t);
  tRef.current = t;

  const publishableKey =
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";

  // Dev preview route has no backend — skip the API call and go straight
  // to the mock placeholder so the design + completion path stay testable.
  // Both checks required so a production tenant with a /dev/ URL prefix
  // can't accidentally trigger the placeholder.
  const devPreview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/dev/");

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    if (devPreview) {
      setClientSecret("cs_mock_devpreview");
      setIsMock(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function createSession() {
      try {
        const noCap = capUsd === null;
        // Direct Supabase edge function invocation — same pattern as usePlans
        // for stripe-price-lookup. The user's JWT is attached automatically;
        // edge fn uses it to derive the team id + stripe_customer_id.
        const { data, error: invokeError } =
          await supabase.functions.invoke<CheckoutResponse>(
            "create-payg-team-subscription",
            {
              body: {
                capUsd: capUsd ?? 0,
                noCap,
                returnUrl: window.location.href,
              },
            },
          );
        if (cancelled) return;
        if (invokeError) {
          throw invokeError;
        }
        if (!data?.client_secret) {
          throw new Error("Edge function returned no client_secret");
        }
        setClientSecret(data.client_secret);
        setIsMock(Boolean(data.mock) || data.client_secret.startsWith("cs_mock_"));
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : tRef.current(
                "payg.checkout.error.startFailed",
                "Couldn't start checkout session",
              );
        if (!cancelled) {
          setError(msg);
          onErrorRef.current?.(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void createSession();
    return () => {
      cancelled = true;
    };
  }, [capUsd, devPreview]);

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

  // Mock mode OR no publishable key configured → friendly placeholder.
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
          <button
            type="button"
            className="upm-btn"
            data-variant="primary"
            onClick={onComplete}
          >
            {t(
              "payg.checkout.mock.continue",
              "Continue with mock subscription",
            )}
          </button>
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

export default StripeCheckoutPanel;
