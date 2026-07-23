import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal, Skeleton, Spinner } from "@app/ui";
import {
  currencySymbol,
  docCapForMoney,
  formatMinor,
} from "@app/billing/format";
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
import { PrepayModalHeader } from "@portal/components/billing/PrepayModalHeader";

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
   * Fired when Stripe signals payment success. Runs the caller's activation flow
   * (poll the wallet until the subscription webhook lands) and resolves {@code
   * true} once subscribed, {@code false} if it's taking longer than the poll
   * window.
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
 * Spend-limit picker for step 1: a primary editable amount ({@code $ 100 / mo}) with quick-pick chips
 * below. The amount field is the main entry — always visible, defaulted, and typeable — and clicking a
 * chip (or "No cap") just writes into it. Controlled via {@code capUsd}/{@code onChange}
 * (null = no cap, a number = a monthly ceiling).
 */
function SpendLimitPicker({
  capUsd,
  onChange,
  currency,
  pricePerDocMinor,
  presets,
  disabled,
}: {
  capUsd: number | null;
  onChange: (v: number | null) => void;
  currency: SaasCurrency;
  pricePerDocMinor?: number | null;
  presets: readonly number[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const sym = currencySymbol(currency);
  const isNoCap = capUsd === null;
  // Local mirror so partial typing isn't clobbered by the controlled value; resync when not focused
  // (e.g. a chip sets the amount, or an initial cap loads in).
  const [text, setText] = useState(capUsd != null ? String(capUsd) : "");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(capUsd != null ? String(capUsd) : "");
  }, [capUsd, focused]);

  const docs = docCapForMoney(capUsd, pricePerDocMinor);

  const onInput = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, "");
    setText(cleaned);
    onChange(cleaned === "" ? 0 : parseInt(cleaned, 10));
  };

  return (
    <div className="portal-billing__caplimit">
      <div
        className="portal-billing__caplimit-field"
        data-nocap={isNoCap ? "true" : "false"}
      >
        <span className="portal-billing__caplimit-sym">{sym}</span>
        <input
          className="portal-billing__caplimit-input"
          inputMode="numeric"
          value={isNoCap ? "" : text}
          placeholder={
            isNoCap ? t("portal.billing.checkout.cap.noLimit", "No limit") : ""
          }
          aria-label={t(
            "portal.billing.checkout.cap.amountAria",
            "Monthly spend limit",
          )}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
        />
        <span className="portal-billing__caplimit-suffix">
          {t("portal.billing.checkout.cap.perMonth", "/ mo")}
        </span>
      </div>

      <div className="portal-billing__caplimit-chips">
        {presets.map((p) => (
          <Button
            key={p}
            type="button"
            variant="quiet"
            className="portal-billing__caplimit-chip"
            data-selected={capUsd === p ? "true" : "false"}
            onClick={() => onChange(p)}
            disabled={disabled}
          >
            {sym}
            {p.toLocaleString()}
          </Button>
        ))}
        <Button
          type="button"
          variant="quiet"
          className="portal-billing__caplimit-chip"
          data-selected={isNoCap ? "true" : "false"}
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          {t("payg.cap.noCapLabel", "No cap")}
        </Button>
      </div>

      {docs != null && (
        <div className="portal-billing__caplimit-estimate">
          <span className="portal-billing__caplimit-estimate-main">
            {t("payg.cap.docsEstimate", "≈ {{docs}} credits / month", {
              docs: docs.toLocaleString(),
            })}
          </span>
          <span className="portal-billing__caplimit-estimate-sub">
            {t("payg.cap.docsRate", "at {{rate}} / credit", {
              rate: formatMinor(pricePerDocMinor ?? 0, currency),
            })}
          </span>
        </div>
      )}
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
      /* Only the Stripe checkout step needs the room; every other step stays narrow. The checkout
         step also gets a wider-than-xl cap so the embedded Stripe iframe clears its ~1000px
         two-column threshold (below it, Stripe falls back to the single-column "portrait" layout). */
      width={phase === "checkout" ? "xl" : "md"}
      className={[
        "portal-billing__checkout-modal",
        phase === "cap" || phase === "checkout"
          ? "portal-billing__checkout-modal--framed"
          : "",
        phase === "checkout" ? "portal-billing__checkout-modal--wide" : "",
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
          <PrepayModalHeader
            step={2}
            total={3}
            title={t(
              "portal.billing.checkout.cap.title",
              "Set your spend limit",
            )}
            onClose={handleClose}
          />
          <div className="portal-billing__checkout-scroll">
            <SpendLimitPicker
              capUsd={capUsd}
              onChange={setCapUsd}
              pricePerDocMinor={pricePerDocMinor}
              currency={currency}
              presets={CAP_PRESETS}
              disabled={capBusy}
            />
            <p className="portal-billing__checkout-finePrint">
              {t(
                "portal.billing.checkout.cap.note",
                "You're never billed past your limit. Processing just pauses.",
              )}
            </p>
            <p className="portal-billing__checkout-finePrint">
              {t(
                "portal.billing.checkout.cap.finePrint",
                "Invoices post monthly. Cancel anytime.",
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
            step={3}
            total={3}
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
