/**
 * Prepaid-bundle purchase modal — "prepay a year, get 2 months free". Two working
 * panels inside the shared upgrade-modal frame (reuses UpgradeModal.css):
 *
 *   Step 1: Calculator  — monthly PDF volume × governance posture × file-size
 *                         tier → a recommended 12-month capacity + its discounted
 *                         price. All local; the server quote is minted only on
 *                         Continue (POST /api/v1/payg/bundle/quote via quoteBundle).
 *   Step 2: Checkout     — the one-time Stripe Embedded Checkout for that quote
 *                         (BundleCheckoutPanel, lazy-loaded).
 *   Step 3: Confirmation — brief "your prepaid year is active" beat, then the
 *                         parent refetches the wallet (pool lands via the webhook).
 *
 * <p>Size folds into the units (a bigger PDF simply draws more), so the flat
 * per-unit rate reproduces the marketing calculator's size-weighted total — the
 * demo framing, "coming out in the wash" through usage. The per-unit rate + the
 * 10/12 discount live in {@code @app/billing} helpers shared with the backend.
 */
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Group, NumberInput, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import CloseIcon from "@mui/icons-material/CloseRounded";
import ArrowBackIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
import SavingsIcon from "@mui/icons-material/SavingsOutlined";
import { useTranslation } from "react-i18next";
import {
  bundleCapacityUnits,
  bundleListMinor,
  bundlePriceMinor,
  currencySymbol,
  formatMinor,
  type BundleQuote,
} from "@app/billing";
import { alert as showToast } from "@app/components/toast";
// eslint-disable-next-line no-restricted-imports
import "./UpgradeModal.css";

/**
 * Governance posture (how many policy runs a typical PDF draws) — the multipliers
 * mirror the marketing calculator (Essentials ×1.4 / Governed ×2.4 / Regulated
 * ×4.0). The label is the one billing question a buyer can actually answer.
 */
interface Tier {
  id: string;
  mult: number;
}
const POSTURES: Tier[] = [
  { id: "essentials", mult: 1.4 },
  { id: "governed", mult: 2.4 },
  { id: "regulated", mult: 4.0 },
];
/** File-size tier — the "physics" axis (Compact ×1.0 / Standard ×1.4 / Heavy ×2.4). */
const SIZES: Tier[] = [
  { id: "compact", mult: 1.0 },
  { id: "standard", mult: 1.4 },
  { id: "heavy", mult: 2.4 },
];
/** Above this yearly capacity the demo routes to enterprise; we just nudge. */
const ENTERPRISE_CAPACITY_HINT = 1_000_000;

function multFor(tiers: Tier[], id: string): number {
  return tiers.find((tt) => tt.id === id)?.mult ?? tiers[0].mult;
}

// Lazy so the @stripe/* chunks only download when the buyer reaches step 2
// (same pattern as UpgradeModal → StripeCheckoutPanel). Props are inferred from
// the default export, so no eager import is needed.
const LazyBundleCheckoutPanel = React.lazy(
  () =>
    import("@app/components/shared/config/configSections/BundleCheckoutPanel"),
);

interface BundleCheckoutModalProps {
  open: boolean;
  teamId: number;
  /** Per-unit rate (minor units) for the live estimate; from {@code wallet.pricePerDocMinor}. */
  pricePerDocMinor?: number | null;
  /** Lower-case ISO currency of the rate (e.g. {@code "usd"}). */
  currency?: string | null;
  /** Server-price + persist a quote ticket for {@code units}; from {@code useWallet}. */
  quoteBundle: (units: number) => Promise<BundleQuote>;
  onClose: () => void;
  /** Fired after a completed purchase; the parent refetches the wallet. */
  onComplete: () => void;
  /** True when the team already holds a bundle — switches copy to "top up". */
  topUp?: boolean;
}

type Step = "calculator" | "checkout" | "confirm";

export default function BundleCheckoutModal({
  open,
  teamId,
  pricePerDocMinor,
  currency,
  quoteBundle,
  onClose,
  onComplete,
  topUp = false,
}: BundleCheckoutModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("calculator");
  const [volume, setVolume] = useState<number>(5000);
  const [postureId, setPostureId] = useState<string>("governed");
  const [sizeId, setSizeId] = useState<string>("standard");
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<BundleQuote | null>(null);

  // Hide the config modal behind us while open (same event the upgrade flow uses).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("appConfig:overlay", { detail: { open } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("appConfig:overlay", { detail: { open: false } }),
      );
    };
  }, [open]);

  const postureMult = multFor(POSTURES, postureId);
  const sizeMult = multFor(SIZES, sizeId);
  const capacity = useMemo(
    () => bundleCapacityUnits(volume, postureMult, sizeMult),
    [volume, postureMult, sizeMult],
  );
  const listMinor = bundleListMinor(capacity, pricePerDocMinor);
  const priceMinor = bundlePriceMinor(capacity, pricePerDocMinor);
  const savingsMinor =
    listMinor != null && priceMinor != null ? listMinor - priceMinor : null;

  if (!open) return null;

  const closeAndReset = () => {
    setStep("calculator");
    setQuote(null);
    onClose();
  };

  const handleContinue = async () => {
    if (capacity <= 0) return;
    setQuoting(true);
    try {
      const q = await quoteBundle(capacity);
      setQuote(q);
      setStep("checkout");
    } catch (e: unknown) {
      console.warn("[BundleCheckoutModal] quote failed", e);
      showToast({
        alertType: "warning",
        title: t("payg.prepaid.quoteError.title", "Couldn't price your bundle"),
        body: t(
          "payg.prepaid.quoteError.body",
          "We couldn't build a quote just now. Try again in a moment.",
        ),
        location: "bottom-right",
      });
    } finally {
      setQuoting(false);
    }
  };

  const title = topUp
    ? t("payg.prepaid.modal.titleTopUp", "Top up prepaid capacity")
    : t("payg.prepaid.modal.title", "Prepay a year");

  return createPortal(
    <div className="upm" role="dialog" aria-modal="true">
      <div className="upm-backdrop" onClick={closeAndReset}>
        <div className="upm-frame" onClick={(e) => e.stopPropagation()}>
          <header className="upm-header">
            <div className="upm-header__left">
              {step === "checkout" && (
                <ActionIcon
                  variant="tertiary"
                  aria-label={t("payg.upgrade.backAria", "Back")}
                  onClick={() => setStep("calculator")}
                  style={{ marginLeft: -6 }}
                >
                  <ArrowBackIcon fontSize="small" />
                </ActionIcon>
              )}
              <h2 className="upm-header__title">
                {step === "confirm"
                  ? t("payg.prepaid.modal.titleConfirm", "Your year is active")
                  : title}
              </h2>
            </div>
            <ActionIcon
              variant="tertiary"
              aria-label={t("payg.upgrade.closeAria", "Close")}
              onClick={closeAndReset}
            >
              <CloseIcon fontSize="small" />
            </ActionIcon>
          </header>

          {step !== "confirm" && (
            <div className="upm-steps">
              <div
                className="upm-step"
                data-state={step === "calculator" ? "active" : "done"}
              >
                <span className="upm-step__dot">1</span>
                <span>{t("payg.prepaid.steps.size", "Size your year")}</span>
              </div>
              <div className="upm-step__connector" />
              <div
                className="upm-step"
                data-state={step === "checkout" ? "active" : "idle"}
              >
                <span className="upm-step__dot">2</span>
                <span>{t("payg.prepaid.steps.pay", "Pay")}</span>
              </div>
            </div>
          )}

          <div className="upm-body">
            {step === "calculator" && (
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
              />
            )}
            {step === "checkout" && quote && (
              <CheckoutStep
                key={`bundle:${quote.quoteId}`}
                teamId={teamId}
                quoteId={quote.quoteId}
                onComplete={() => setStep("confirm")}
              />
            )}
            {step === "confirm" && quote && (
              <ConfirmationStep quote={quote} currency={currency} />
            )}
          </div>

          {step !== "checkout" && (
            <footer className="upm-footer">
              <div className="upm-footer__actions">
                {step === "calculator" && (
                  <>
                    <Button variant="secondary" onClick={closeAndReset}>
                      {t("payg.upgrade.button.cancel", "Cancel")}
                    </Button>
                    <Button
                      onClick={handleContinue}
                      loading={quoting}
                      disabled={capacity <= 0}
                    >
                      {t("payg.upgrade.button.continue", "Continue →")}
                    </Button>
                  </>
                )}
                {step === "confirm" && (
                  <Button
                    onClick={() => {
                      setStep("calculator");
                      setQuote(null);
                      onComplete();
                    }}
                  >
                    {t("payg.upgrade.button.finish", "Finish")}
                  </Button>
                )}
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Step 1: calculator ─────────────────────────────────────────────────

interface CalculatorStepProps {
  volume: number;
  setVolume: (v: number) => void;
  postureId: string;
  setPostureId: (v: string) => void;
  sizeId: string;
  setSizeId: (v: string) => void;
  capacity: number;
  priceMinor: number | null;
  savingsMinor: number | null;
  currency?: string | null;
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
}: CalculatorStepProps) {
  const { t } = useTranslation();

  const postureData: { value: string; label: string }[] = [
    {
      value: "essentials",
      label: t("payg.prepaid.posture.essentials", "Essentials"),
    },
    {
      value: "governed",
      label: t("payg.prepaid.posture.governed", "Governed"),
    },
    {
      value: "regulated",
      label: t("payg.prepaid.posture.regulated", "Regulated"),
    },
  ];
  const sizeData: { value: string; label: string }[] = [
    { value: "compact", label: t("payg.prepaid.size.compact", "Compact") },
    { value: "standard", label: t("payg.prepaid.size.standard", "Standard") },
    { value: "heavy", label: t("payg.prepaid.size.heavy", "Heavy") },
  ];

  return (
    <>
      <div className="upm-promise">
        <SavingsIcon className="upm-promise__icon" fontSize="small" />
        <div>
          <span className="upm-promise__highlight">
            {t(
              "payg.prepaid.promise.highlight",
              "12 months for the price of 10.",
            )}
          </span>{" "}
          {t(
            "payg.prepaid.promise.body",
            "Pre-buy a year of processing up front at a discount. Prepaid capacity is used before metered billing and doesn't count toward your spend cap; unused capacity expires after 12 months.",
          )}
        </div>
      </div>

      <h3 className="upm-section-title">
        {t("payg.prepaid.calc.title", "Size your year")}
      </h3>
      <p className="upm-section-help">
        {t(
          "payg.prepaid.calc.help",
          "Estimate your monthly automation/AI/API volume — we'll recommend a 12-month capacity.",
        )}
      </p>

      <Stack gap="md">
        <NumberInput
          label={t("payg.prepaid.calc.volumeLabel", "PDFs processed / month")}
          value={volume}
          onChange={(v) => setVolume(typeof v === "number" ? v : 0)}
          min={0}
          step={500}
          thousandSeparator=","
          allowNegative={false}
        />

        <div>
          <div className="upm-field-label">
            {t("payg.prepaid.calc.postureLabel", "Governance posture")}
          </div>
          <SegmentedControl
            fullWidth
            options={postureData}
            value={postureId}
            onChange={setPostureId}
            ariaLabel={t(
              "payg.prepaid.calc.postureLabel",
              "Governance posture",
            )}
          />
        </div>

        <div>
          <div className="upm-field-label">
            {t("payg.prepaid.calc.sizeLabel", "Typical file size")}
          </div>
          <SegmentedControl
            fullWidth
            options={sizeData}
            value={sizeId}
            onChange={setSizeId}
            ariaLabel={t("payg.prepaid.calc.sizeLabel", "Typical file size")}
          />
        </div>
      </Stack>

      <div className="upm-help-card" style={{ marginTop: 16 }}>
        <Group justify="space-between" align="baseline" wrap="nowrap">
          <span className="upm-help-card__title">
            {t("payg.prepaid.calc.capacityLabel", "Prepaid capacity")}
          </span>
          <strong style={{ fontSize: 15 }}>
            {t("payg.prepaid.calc.capacityValue", "{{units}} PDFs / year", {
              units: capacity.toLocaleString(),
            })}
          </strong>
        </Group>
        {priceMinor != null && (
          <Group justify="space-between" align="baseline" wrap="nowrap" mt={6}>
            <span>{t("payg.prepaid.calc.priceLabel", "One-time price")}</span>
            <strong style={{ fontSize: 15 }}>
              {formatMinor(priceMinor, currency)}
            </strong>
          </Group>
        )}
        {savingsMinor != null && savingsMinor > 0 && (
          <div style={{ marginTop: 6, fontStyle: "italic" }}>
            {t(
              "payg.prepaid.calc.savings",
              "You save {{amount}} — 2 months free.",
              {
                amount: formatMinor(savingsMinor, currency),
              },
            )}
          </div>
        )}
        {capacity > ENTERPRISE_CAPACITY_HINT && (
          <div style={{ marginTop: 8 }}>
            {t(
              "payg.prepaid.calc.enterpriseHint",
              "Processing at this scale? Talk to us about an enterprise agreement for better rates.",
            )}
          </div>
        )}
        {priceMinor == null && (
          <div style={{ marginTop: 8, fontStyle: "italic" }}>
            {t(
              "payg.prepaid.calc.rateUnknown",
              "We'll show the exact price at checkout.",
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Step 2: Stripe checkout ────────────────────────────────────────────

function CheckoutStep({
  teamId,
  quoteId,
  onComplete,
}: {
  teamId: number;
  quoteId: number;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="upm-section-title">
        {t("payg.upgrade.checkout.title", "Add your payment method")}
      </h3>
      <p className="upm-section-help">
        {t(
          "payg.upgrade.checkout.help",
          "Stripe handles your card details. Stirling never sees them.",
        )}
      </p>
      <Suspense
        fallback={
          <div className="upm-stripe-mount" data-state="loading">
            <div className="upm-stripe-mount__title">
              {t("payg.upgrade.checkout.loading", "Loading checkout…")}
            </div>
          </div>
        }
      >
        <LazyBundleCheckoutPanel
          teamId={teamId}
          quoteId={quoteId}
          onComplete={onComplete}
        />
      </Suspense>
    </>
  );
}

// ─── Step 3: confirmation ───────────────────────────────────────────────

function ConfirmationStep({
  quote,
  currency,
}: {
  quote: BundleQuote;
  currency?: string | null;
}) {
  const { t } = useTranslation();
  const sym = currencySymbol(currency ?? quote.currency);
  return (
    <div className="upm-confirm">
      <CheckCircleIcon className="upm-confirm__icon" />
      <h3 className="upm-confirm__title">
        {t("payg.prepaid.confirm.title", "Your prepaid year is active")}
      </h3>
      <p className="upm-confirm__body">
        {t(
          "payg.prepaid.confirm.body",
          "{{units}} PDFs of prepaid capacity are ready. They're used before metered billing and expire 12 months from today.",
          { units: quote.units.toLocaleString() },
        )}
      </p>
      {quote.totalAmountMinor != null && (
        <div className="upm-confirm__summary">
          <span>{t("payg.prepaid.confirm.paidLabel", "Paid today")}</span>
          <strong>
            {`${sym}${(quote.totalAmountMinor / 100).toLocaleString()}`}
          </strong>
        </div>
      )}
    </div>
  );
}
