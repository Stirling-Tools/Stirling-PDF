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
  BUNDLE_PIPELINE_TIERS,
  BUNDLE_POLICY_POSTURES,
  BUNDLE_SIZE_TIERS,
  computeBundleQuote,
  formatMinor,
} from "@app/billing";
import type { Wallet } from "@portal/api/billing";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  createBundleCheckoutSession,
  getStripePublishableKey,
  loadStripeOnce,
} from "@portal/billing/stripe";
import { CardPlaceholder } from "@portal/components/billing/CardPlaceholder";

/**
 * Prepaid-bundle purchase modal for the Processor billing page — "12 months for
 * the price of 10". Three steps inside the shared portal {@link Modal}:
 *
 *   1. Size your year — buyers size the purchase in PEOPLE. Team size drives an
 *      estimated volume (≈80 PDFs/user/mo), provisioned ~3× above expected; the
 *      finer settings (governance posture, file size, pipelines) scale it up. All
 *      local, via the shared {@code computeBundleQuote} brain.
 *   2. Pay — one-time Stripe Embedded Checkout. The pool ({@code units}) is sent
 *      straight to the checkout edge fn (billed quantity × unit_amount + coupon).
 *   3. Confirm — brief "your prepaid year is active" beat; the parent refetches
 *      the wallet (the pool lands via the Stripe webhook, never here).
 *
 * The pool is denominated in size-folded RUNS — the same currency the meter charges
 * on consumption — so a flat per-run rate reproduces the marketing calculator's
 * total. The run-based brain (policy-count posture, pipelines, 1¢/run, 10/12) lives
 * in {@code @app/billing}, shared with the backend.
 */

/** Default team size the calculator opens on. */
const DEFAULT_USERS = 25;

/**
 * EULA version the prepay consent is recorded against (ARL/EULA §7.2). Legal owns
 * the final value + copy; placeholder until the terms are finalised. Sent to the
 * checkout edge fn as proof of what was agreed, and recorded in the session metadata.
 */
const CONSENT_EULA_VERSION = "2026-07-draft";

function policiesFor(id: string): number {
  return (
    BUNDLE_POLICY_POSTURES.find((p) => p.id === id)?.policies ??
    BUNDLE_POLICY_POSTURES[0].policies
  );
}
function sizeMultFor(id: string): number {
  return BUNDLE_SIZE_TIERS.find((s) => s.id === id)?.mult ?? 1;
}
function pipelineMultFor(id: string): number {
  return BUNDLE_PIPELINE_TIERS.find((p) => p.id === id)?.mult ?? 1;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Drives teamId, per-run rate, currency, and top-up vs first-buy copy. */
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
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [postureId, setPostureId] = useState<string>("governed");
  const [sizeId, setSizeId] = useState<string>("standard");
  const [pipelineId, setPipelineId] = useState<string>("none");
  const [consented, setConsented] = useState(false);

  // Reset to step 1 whenever the modal closes so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase("calc");
      setUsers(DEFAULT_USERS);
      setPostureId("governed");
      setSizeId("standard");
      setPipelineId("none");
      setConsented(false);
    }
  }, [open]);

  const quote = useMemo(
    () =>
      computeBundleQuote({
        users,
        posturePolicies: policiesFor(postureId),
        sizeMult: sizeMultFor(sizeId),
        pipelineMult: pipelineMultFor(pipelineId),
        ratePerRunMinor: pricePerDocMinor,
      }),
    [users, postureId, sizeId, pipelineId, pricePerDocMinor],
  );

  if (!open || teamId == null) return null;

  const canContinue =
    quote.poolCredits > 0 && consented && !quote.overEnterprise;

  function handleContinue() {
    if (!canContinue) return;
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
          disabled={!canContinue}
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
          users={users}
          setUsers={setUsers}
          postureId={postureId}
          setPostureId={setPostureId}
          sizeId={sizeId}
          setSizeId={setSizeId}
          pipelineId={pipelineId}
          setPipelineId={setPipelineId}
          quote={quote}
          currency={currency}
          consented={consented}
          setConsented={setConsented}
        />
      )}
      {phase === "pay" && (
        <PaymentStep
          key={`bundle:${quote.poolCredits}`}
          teamId={teamId}
          units={quote.poolCredits}
          consented={consented}
          eulaVersion={CONSENT_EULA_VERSION}
          onComplete={() => setPhase("done")}
        />
      )}
      {phase === "done" && (
        <ConfirmationStep
          credits={quote.poolCredits}
          priceMinor={quote.priceMinor}
          currency={currency}
        />
      )}
    </Modal>
  );
}

// ─── Step 1: users-first calculator ──────────────────────────────────────────

interface CalcProps {
  users: number;
  setUsers: (v: number) => void;
  postureId: string;
  setPostureId: (v: string) => void;
  sizeId: string;
  setSizeId: (v: string) => void;
  pipelineId: string;
  setPipelineId: (v: string) => void;
  quote: ReturnType<typeof computeBundleQuote>;
  currency: string;
  consented: boolean;
  setConsented: (v: boolean) => void;
}

function CalculatorStep({
  users,
  setUsers,
  postureId,
  setPostureId,
  sizeId,
  setSizeId,
  pipelineId,
  setPipelineId,
  quote,
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
  const pipelineOptions = [
    {
      value: "none",
      label: t("portal.billing.prepaid.pipelines.none", "None"),
    },
    {
      value: "standard",
      label: t("portal.billing.prepaid.pipelines.standard", "Standard"),
    },
    {
      value: "advanced",
      label: t("portal.billing.prepaid.pipelines.advanced", "Advanced"),
    },
  ];

  return (
    <div className="portal-billing__bundle-calc">
      <div className="portal-billing__bundle-fields">
        <div className="portal-billing__bundle-field">
          <div className="portal-billing__bundle-field-label">
            {t("portal.billing.prepaid.calc.usersLabel", "Total users")}
          </div>
          <NumberInput
            value={users}
            onChange={(v) => setUsers(typeof v === "number" ? v : 0)}
            min={0}
            step={1}
            allowNegative={false}
            aria-label={t(
              "portal.billing.prepaid.calc.usersLabel",
              "Total users",
            )}
          />
          <p className="portal-billing__bundle-field-hint">
            {t(
              "portal.billing.prepaid.calc.usersHint",
              "We estimate your volume from your team size — adjust the finer settings below if you know better.",
            )}
          </p>
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

        <div className="portal-billing__bundle-field">
          <div className="portal-billing__bundle-field-label">
            {t("portal.billing.prepaid.calc.pipelinesLabel", "Pipelines")}
          </div>
          <SegmentedControl
            fullWidth
            options={pipelineOptions}
            value={pipelineId}
            onChange={setPipelineId}
            ariaLabel={t(
              "portal.billing.prepaid.calc.pipelinesLabel",
              "Pipelines",
            )}
          />
        </div>
      </div>

      <div className="portal-billing__bundle-summary">
        <div className="portal-billing__bundle-summary-row">
          <span>
            {t("portal.billing.prepaid.calc.handlesLabel", "Your Processor")}
          </span>
          <strong>
            {t(
              "portal.billing.prepaid.calc.handlesValue",
              "handles {{volume}} PDFs / month",
              { volume: quote.provisionedMonthlyVolume.toLocaleString() },
            )}
          </strong>
        </div>
        {quote.priceMinor != null ? (
          <>
            <div className="portal-billing__bundle-summary-row">
              <span>
                {t(
                  "portal.billing.prepaid.calc.priceLabel",
                  "One-time price · 12 months for the price of 10",
                )}
              </span>
              <strong>{formatMinor(quote.priceMinor, currency)}</strong>
            </div>
            {quote.savingsMinor != null && quote.savingsMinor > 0 && (
              <p className="portal-billing__bundle-savings">
                {t(
                  "portal.billing.prepaid.calc.savings",
                  "You save {{amount}} — 2 months free.",
                  { amount: formatMinor(quote.savingsMinor, currency) },
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
        {quote.poolCredits > 0 && (
          <p className="portal-billing__bundle-pool">
            {t(
              "portal.billing.prepaid.calc.poolCaption",
              "One pool of {{credits}} credits for the year. Heavy months borrow from light ones.",
              { credits: quote.poolCredits.toLocaleString() },
            )}
          </p>
        )}
        {quote.overEnterprise && (
          <p className="portal-billing__bundle-savings">
            {t(
              "portal.billing.prepaid.calc.enterpriseHint",
              "This is enterprise scale. Talk to us for a committed-volume quote with better rates.",
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
        // Bundle checkout is embedded-only (the edge fn returns a client_secret, never a redirect
        // URL), so there's no hosted-redirect branch to handle here.
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

// ─── Step 3: confirmation ─────────────────────────────────────────────────────

function ConfirmationStep({
  credits,
  priceMinor,
  currency,
}: {
  credits: number;
  priceMinor: number | null;
  currency: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__bundle-confirm">
      <p className="portal-billing__bundle-confirm-body">
        {t(
          "portal.billing.prepaid.buy.doneBody",
          "{{credits}} credits of prepaid capacity are ready. They're used before metered billing and expire 12 months from today.",
          { credits: credits.toLocaleString() },
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
