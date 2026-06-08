/**
 * Upgrade-to-Processor modal. Three sequential panels inside one frame:
 *
 *   Step 1: Cap selection         — local state only, no side effects
 *   Step 2: Stripe Checkout       — POSTs to /api/v1/payg/checkout, mounts the
 *                                   Stripe Embedded Checkout iframe (lazy-loaded)
 *   Step 3: Confirmation          — brief "Welcome to Processor" beat before
 *                                   the modal closes and the parent's
 *                                   {@code onComplete} triggers a wallet refetch
 *
 * <p>The Stripe SDK ({@code @stripe/stripe-js} + {@code @stripe/react-stripe-js})
 * is loaded via {@code React.lazy} on a dedicated module so the chunk only
 * downloads when the user actually advances to step 2. The main bundle pays
 * nothing for users who never open the modal.
 *
 * <p>Cap state is held locally — nothing reaches the backend until the user
 * commits in step 2. A user who cancels mid-modal leaves no side effects.
 */
import React, { Suspense, useState } from "react";
import CloseIcon from "@mui/icons-material/CloseRounded";
import ShieldIcon from "@mui/icons-material/ShieldOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
// eslint-disable-next-line no-restricted-imports
import "./UpgradeModal.css";

// Lazy-loaded so the @stripe/stripe-js bundle only downloads when the user
// reaches step 2. See StripeCheckoutPanel.tsx for the full pattern + the
// chunk-graph reasoning.
const StripeCheckoutPanel = React.lazy(() => import("./StripeCheckoutPanel"));

interface UpgradeModalProps {
  open: boolean;
  /** Called when the user closes the modal without completing checkout. */
  onClose: () => void;
  /**
   * Called after the user confirms cap + completes Stripe checkout. The parent
   * is expected to refresh the wallet snapshot which will then show the
   * subscribed state.
   */
  onComplete: (result: { capUsd: number | null }) => void;
  /** ISO 4217 currency code for the cap input. Default USD. */
  currency?: "USD" | "EUR" | "GBP";
}

type Step = "cap" | "checkout" | "confirm";

const CAP_PRESETS_USD = [10, 25, 50, 100] as const;

function currencySymbol(c: UpgradeModalProps["currency"]): string {
  switch (c) {
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return "$";
  }
}

export default function UpgradeModal({
  open,
  onClose,
  onComplete,
  currency = "USD",
}: UpgradeModalProps) {
  const [step, setStep] = useState<Step>("cap");
  const [capUsd, setCapUsd] = useState<number>(25);
  const [noCap, setNoCap] = useState<boolean>(false);

  if (!open) {
    return null;
  }

  const effectiveCap = noCap ? null : capUsd;

  const goToCheckout = () => setStep("checkout");
  const goBackToCap = () => setStep("cap");
  const goToConfirm = () => setStep("confirm");

  // Modal close → reset internal step so reopening starts at step 1.
  const closeAndReset = () => {
    setStep("cap");
    onClose();
  };

  return (
    <div className="upm" role="dialog" aria-modal="true">
      <div className="upm-backdrop" onClick={closeAndReset}>
        <div className="upm-frame" onClick={(e) => e.stopPropagation()}>
          {/* Header — title + close. Title stays constant; the step indicator
              below tells the user where they are. */}
          <header className="upm-header">
            <h2 className="upm-header__title">
              {step === "confirm"
                ? "You're subscribed"
                : "Upgrade to Processor plan"}
            </h2>
            <button
              type="button"
              className="upm-header__close"
              aria-label="Close"
              onClick={closeAndReset}
            >
              <CloseIcon fontSize="small" />
            </button>
          </header>

          {/* Step indicator. Hidden on the confirmation panel since the
              modal is winding down at that point. */}
          {step !== "confirm" && (
            <div className="upm-steps">
              <div
                className="upm-step"
                data-state={step === "cap" ? "active" : "done"}
              >
                <span className="upm-step__dot">1</span>
                <span>Set monthly ceiling</span>
              </div>
              <div className="upm-step__connector" />
              <div
                className="upm-step"
                data-state={step === "checkout" ? "active" : "idle"}
              >
                <span className="upm-step__dot">2</span>
                <span>Add payment method</span>
              </div>
            </div>
          )}

          <div className="upm-body">
            {step === "cap" && (
              <CapStep
                capUsd={capUsd}
                setCapUsd={setCapUsd}
                noCap={noCap}
                setNoCap={setNoCap}
                currency={currency}
              />
            )}
            {step === "checkout" && (
              <CheckoutStep
                effectiveCap={effectiveCap}
                currency={currency}
                onEditCap={goBackToCap}
                onComplete={goToConfirm}
              />
            )}
            {step === "confirm" && (
              <ConfirmationStep
                effectiveCap={effectiveCap}
                currency={currency}
              />
            )}
          </div>

          <footer className="upm-footer">
            <span className="upm-footer__hint">
              {step === "cap" && "You can change your cap any time later."}
              {step === "checkout" &&
                "Card details handled by Stripe — never touched by Stirling."}
              {step === "confirm" &&
                "Your wallet will refresh automatically in a moment."}
            </span>
            <div className="upm-footer__actions">
              {step === "checkout" && (
                <>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="ghost"
                    onClick={goBackToCap}
                  >
                    ← Back
                  </button>
                </>
              )}
              {step === "cap" && (
                <>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="ghost"
                    onClick={closeAndReset}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="primary"
                    onClick={goToCheckout}
                  >
                    Continue →
                  </button>
                </>
              )}
              {step === "confirm" && (
                <button
                  type="button"
                  className="upm-btn"
                  data-variant="primary"
                  onClick={() => {
                    setStep("cap");
                    onComplete({ capUsd: effectiveCap });
                  }}
                >
                  Finish
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: cap selection ──────────────────────────────────────────────

interface CapStepProps {
  capUsd: number;
  setCapUsd: (v: number) => void;
  noCap: boolean;
  setNoCap: (v: boolean) => void;
  currency: UpgradeModalProps["currency"];
}

function CapStep({ capUsd, setCapUsd, noCap, setNoCap, currency }: CapStepProps) {
  const sym = currencySymbol(currency);

  return (
    <>
      <div className="upm-promise">
        <ShieldIcon className="upm-promise__icon" fontSize="small" />
        <div>
          <span className="upm-promise__highlight">
            Manual tools stay free, always.
          </span>{" "}
          You only pay for automation pipelines, AI tools, and API calls —
          the work that goes beyond a single click. Edit, merge, split,
          sign, compress as much as you want, no charge.
        </div>
      </div>

      <h3 className="upm-section-title">Set your monthly spend ceiling</h3>
      <p className="upm-section-help">
        We'll never charge above this. Your first 500 automation / AI / API
        operations every month are free. Set $0 if you want to keep
        everything free while testing.
      </p>

      <div className="upm-cap-presets" role="radiogroup" aria-label="Monthly cap preset">
        {CAP_PRESETS_USD.map((preset) => (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={!noCap && capUsd === preset}
            className="upm-cap-preset"
            data-selected={!noCap && capUsd === preset}
            onClick={() => {
              setNoCap(false);
              setCapUsd(preset);
            }}
          >
            {sym}
            {preset}
          </button>
        ))}
      </div>

      <label className="upm-cap-input-row" htmlFor="upm-cap-amount">
        <span className="upm-cap-input-row__currency">{sym}</span>
        <input
          id="upm-cap-amount"
          type="number"
          inputMode="numeric"
          min={0}
          max={10000}
          value={noCap ? "" : capUsd}
          disabled={noCap}
          placeholder="Or enter your own amount ($0 keeps it free)"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v) && v >= 0) {
              setCapUsd(v);
              setNoCap(false);
            }
          }}
          className="upm-cap-input-row__input"
        />
        <span className="upm-cap-input-row__period">/ month</span>
      </label>

      <label className="upm-no-cap-toggle">
        <input
          type="checkbox"
          checked={noCap}
          onChange={(e) => setNoCap(e.target.checked)}
        />
        <span className="upm-no-cap-toggle__text">
          No cap — I'll manage spend manually
          <span className="upm-no-cap-toggle__hint">
            You can still cancel anytime from the customer portal.
          </span>
        </span>
      </label>

      <div className="upm-help-card">
        <span className="upm-help-card__title">What we count toward billing</span>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
          <li>
            <strong>Automation pipelines</strong> — chained tools or scheduled
            runs that don't need clicks
          </li>
          <li>
            <strong>AI tools</strong> — summarise, classify, redact, AI-OCR
          </li>
          <li>
            <strong>API calls</strong> — programmatic access to any Stirling
            endpoint
          </li>
        </ul>
        <div style={{ marginTop: 8, fontStyle: "italic" }}>
          Manual tools — viewing, editing, merging, splitting, signing,
          watermarking, compressing, manual OCR — are always free, even
          past 500. The distinction is the type of work, not where you
          click.
        </div>
      </div>
    </>
  );
}

// ─── Step 2: Stripe Embedded Checkout (lazy-loaded) ────────────────────

interface CheckoutStepProps {
  effectiveCap: number | null;
  currency: UpgradeModalProps["currency"];
  onEditCap: () => void;
  onComplete: () => void;
}

function CheckoutStep({
  effectiveCap,
  currency,
  onEditCap,
  onComplete,
}: CheckoutStepProps) {
  const sym = currencySymbol(currency);
  return (
    <>
      <div className="upm-cap-confirmation">
        <span className="upm-cap-confirmation__label">Monthly ceiling:</span>
        <span className="upm-cap-confirmation__value">
          {effectiveCap === null ? "No cap" : `${sym}${effectiveCap} / month`}
        </span>
        <button
          type="button"
          className="upm-cap-confirmation__edit"
          onClick={onEditCap}
        >
          Edit
        </button>
      </div>

      <h3 className="upm-section-title">Add your payment method</h3>
      <p className="upm-section-help">
        Stripe handles your card details. Stirling never sees them.
      </p>

      <Suspense
        fallback={
          <div className="upm-stripe-mount" data-state="loading">
            <div className="upm-stripe-mount__title">Loading checkout…</div>
          </div>
        }
      >
        <StripeCheckoutPanel
          capUsd={effectiveCap}
          onComplete={onComplete}
        />
      </Suspense>
    </>
  );
}

// ─── Step 3: confirmation ──────────────────────────────────────────────

interface ConfirmationStepProps {
  effectiveCap: number | null;
  currency: UpgradeModalProps["currency"];
}

function ConfirmationStep({ effectiveCap, currency }: ConfirmationStepProps) {
  const sym = currencySymbol(currency);
  return (
    <div className="upm-confirm">
      <CheckCircleIcon className="upm-confirm__icon" />
      <h3 className="upm-confirm__title">Welcome to the Processor plan</h3>
      <p className="upm-confirm__body">
        Your team can now run automation, AI, and API operations beyond the
        500/month free allowance.
      </p>
      <div className="upm-confirm__summary">
        <span>Monthly ceiling</span>
        <strong>
          {effectiveCap === null ? "No cap" : `${sym}${effectiveCap} / month`}
        </strong>
      </div>
      <p className="upm-confirm__note">
        You can change your cap, cancel, or open the Stripe customer portal
        any time from this page.
      </p>
    </div>
  );
}
