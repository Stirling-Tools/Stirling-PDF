import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal, Skeleton, Spinner } from "@app/ui";
import { SpendCapControl } from "@app/billing";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { updateCap } from "@portal/api/billing";
import {
  createCheckoutSession,
  getStripePublishableKey,
  type SaasCurrency,
} from "@portal/billing/stripe";
import { LockIcon } from "@portal/components/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Caller's resolved team id. The edge function needs it to scope checkout. */
  teamId: number;
  /** "usd" | "eur" | "gbp" — the SaaS PAYG offering's supported set. */
  currency: SaasCurrency;
  /** Per-document rate in minor units, for the cap→PDF estimate on step 1. */
  pricePerDocMinor?: number | null;
  /** Cap to seed the spend-limit step with; defaults to $100/mo. */
  initialCapUsd?: number | null;
  /** Optional billing email prefill (Stripe locks the field when set). */
  billingOwnerEmail?: string;
  /**
   * Fired when Stripe (or the mock continue button) signals payment success.
   * Runs the caller's activation flow (poll the wallet until the subscription
   * webhook lands) and resolves {@code true} once subscribed, {@code false} if
   * it's taking longer than the poll window.
   */
  onComplete: () => Promise<boolean>;
}

/** Preset monthly caps offered on the spend-limit step (major currency units). */
const CAP_PRESETS = [50, 100, 250, 1000] as const;
const DEFAULT_CAP_USD = 100;

/**
 * Two-step "turn on the Processor" flow. Stripe's embedded Checkout owns the card
 * form in its own iframe, so we can't add our own fields to it — instead the cap
 * lives on step 1 (its own page) and the embedded card form on step 2. The chosen
 * ceiling is applied before payment so "you're never billed past it" is true from
 * the first processed PDF.
 *
 * If the team is already subscribed the edge function short-circuits to a Stripe
 * Customer Portal URL; we open it in a new tab and close.
 */
let stripePromise: Promise<Stripe | null> | null = null;
function loadStripeOnce(pk: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    stripePromise = import("@stripe/stripe-js").then((m) => m.loadStripe(pk));
  }
  return stripePromise;
}

/** Two-segment progress header: step 1 = spend limit, step 2 = payment. */
function StepProgress({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__checkout-progress">
      <div className="portal-billing__checkout-steps" aria-hidden>
        <span className="is-done" />
        <span className={step >= 2 ? "is-done" : ""} />
      </div>
      <span className="portal-billing__checkout-stepcount">
        {t("portal.billing.checkout.stepCount", "Step {{step}} of 2", { step })}
      </span>
    </div>
  );
}

/** Payment done, waiting for the subscription webhook to activate the plan. */
function CheckoutFinalizing() {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__checkout-finalizing" role="status">
      <Spinner size="lg" />
      <h3 className="portal-billing__checkout-status-title">
        {t(
          "portal.billing.checkout.finalizing.title",
          "Activating your Processor plan...",
        )}
      </h3>
      <p className="portal-billing__checkout-status-body">
        {t(
          "portal.billing.checkout.finalizing.body",
          "Your payment went through. We're switching on metered processing across your linked instances - this usually takes a few seconds.",
        )}
      </p>
      <p className="portal-billing__checkout-status-hint">
        {t(
          "portal.billing.checkout.finalizing.hint",
          "Please keep this window open.",
        )}
      </p>
    </div>
  );
}

/** Webhook lagging past the poll window — dismissable "it'll appear shortly" notice. */
function CheckoutActivationSlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__checkout-finalizing" role="status">
      <h3 className="portal-billing__checkout-status-title">
        {t("portal.billing.checkout.activationSlow.title", "Almost there")}
      </h3>
      <p className="portal-billing__checkout-status-body">
        {t(
          "portal.billing.checkout.activationSlow.body",
          "Your payment succeeded, but activation is taking a little longer than usual. It'll switch on automatically - close this and it'll appear here shortly.",
        )}
      </p>
      <Button variant="secondary" onClick={onClose}>
        {t("portal.billing.checkout.activationSlow.close", "Close")}
      </Button>
    </div>
  );
}

/**
 * Placeholder for the card form when no Stripe publishable key is configured
 * (Storybook / preview / mis-config). Mirrors the real embedded form's framing
 * so the step reads correctly without mounting Stripe.
 */
function CardPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__card-placeholder">
      <div className="portal-billing__card-placeholder-head">
        <span>{t("portal.billing.checkout.card.label", "Card details")}</span>
        <span className="portal-billing__card-placeholder-badge">Stripe</span>
      </div>
      <div className="portal-billing__card-placeholder-field">
        <LockIcon size={13} />
        <span>
          {t(
            "portal.billing.checkout.card.fields",
            "Card number · MM / YY · CVC · ZIP",
          )}
        </span>
      </div>
      <p className="portal-billing__card-placeholder-note">
        {t(
          "portal.billing.checkout.card.note",
          "Card details collected by Stripe. Stirling never stores PAN or CVC.",
        )}
      </p>
    </div>
  );
}

export function StripeCheckoutModal({
  open,
  onClose,
  teamId,
  currency,
  pricePerDocMinor,
  initialCapUsd,
  billingOwnerEmail,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "cap" = spend-limit step; "checkout" = Stripe card form; "finalizing" =
  // payment done, waiting for activation (non-dismissable); "activationSlow" =
  // webhook lagging past the poll window (dismissable).
  const [phase, setPhase] = useState<
    "cap" | "checkout" | "finalizing" | "activationSlow"
  >("cap");
  const [capUsd, setCapUsd] = useState<number | null>(
    initialCapUsd ?? DEFAULT_CAP_USD,
  );
  const [capBusy, setCapBusy] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const publishableKey = getStripePublishableKey();

  // Reset to the spend-limit step whenever the modal closes, so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase("cap");
      setClientSecret(null);
      setError(null);
      setLoading(true);
      setCapUsd(initialCapUsd ?? DEFAULT_CAP_USD);
      setCapBusy(false);
      setCapError(null);
    }
  }, [open, initialCapUsd]);

  // Mint the checkout session only once the user has set a cap and advanced to
  // the payment step — not on open — so we don't create a session they may abandon
  // on step 1, and so the cap is applied first.
  useEffect(() => {
    if (!open || phase !== "checkout" || !publishableKey) return;
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
          window.open(session.redirectUrl, "_blank", "noopener,noreferrer");
          onClose();
          return;
        }
        if (!session.clientSecret) {
          setError(
            t(
              "portal.billing.checkout.noClientSecret",
              "Edge function returned no client_secret.",
            ),
          );
          return;
        }
        setClientSecret(session.clientSecret);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    phase,
    publishableKey,
    teamId,
    currency,
    billingOwnerEmail,
    onClose,
    t,
  ]);

  const stripe = publishableKey ? loadStripeOnce(publishableKey) : null;
  const canRender = Boolean(stripe && clientSecret);

  // Apply the chosen ceiling, then advance to payment. Applying it up front keeps
  // "you're never billed past it" true from the first processed PDF.
  async function handleContinue() {
    setCapBusy(true);
    setCapError(null);
    try {
      await updateCap(capUsd);
      if (mounted.current) setPhase("checkout");
    } catch (e) {
      if (mounted.current) {
        setCapError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mounted.current) setCapBusy(false);
    }
  }

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

  // Block dismissal while activation is in flight so a half-finished flow can't be abandoned.
  const dismissable = phase !== "finalizing";
  const handleClose = () => {
    if (dismissable) onClose();
  };

  const onCapStep = phase === "cap";
  const title = onCapStep
    ? t("portal.billing.checkout.cap.title", "Set your spend limit")
    : t("portal.billing.checkout.title", "Add a payment method");
  const subtitle = onCapStep
    ? t(
        "portal.billing.checkout.cap.subtitle",
        "You're billed only for PDFs you process past your first 500 free, never for seats — so your ceiling is yours from day one.",
      )
    : t(
        "portal.billing.checkout.subtitle",
        "Add a card to keep going past your free Editor-plan grant. Stripe handles the rest.",
      );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      width="xl"
      className="portal-billing__checkout-modal"
      disableBackdropClose={!dismissable}
      disableEscapeClose={!dismissable}
      title={title}
      subtitle={subtitle}
    >
      {phase === "finalizing" && <CheckoutFinalizing />}
      {phase === "activationSlow" && (
        <CheckoutActivationSlow onClose={onClose} />
      )}

      {phase === "cap" && (
        <div className="portal-billing__checkout-cap">
          <StepProgress step={1} />
          <SpendCapControl
            capUsd={capUsd}
            onChange={setCapUsd}
            pricePerDocMinor={pricePerDocMinor}
            currency={currency}
            presets={CAP_PRESETS}
            note={t(
              "portal.billing.checkout.cap.note",
              "Processing pauses if you reach it. You're never billed past this, and you can change it any time.",
            )}
          />
          <p className="portal-billing__checkout-finePrint">
            {t(
              "portal.billing.checkout.cap.finePrint",
              "Invoices post on the 1st. Cancel anytime and revert to the Editor plan; your policies and history stay intact.",
            )}
          </p>
          {capError && (
            <Banner
              tone="danger"
              title={t(
                "portal.billing.checkout.cap.error",
                "Couldn't set your spend limit",
              )}
            >
              {capError}
            </Banner>
          )}
          <div className="portal-billing__checkout-cap-actions">
            <Button variant="quiet" onClick={onClose} disabled={capBusy}>
              {t("portal.billing.checkout.cap.back", "Back")}
            </Button>
            <Button
              accent="premium"
              loading={capBusy}
              onClick={handleContinue}
              rightSection={<span aria-hidden>›</span>}
            >
              {t("portal.billing.checkout.cap.continue", "Continue to payment")}
            </Button>
          </div>
        </div>
      )}

      {phase === "checkout" && (
        <div className="portal-billing__checkout-pay">
          <StepProgress step={2} />
          {!publishableKey && <CardPlaceholder />}
          {publishableKey && error && (
            <Banner
              tone="danger"
              title={t(
                "portal.billing.checkout.error.title",
                "Couldn't start checkout",
              )}
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
              options={{ clientSecret, onComplete: handleStripeComplete }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      )}
    </Modal>
  );
}
