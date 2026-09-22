import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal, Skeleton, Spinner } from "@app/ui";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { updateCap } from "@portal/api/billing";
import {
  createCheckoutSession,
  getStripePublishableKey,
  loadStripeOnce,
  type SaasCurrency,
} from "@portal/billing/stripe";
import { CardPlaceholder } from "@portal/components/billing/CardPlaceholder";
import { ProcessorSpendFields } from "@portal/components/billing/ProcessorSpendFields";
import { PrepayModalHeader } from "@portal/components/billing/PrepayModalHeader";

interface Props {
  open: boolean;
  onClose: () => void;
  onPrepay?: () => void;
  /** Caller's resolved team id. The edge function needs it to scope checkout. */
  teamId: number;
  /** "usd" | "eur" | "gbp" — the SaaS PAYG offering's supported set. */
  currency: SaasCurrency;
  /** Per-credit rate in minor currency units. */
  pricePerDocMinor?: number | null;
  /** Cap to seed the spend-limit step with; defaults to $100/mo. */
  initialCapUsd?: number | null;
  /** Optional billing email prefill (Stripe locks the field when set). */
  billingOwnerEmail?: string;
  /**
   * Fired when Stripe signals payment success. Runs the caller's activation flow
   * (poll the wallet until the subscription webhook lands) and resolves {@code
   * true} once subscribed, {@code false} if it's taking longer than the poll
   * window.
   */
  onComplete: () => Promise<boolean>;
}

/** Default monthly cap in major currency units. */
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

export function StripeCheckoutModal({
  open,
  onClose,
  onPrepay,
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
    initialCapUsd === undefined ? DEFAULT_CAP_USD : initialCapUsd,
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
    // Guard the empty-field sentinel: clearing the input maps to 0, which is neither a real cap nor the
    // explicit "No limit" (null). Proceeding would set a $0 ceiling (processing immediately paused), so
    // treat it as incomplete and stay put — the Continue button is disabled in this state too.
    if (capUsd !== null && capUsd <= 0) return;
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

  // Valid to continue when a positive cap is set OR "No limit" (null) was explicitly picked. A cleared
  // field maps to 0 (incomplete) — block Continue rather than let it become an accidental $0 ceiling.
  const capValid = capUsd === null || (Number.isFinite(capUsd) && capUsd > 0);

  // The chosen cap, formatted for the payment-step recap (null = "No cap" was picked on step 1).
  const capLabel =
    capUsd != null
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currency.toUpperCase(),
          maximumFractionDigits: 0,
        }).format(capUsd)
      : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        phase === "cap"
          ? t("portal.billing.simple.setLimit", "Set a spend limit")
          : undefined
      }
      subtitle={
        phase === "cap"
          ? t(
              "portal.billing.simple.limitIntro",
              "Cap what the Processor can bill each month.",
            )
          : undefined
      }
      /* Only the Stripe checkout step needs the room; every other step stays narrow. The checkout
         step also gets a wider-than-xl cap so the embedded Stripe iframe clears its ~1000px
         two-column threshold (below it, Stripe falls back to the single-column "portrait" layout). */
      width={phase === "checkout" ? "xl" : "md"}
      className={[
        "portal-billing__checkout-modal",
        phase === "cap" || phase === "checkout"
          ? "portal-billing__checkout-modal--framed"
          : "",
        phase === "checkout"
          ? "portal-billing__checkout-modal--wide"
          : "processor-checkout--simple",
      ]
        .filter(Boolean)
        .join(" ")}
      disableBackdropClose={!dismissable}
      disableEscapeClose={!dismissable}
      ariaLabel={t("portal.billing.checkout.cap.title", "Set your spend limit")}
    >
      {phase === "finalizing" && <CheckoutFinalizing />}
      {phase === "activationSlow" && (
        <CheckoutActivationSlow onClose={onClose} />
      )}

      {phase === "cap" && (
        <div className="portal-billing__checkout-cap">
          <div className="portal-billing__checkout-scroll">
            <ProcessorSpendFields
              value={capUsd}
              onChange={setCapUsd}
              currency={currency}
              rate={pricePerDocMinor ?? null}
              disabled={capBusy}
            />
            <p className="portal-billing__checkout-finePrint">
              {t(
                "portal.billing.simple.billingNote",
                "No standing fee. Credits bill monthly as used. Cancel any time in Usage & Billing.",
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
              <Button
                variant="secondary"
                onClick={onPrepay ?? onClose}
                disabled={capBusy}
              >
                {t("portal.billing.spendLimit.buyCredits", "Buy credits")}
              </Button>
              <Button
                loading={capBusy}
                disabled={!capValid}
                onClick={handleContinue}
                rightSection={<span aria-hidden>›</span>}
              >
                {t(
                  "portal.billing.checkout.cap.continue",
                  "Continue to payment",
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "checkout" && (
        <div className="portal-billing__checkout-pay">
          <PrepayModalHeader
            step={2}
            total={2}
            title={t("portal.billing.checkout.title", "Add a payment method")}
            onClose={handleClose}
          />
          <div className="portal-billing__checkout-scroll">
            <p className="portal-billing__checkout-limit">
              {capLabel
                ? t(
                    "portal.billing.checkout.pay.limit",
                    "Monthly spend limit {{amount}}/mo. Processing pauses at the limit.",
                    { amount: capLabel },
                  )
                : t(
                    "portal.billing.checkout.pay.limitNoCap",
                    "No spend limit. Processing won't pause. Invoices post monthly.",
                  )}
            </p>
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
              <div className="portal-billing__checkout-embed">
                <EmbeddedCheckoutProvider
                  stripe={stripe}
                  options={{ clientSecret, onComplete: handleStripeComplete }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
