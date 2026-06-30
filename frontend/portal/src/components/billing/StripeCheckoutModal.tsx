import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Modal, Skeleton } from "@shared/components";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import {
  createCheckoutSession,
  getStripePublishableKey,
  type SaasCurrency,
} from "@portal/billing/stripe";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Caller's resolved team id. The edge function needs it to scope checkout. */
  teamId: number;
  /** "usd" | "eur" | "gbp" — the SaaS PAYG offering's supported set. */
  currency: SaasCurrency;
  /** Optional billing email prefill (Stripe locks the field when set). */
  billingOwnerEmail?: string;
  /**
   * Fired when Stripe (or the mock continue button) signals success. Caller
   * refreshes the wallet so the linked-subscribed view takes over.
   */
  onComplete: () => void;
}

/**
 * Embedded Stripe Checkout, matching the SaaS web app's PAYG sign-up UX. We
 * fetch a {@code client_secret} from the SaaS Supabase edge function then
 * mount &lt;EmbeddedCheckoutProvider&gt; inline — no full-page redirect, the
 * admin stays in the portal.
 *
 * If the team is already subscribed the edge function short-circuits to a
 * Stripe Customer Portal URL; we open it in a new tab and close the modal.
 */
let stripePromise: Promise<Stripe | null> | null = null;
function loadStripeOnce(pk: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    stripePromise = import("@stripe/stripe-js").then((m) => m.loadStripe(pk));
  }
  return stripePromise;
}

export function StripeCheckoutModal({
  open,
  onClose,
  teamId,
  currency,
  billingOwnerEmail,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publishableKey = getStripePublishableKey();

  // Mint the checkout session whenever the modal opens for a fresh team/currency.
  useEffect(() => {
    if (!open) {
      // Reset on close so re-opening fetches a fresh session.
      setClientSecret(null);
      setError(null);
      setLoading(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    createCheckoutSession({
      teamId,
      currency,
      successUrl: window.location.href,
      cancelUrl: window.location.href,
      billingOwnerEmail,
    })
      .then((session) => {
        if (cancelled) return;
        if (session.alreadySubscribed && session.redirectUrl) {
          // Team's already on PAYG — bounce them to the management portal
          // instead of mounting a checkout iframe with no secret.
          window.open(session.redirectUrl, "_blank", "noopener,noreferrer");
          onClose();
          return;
        }
        if (!session.clientSecret) {
          setError(
            t(
              "billing.checkout.noClientSecret",
              "Edge function returned no client_secret.",
            ),
          );
          return;
        }
        setClientSecret(session.clientSecret);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId, currency, billingOwnerEmail, onClose, t]);

  const stripe = publishableKey ? loadStripeOnce(publishableKey) : null;
  const canRender = Boolean(stripe && clientSecret);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={t("billing.checkout.title", "Turn on the Processor plan")}
      subtitle={t(
        "billing.checkout.subtitle",
        "Add a card to keep going past your free Editor-plan grant. Stripe handles the rest.",
      )}
    >
      {!publishableKey && (
        <Banner
          tone="neutral"
          title={t(
            "billing.checkout.notConfigured.title",
            "Stripe not configured",
          )}
        >
          {t("billing.checkout.notConfigured.bodyBefore", "Set")}{" "}
          <code>VITE_STRIPE_PUBLISHABLE_KEY</code>{" "}
          {t(
            "billing.checkout.notConfigured.bodyAfter",
            "in the portal env to enable in-app checkout.",
          )}
        </Banner>
      )}
      {publishableKey && error && (
        <Banner
          tone="danger"
          title={t("billing.checkout.error.title", "Couldn't start checkout")}
        >
          {error}
        </Banner>
      )}
      {publishableKey && loading && !error && (
        <div className="portal-billing__skeleton" aria-hidden>
          <Skeleton height="3rem" />
          <Skeleton height="18rem" />
        </div>
      )}
      {publishableKey && canRender && stripe && clientSecret && (
        <EmbeddedCheckoutProvider
          stripe={stripe}
          options={{ clientSecret, onComplete }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
    </Modal>
  );
}
