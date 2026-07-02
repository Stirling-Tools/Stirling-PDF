import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal, Skeleton, Spinner } from "@shared/components";
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
   * Fired when Stripe (or the mock continue button) signals payment success.
   * Runs the caller's activation flow (poll the wallet until the subscription
   * webhook lands) and resolves {@code true} once subscribed, {@code false} if
   * it's taking longer than the poll window. The modal stays open and
   * non-dismissable while this runs, so the admin watches activation through
   * instead of the modal vanishing and needing a manual refresh.
   */
  onComplete: () => Promise<boolean>;
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
  // "checkout" = Stripe form; "finalizing" = payment done, waiting for the plan to activate
  // (non-dismissable); "activationSlow" = webhook lagging past the poll window (dismissable).
  const [phase, setPhase] = useState<
    "checkout" | "finalizing" | "activationSlow"
  >("checkout");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const publishableKey = getStripePublishableKey();

  // Mint the checkout session whenever the modal opens for a fresh team/currency.
  useEffect(() => {
    if (!open) {
      // Reset on close so re-opening fetches a fresh session + starts at checkout.
      setClientSecret(null);
      setError(null);
      setLoading(true);
      setPhase("checkout");
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
          setError(t("billing.checkout.noClientSecret"));
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

  // Payment succeeded — hold the modal open and run the caller's activation poll instead of
  // closing. The parent swaps to the subscribed view on success (unmounting us); a lagging
  // webhook drops us into the dismissable "almost there" state.
  function handleStripeComplete() {
    setPhase("finalizing");
    onComplete()
      .then((activated) => {
        if (!activated && mounted.current) setPhase("activationSlow");
      })
      .catch(() => {
        if (mounted.current) setPhase("activationSlow");
      });
  }

  // Block dismissal while activation is in flight so a half-finished flow can't be abandoned;
  // the X, backdrop, and Escape all route through this.
  const dismissable = phase !== "finalizing";
  const handleClose = () => {
    if (dismissable) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      width="xl"
      className="portal-billing__checkout-modal"
      disableBackdropClose={!dismissable}
      disableEscapeClose={!dismissable}
      title={t("billing.checkout.title")}
      subtitle={t("billing.checkout.subtitle")}
    >
      {phase === "finalizing" && (
        <div className="portal-billing__checkout-finalizing" role="status">
          <Spinner size="lg" />
          <h3 className="portal-billing__checkout-status-title">
            {t("billing.checkout.finalizing.title")}
          </h3>
          <p className="portal-billing__checkout-status-body">
            {t("billing.checkout.finalizing.body")}
          </p>
          <p className="portal-billing__checkout-status-hint">
            {t("billing.checkout.finalizing.hint")}
          </p>
        </div>
      )}

      {phase === "activationSlow" && (
        <div className="portal-billing__checkout-finalizing" role="status">
          <h3 className="portal-billing__checkout-status-title">
            {t("billing.checkout.activationSlow.title")}
          </h3>
          <p className="portal-billing__checkout-status-body">
            {t("billing.checkout.activationSlow.body")}
          </p>
          <Button variant="outline" onClick={onClose}>
            {t("billing.checkout.activationSlow.close")}
          </Button>
        </div>
      )}

      {phase === "checkout" && (
        <>
          {!publishableKey && (
            <Banner
              tone="neutral"
              title={t("billing.checkout.notConfigured.title")}
            >
              {t("billing.checkout.notConfigured.bodyBefore")}{" "}
              <code>VITE_STRIPE_PUBLISHABLE_KEY</code>{" "}
              {t("billing.checkout.notConfigured.bodyAfter")}
            </Banner>
          )}
          {publishableKey && error && (
            <Banner tone="danger" title={t("billing.checkout.error.title")}>
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
              options={{ clientSecret, onComplete: handleStripeComplete }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </>
      )}
    </Modal>
  );
}
