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
 *   () => import("@app/components/shared/config/configSections/StripeCheckoutPanel"),
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
 * Stripe-touching code lives in Supabase edge functions, not the Java backend.
 * This panel no longer talks to Supabase directly — it mints the PAYG checkout
 * session through the {@code @app/services/billing} seam
 * ({@link createCheckoutSession} with a {@code teamId}), which each platform
 * implements (web supabase client vs Tauri fetch). The seam drives the
 * {@code create-checkout-session} edge function.
 *
 * <p>The edge function is the canonical place Stripe Checkout
 * Sessions get created - it uses the Stripe Sync Engine tables, has dedicated
 * unit tests, and shares Stripe SDK / secret-key plumbing with the metering +
 * webhook edge functions. Routing through Java would have meant a useless
 * proxy hop + a second Stripe SDK to maintain.
 *
 * <h2>Behaviour</h2>
 *
 * <ol>
 *   <li>On mount: calls {@link createCheckoutSession} with the {@code teamId},
 *       {@code currency} and billing email to obtain a {@code clientSecret}. The
 *       spending cap is NOT set here — it's an application-layer setting applied
 *       via {@code PATCH /payg/cap} after the subscription lands.
 *   <li>If no Stripe publishable key is configured OR the edge function isn't
 *       deployed yet (errors out / returns a {@code cs_mock_} sentinel), render
 *       a clearly-labelled placeholder + "Continue with mock" button so the
 *       post-completion path stays testable.
 *   <li>If only a hosted {@code url} comes back (the redirect fallback), hand it
 *       to the system browser via {@link openExternal}.
 *   <li>Otherwise render the real {@code <EmbeddedCheckoutProvider>} +
 *       {@code <EmbeddedCheckout>} iframe. The Tauri webview has no CSP, so
 *       embedded checkout works on desktop too.
 * </ol>
 *
 * The parent {@link UpgradeModal} passes {@code onComplete} which fires when
 * either the real Stripe checkout emits its complete event OR the user
 * presses "Continue with mock" in unconfigured environments.
 */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import {
  createCheckoutSession,
  getStripePublishableKey,
} from "@app/services/billing";
import { openExternal } from "@app/platform/openExternal";
import { getWalletDevPreview } from "@app/hooks/walletDevPreview";

// Eager static imports here are OK because this whole module is itself lazy-
// imported by the modal. They land in the same lazy chunk.
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";

export interface StripeCheckoutPanelProps {
  /**
   * The caller's team_id — required by the Supabase edge function, which can't
   * derive it from the JWT alone (the function runs outside our app's Spring
   * Security context and has no access to the {@code team_memberships} table
   * other than via this hint).
   */
  teamId: number;
  /** Currency lower-case 3-letter ISO (e.g. {@code "gbp"}). Selects the Stripe Price. */
  currency?: string;
  /** Cap in USD; null means no cap. Tracked locally; set on the wallet via PATCH after subscription. */
  capUsd: number | null;
  /** Called when Stripe (or the mock continue button) signals completion. */
  onComplete: () => void;
  /** Called when the call to /api/v1/payg/checkout fails. */
  onError?: (message: string) => void;
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
  teamId,
  currency = "gbp",
  // capUsd is part of the props contract but intentionally unused here — the cap is set
  // application-side via PATCH /payg/cap after the subscription lands, not during checkout.
  onComplete,
  onError,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Billing email for the Stripe Checkout Session. Passing customer_email to
  // Stripe prefills the email field AND locks it (Stripe's own behaviour for
  // sessions created with customer_email or an attached customer) — the user
  // can't bill a different address than the account they're signed in with.
  const billingEmail = user?.email ?? null;

  // Stable ref for the error callback so we don't have to include it in the
  // effect deps.
  const onErrorRef = useRef<typeof onError>(onError);
  onErrorRef.current = onError;

  // Stash t() in a ref so the effect can read the current translator without
  // forcing t into its deps.
  const tRef = useRef(t);
  tRef.current = t;

  const publishableKey = getStripePublishableKey();

  // Dev preview route has no backend — skip the API call and go straight
  // to the mock placeholder so the design + completion path stay testable.
  // The dev-preview detection (import.meta.env.DEV + a /dev/ path) lives behind
  // the walletDevPreview seam since cloud may not read either directly; it is
  // a saas-only affordance and resolves to null on desktop / prod.
  const devPreview = getWalletDevPreview() !== null;

  useEffect(() => {
    if (devPreview) {
      setClientSecret("cs_mock_devpreview");
      setIsMock(true);
      setLoading(false);
      return;
    }

    // React 18 strict-mode dev mounts effects twice. We use `cancelled` to
    // discard the first mount's response (its setState calls become no-ops),
    // and the second mount's response wins. We deliberately do NOT short-
    // circuit the second mount with a ref: that traps mount 1 as cancelled
    // while the live mount never re-fetches, leaving `loading` stuck at true.
    // Two network calls in dev is an acceptable cost; prod has no strict mode
    // -> single fetch.
    let cancelled = false;
    async function createSession() {
      try {
        // Mint the PAYG checkout session through the billing seam. Passing a
        // teamId routes it to the {@code create-checkout-session} edge function
        // (not {@code create-payg-team-subscription} — that one subscribes
        // directly without the embedded iframe and returns no client_secret).
        // team_id is required because the edge fn runs outside our Spring
        // Security context and can't resolve it from the JWT alone. The cap is
        // *not* set during checkout — it's applied via PATCH /payg/cap after
        // the subscription lands. The platform impl supplies the success/cancel
        // return URL (browser origin on web, deep link on desktop).
        const session = await createCheckoutSession({
          teamId,
          currency,
          // Maps to Stripe's customer_email when the team has no Stripe
          // customer yet — prefills + locks the email field in Checkout. Teams
          // with an existing customer get the email locked from the customer
          // record instead; this field is ignored for them.
          billingOwnerEmail: billingEmail,
        });
        if (cancelled) return;
        // Hosted-url fallback: no embedded iframe, hand the URL to the system
        // browser. The deep-link / origin return URL brings the user back.
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
  }, [teamId, currency, devPreview, billingEmail]);

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
