import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Checkbox,
  Modal,
  NumberInput,
  SegmentedControl,
  Spinner,
} from "@app/ui";
import {
  bundleCapacityUnits,
  bundleListMinor,
  bundlePriceMinor,
  formatMinor,
  type Wallet,
} from "@app/billing";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import {
  createBundleCheckoutSession,
  getStripePublishableKey,
} from "@portal/billing/stripe";
import { LockIcon } from "@portal/components/icons";

/**
 * Prepaid-bundle purchase modal for the Processor billing page — "12 months for
 * the price of 10". Three steps inside the shared portal {@link Modal}:
 *
 *   1. Size your year — monthly PDF volume × governance posture × file-size tier
 *      → a recommended 12-month capacity + its discounted price. All local.
 *   2. Pay — one-time Stripe Embedded Checkout. Capacity ({@code units}) is sent
 *      straight to the checkout edge fn (billed quantity × unit_amount + coupon —
 *      no server quote ticket).
 *   3. Confirm — brief "your prepaid year is active" beat; the parent refetches
 *      the wallet (the pool lands via the Stripe webhook, never here).
 *
 * Size folds into the units (a bigger PDF draws more), so the flat per-unit rate
 * reproduces the marketing calculator's size-weighted total. The per-unit rate +
 * the 10/12 discount live in {@code @app/billing} helpers shared with the backend.
 */

/** Governance posture multipliers, mirroring the marketing calculator. */
const POSTURES = [
  { id: "essentials", mult: 1.4 },
  { id: "governed", mult: 2.4 },
  { id: "regulated", mult: 4.0 },
] as const;
/** File-size tier — the "physics" axis. */
const SIZES = [
  { id: "compact", mult: 1.0 },
  { id: "standard", mult: 1.4 },
  { id: "heavy", mult: 2.4 },
] as const;
/** Above this yearly capacity the demo routes to enterprise; we just nudge. */
const ENTERPRISE_CAPACITY_HINT = 1_000_000;

/**
 * EULA version the prepay consent is recorded against (ARL/EULA §7.2). Legal owns
 * the final value + copy; placeholder until the terms are finalised. Sent to the
 * checkout edge fn as proof of what was agreed, and recorded in the session metadata.
 */
const CONSENT_EULA_VERSION = "2026-07-draft";

function multFor(
  tiers: readonly { id: string; mult: number }[],
  id: string,
): number {
  return tiers.find((tt) => tt.id === id)?.mult ?? tiers[0].mult;
}

let stripePromise: Promise<Stripe | null> | null = null;
function loadStripeOnce(pk: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    stripePromise = import("@stripe/stripe-js").then((m) => m.loadStripe(pk));
  }
  return stripePromise;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Drives teamId, per-unit rate, currency, and top-up vs first-buy copy. */
  wallet: Wallet;
  /** Fired after a completed purchase so the parent can refetch the wallet. */
  onComplete?: () => void;
}

type Phase = "calc" | "pay" | "done";

export function BundleCheckoutModal({
  open,
  onClose,
  wallet,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const teamId = wallet.teamId;
  const currency = wallet.currency ?? "usd";
  const pricePerDocMinor = wallet.pricePerDocMinor;
  const topUp = wallet.prepaidUnitsTotal > 0;

  const [phase, setPhase] = useState<Phase>("calc");
  const [volume, setVolume] = useState(5000);
  const [postureId, setPostureId] = useState<string>("governed");
  const [sizeId, setSizeId] = useState<string>("standard");
  const [consented, setConsented] = useState(false);

  // Reset to step 1 whenever the modal closes so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase("calc");
      setVolume(5000);
      setPostureId("governed");
      setSizeId("standard");
      setConsented(false);
    }
  }, [open]);

  const capacity = useMemo(
    () =>
      bundleCapacityUnits(
        volume,
        multFor(POSTURES, postureId),
        multFor(SIZES, sizeId),
      ),
    [volume, postureId, sizeId],
  );
  const listMinor = bundleListMinor(capacity, pricePerDocMinor);
  const priceMinor = bundlePriceMinor(capacity, pricePerDocMinor);
  const savingsMinor =
    listMinor != null && priceMinor != null ? listMinor - priceMinor : null;

  if (!open || teamId == null) return null;

  function handleContinue() {
    if (capacity <= 0 || !consented) return;
    setPhase("pay");
  }

  function finish() {
    onClose();
    onComplete?.();
  }

  const title =
    phase === "done"
      ? t("portal.billing.prepaid.buy.doneTitle", "Your prepaid year is active")
      : topUp
        ? t("portal.billing.prepaid.buy.topUpTitle", "Top up prepaid capacity")
        : t(
            "portal.billing.prepaid.buy.title",
            "Get 12 months for the price of 10",
          );
  const subtitle =
    phase === "calc"
      ? t(
          "portal.billing.prepaid.buy.subtitle",
          "Prepay a year of PDF processing up front at a discount. Prepaid capacity is used before metered billing and sits outside your spend limit; unused capacity expires after 12 months.",
        )
      : undefined;

  const footer =
    phase === "calc" ? (
      <div className="portal-billing__checkout-cap-actions">
        <Button variant="quiet" onClick={onClose}>
          {t("portal.billing.prepaid.buy.cancel", "Cancel")}
        </Button>
        <Button
          accent="premium"
          disabled={capacity <= 0 || !consented}
          onClick={handleContinue}
          rightSection={<span aria-hidden>›</span>}
        >
          {t("portal.billing.prepaid.buy.continue", "Continue to payment")}
        </Button>
      </div>
    ) : phase === "done" ? (
      <div className="portal-billing__bundle-foot-end">
        <Button accent="premium" onClick={finish}>
          {t("portal.billing.prepaid.buy.finish", "Done")}
        </Button>
      </div>
    ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      className="portal-billing__checkout-modal"
      title={title}
      subtitle={subtitle}
      footer={footer}
    >
      {phase === "calc" && (
        <CalculatorStep
          volume={volume}
          setVolume={setVolume}
          postureId={postureId}
          setPostureId={setPostureId}
          sizeId={sizeId}
          setSizeId={setSizeId}
          capacity={capacity}
          priceMinor={priceMinor}
          savingsMinor={savingsMinor}
          currency={currency}
          consented={consented}
          setConsented={setConsented}
        />
      )}
      {phase === "pay" && (
        <PaymentStep
          key={`bundle:${capacity}`}
          teamId={teamId}
          units={capacity}
          consented={consented}
          eulaVersion={CONSENT_EULA_VERSION}
          onComplete={() => setPhase("done")}
        />
      )}
      {phase === "done" && (
        <ConfirmationStep
          units={capacity}
          priceMinor={priceMinor}
          currency={currency}
        />
      )}
    </Modal>
  );
}

// ─── Step 1: calculator ─────────────────────────────────────────────────────

interface CalcProps {
  volume: number;
  setVolume: (v: number) => void;
  postureId: string;
  setPostureId: (v: string) => void;
  sizeId: string;
  setSizeId: (v: string) => void;
  capacity: number;
  priceMinor: number | null;
  savingsMinor: number | null;
  currency: string;
  consented: boolean;
  setConsented: (v: boolean) => void;
}

function CalculatorStep({
  volume,
  setVolume,
  postureId,
  setPostureId,
  sizeId,
  setSizeId,
  capacity,
  priceMinor,
  savingsMinor,
  currency,
  consented,
  setConsented,
}: CalcProps) {
  const { t } = useTranslation();
  const postureOptions = [
    {
      value: "essentials",
      label: t("portal.billing.prepaid.posture.essentials", "Essentials"),
    },
    {
      value: "governed",
      label: t("portal.billing.prepaid.posture.governed", "Governed"),
    },
    {
      value: "regulated",
      label: t("portal.billing.prepaid.posture.regulated", "Regulated"),
    },
  ];
  const sizeOptions = [
    {
      value: "compact",
      label: t("portal.billing.prepaid.size.compact", "Compact"),
    },
    {
      value: "standard",
      label: t("portal.billing.prepaid.size.standard", "Standard"),
    },
    { value: "heavy", label: t("portal.billing.prepaid.size.heavy", "Heavy") },
  ];

  return (
    <div className="portal-billing__bundle-calc">
      <div className="portal-billing__bundle-fields">
        <div className="portal-billing__bundle-field">
          <div className="portal-billing__bundle-field-label">
            {t(
              "portal.billing.prepaid.calc.volumeLabel",
              "PDFs processed / month",
            )}
          </div>
          <NumberInput
            value={volume}
            onChange={(v) => setVolume(typeof v === "number" ? v : 0)}
            min={0}
            step={500}
            allowNegative={false}
            aria-label={t(
              "portal.billing.prepaid.calc.volumeLabel",
              "PDFs processed / month",
            )}
          />
        </div>

        <div className="portal-billing__bundle-field">
          <div className="portal-billing__bundle-field-label">
            {t(
              "portal.billing.prepaid.calc.postureLabel",
              "Governance posture",
            )}
          </div>
          <SegmentedControl
            fullWidth
            options={postureOptions}
            value={postureId}
            onChange={setPostureId}
            ariaLabel={t(
              "portal.billing.prepaid.calc.postureLabel",
              "Governance posture",
            )}
          />
        </div>

        <div className="portal-billing__bundle-field">
          <div className="portal-billing__bundle-field-label">
            {t("portal.billing.prepaid.calc.sizeLabel", "Typical file size")}
          </div>
          <SegmentedControl
            fullWidth
            options={sizeOptions}
            value={sizeId}
            onChange={setSizeId}
            ariaLabel={t(
              "portal.billing.prepaid.calc.sizeLabel",
              "Typical file size",
            )}
          />
        </div>
      </div>

      <div className="portal-billing__bundle-summary">
        <div className="portal-billing__bundle-summary-row">
          <span>
            {t("portal.billing.prepaid.calc.capacityLabel", "Prepaid capacity")}
          </span>
          <strong>
            {t(
              "portal.billing.prepaid.calc.capacityValue",
              "{{units}} PDFs / year",
              {
                units: capacity.toLocaleString(),
              },
            )}
          </strong>
        </div>
        {priceMinor != null ? (
          <>
            <div className="portal-billing__bundle-summary-row">
              <span>
                {t("portal.billing.prepaid.calc.priceLabel", "One-time price")}
              </span>
              <strong>{formatMinor(priceMinor, currency)}</strong>
            </div>
            {savingsMinor != null && savingsMinor > 0 && (
              <p className="portal-billing__bundle-savings">
                {t(
                  "portal.billing.prepaid.calc.savings",
                  "You save {{amount}} — 2 months free.",
                  {
                    amount: formatMinor(savingsMinor, currency),
                  },
                )}
              </p>
            )}
          </>
        ) : (
          <p className="portal-billing__bundle-savings">
            {t(
              "portal.billing.prepaid.calc.rateUnknown",
              "We'll show the exact price at checkout.",
            )}
          </p>
        )}
        {capacity > ENTERPRISE_CAPACITY_HINT && (
          <p className="portal-billing__bundle-savings">
            {t(
              "portal.billing.prepaid.calc.enterpriseHint",
              "Processing at this scale? Talk to us about an enterprise agreement for better rates.",
            )}
          </p>
        )}
      </div>

      {/* Affirmative consent to the prepaid→metered auto-transition, captured before
          payment (ARL/EULA §7.2). Un-pre-checked; gates Continue. Copy is legal-owned. */}
      <div className="portal-billing__bundle-consent">
        <Checkbox
          checked={consented}
          onChange={(e) => setConsented(e.currentTarget.checked)}
          label={t(
            "portal.billing.prepaid.consent.label",
            "I understand that when my prepaid capacity is used up or expires after 12 months, processing automatically continues at the standard metered pay-as-you-go rate (up to my spend limit) unless I cancel, and that I can cancel anytime from the billing portal.",
          )}
        />
      </div>
    </div>
  );
}

// ─── Step 2: Stripe embedded checkout ────────────────────────────────────────

function PaymentStep({
  teamId,
  units,
  consented,
  eulaVersion,
  onComplete,
}: {
  teamId: number;
  units: number;
  consented: boolean;
  eulaVersion: string;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const publishableKey = getStripePublishableKey();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No publishable key (Storybook / preview / mis-config): skip minting and let
    // the mock placeholder drive the completion path so the flow stays testable.
    if (!publishableKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    createBundleCheckoutSession({
      teamId,
      units,
      consented,
      eulaVersion,
      successUrl: window.location.href,
      cancelUrl: window.location.href,
    })
      .then((session) => {
        if (cancelled) return;
        if (session.redirectUrl && !session.clientSecret) {
          window.open(session.redirectUrl, "_blank", "noopener,noreferrer");
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
  }, [publishableKey, teamId, units, consented, eulaVersion]);

  const stripe = publishableKey ? loadStripeOnce(publishableKey) : null;

  if (!publishableKey) {
    return (
      <div className="portal-billing__checkout-pay">
        <CardPlaceholder />
        <div className="portal-billing__bundle-foot-end">
          <Button accent="premium" onClick={onComplete}>
            {t("portal.billing.prepaid.buy.mockPay", "Complete purchase")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-billing__checkout-pay">
      {error && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.prepaid.buy.payErrorTitle",
            "Couldn't start checkout",
          )}
        >
          {error}
        </Banner>
      )}
      {loading && !error && (
        <div className="portal-billing__checkout-loading" role="status">
          <Spinner size="lg" />
        </div>
      )}
      {!loading && !error && stripe && clientSecret && (
        <EmbeddedCheckoutProvider
          stripe={stripe}
          options={{ clientSecret, onComplete }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  );
}

/** Card-form stand-in when no Stripe key is configured (Storybook / preview). */
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

// ─── Step 3: confirmation ─────────────────────────────────────────────────────

function ConfirmationStep({
  units,
  priceMinor,
  currency,
}: {
  units: number;
  priceMinor: number | null;
  currency: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__bundle-confirm">
      <p className="portal-billing__bundle-confirm-body">
        {t(
          "portal.billing.prepaid.buy.doneBody",
          "{{units}} PDFs of prepaid capacity are ready. They're used before metered billing and expire 12 months from today.",
          { units: units.toLocaleString() },
        )}
      </p>
      {priceMinor != null && (
        <div className="portal-billing__bundle-summary-row">
          <span>{t("portal.billing.prepaid.buy.paidLabel", "Paid today")}</span>
          <strong>{formatMinor(priceMinor, currency)}</strong>
        </div>
      )}
    </div>
  );
}
