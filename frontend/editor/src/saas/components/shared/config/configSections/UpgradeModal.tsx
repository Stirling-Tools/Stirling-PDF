/**
 * Upgrade-to-Processor modal. Two steps inside one frame:
 *
 *   Step 1: Set a monthly spend ceiling (with strong reassurance copy about
 *           what is and isn't billable).
 *   Step 2: Stripe Embedded Checkout for card collection.
 *
 * The frame stays put between steps — only the inner panel changes — so the
 * user perceives this as one form, not two pages.
 *
 * <p><b>Step 2 is currently a placeholder.</b> Real wiring requires:
 *   - VITE_STRIPE_PUBLISHABLE_KEY in .env
 *   - The {@code POST /api/v1/payg/checkout} backend endpoint (lands later in
 *     this same PR) returning a {@code client_secret} for Stripe.
 *   - {@code @stripe/stripe-js} + {@code @stripe/react-stripe-js} installed.
 * The placeholder renders a dashed box explaining what would appear; the modal
 * shape, animations, and step transitions all work without it so the UX can
 * be reviewed standalone.
 *
 * <p>Cap selection is held in modal state only — it's not posted to the backend
 * until Checkout completes. A user who cancels mid-modal leaves no side-effects.
 */
import React, { useState } from "react";
import CloseIcon from "@mui/icons-material/CloseRounded";
import ShieldIcon from "@mui/icons-material/ShieldOutlined";
// eslint-disable-next-line no-restricted-imports
import "./UpgradeModal.css";

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

type Step = "cap" | "checkout";

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
  const completeCheckout = () => {
    // In real wiring this fires only after the Stripe Embedded Checkout
    // emits its `complete` event. For now we treat the "Complete" button as
    // the signal so the parent can demo the post-upgrade state.
    onComplete({ capUsd: effectiveCap });
  };

  return (
    <div className="upm" role="dialog" aria-modal="true">
      <div className="upm-backdrop" onClick={onClose}>
        <div className="upm-frame" onClick={(e) => e.stopPropagation()}>
          {/* Header — title + close. Title stays constant; the step indicator
              below tells the user where they are. */}
          <header className="upm-header">
            <h2 className="upm-header__title">Upgrade to Processor plan</h2>
            <button
              type="button"
              className="upm-header__close"
              aria-label="Close"
              onClick={onClose}
            >
              <CloseIcon fontSize="small" />
            </button>
          </header>

          {/* Step indicator. Two dots + connector; transitions colour as we
              advance. Same shape both steps so users get an instant "I'm 1 of 2". */}
          <div className="upm-steps">
            <div className="upm-step" data-state={step === "cap" ? "active" : "done"}>
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

          <div className="upm-body">
            {step === "cap" ? (
              <CapStep
                capUsd={capUsd}
                setCapUsd={setCapUsd}
                noCap={noCap}
                setNoCap={setNoCap}
                currency={currency}
              />
            ) : (
              <CheckoutStep
                effectiveCap={effectiveCap}
                currency={currency}
                onEditCap={goBackToCap}
              />
            )}
          </div>

          <footer className="upm-footer">
            <span className="upm-footer__hint">
              {step === "cap"
                ? "You can change your cap any time later."
                : "Card details handled by Stripe — never touched by Stirling."}
            </span>
            <div className="upm-footer__actions">
              {step === "checkout" ? (
                <>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="ghost"
                    onClick={goBackToCap}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="primary"
                    onClick={completeCheckout}
                  >
                    Complete subscription
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="ghost"
                    onClick={onClose}
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
          <span className="upm-promise__highlight">Editing stays free.</span>{" "}
          You only pay when our servers process documents — OCR, conversions,
          AI tools, automation. Browsing and editing in your browser never
          count toward your spend.
        </div>
      </div>

      <h3 className="upm-section-title">Set your monthly spend ceiling</h3>
      <p className="upm-section-help">
        We'll never charge above this. Free-tier documents don't count.
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
          min={1}
          max={10000}
          value={noCap ? "" : capUsd}
          disabled={noCap}
          placeholder="Or enter your own amount"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v)) {
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
        <span className="upm-help-card__title">
          Documents we count toward billing
        </span>
        Server-side jobs: OCR, format conversion, compression, AI tools,
        automation pipelines, batch processing. Anything where Stirling's
        servers do real work on your file.
      </div>
    </>
  );
}

// ─── Step 2: Stripe Embedded Checkout (placeholder for now) ───────────

interface CheckoutStepProps {
  effectiveCap: number | null;
  currency: UpgradeModalProps["currency"];
  onEditCap: () => void;
}

function CheckoutStep({ effectiveCap, currency, onEditCap }: CheckoutStepProps) {
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

      <div className="upm-stripe-mount">
        <div className="upm-stripe-mount__title">
          Stripe Embedded Checkout
        </div>
        <div>
          The card-collection iframe mounts here in production.
        </div>
        <div style={{ marginTop: 4 }}>
          Set{" "}
          <span className="upm-stripe-mount__code">
            VITE_STRIPE_PUBLISHABLE_KEY
          </span>{" "}
          and wire{" "}
          <span className="upm-stripe-mount__code">
            POST /api/v1/payg/checkout
          </span>{" "}
          to activate.
        </div>
      </div>
    </>
  );
}
