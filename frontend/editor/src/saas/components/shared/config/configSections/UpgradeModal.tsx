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
import React, { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/CloseRounded";
import ShieldIcon from "@mui/icons-material/ShieldOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line no-restricted-imports
import "./UpgradeModal.css";

/**
 * Tell the AppConfigModal (or any other full-screen surface listening) that an
 * upgrade overlay is opening/closing so it can hide itself rather than stack
 * under us. Same window-event pattern the config modal already uses for
 * appConfig:navigate / appConfig:notice.
 */
function dispatchOverlay(open: boolean) {
  window.dispatchEvent(
    new CustomEvent("appConfig:overlay", { detail: { open } }),
  );
}

// Lazy-loaded so the @stripe/stripe-js bundle only downloads when the user
// reaches step 2. See StripeCheckoutPanel.tsx for the full pattern + the
// chunk-graph reasoning.
const StripeCheckoutPanel = React.lazy(() => import("./StripeCheckoutPanel"));

interface UpgradeModalProps {
  open: boolean;
  /**
   * The caller's team_id. Threaded through to {@link StripeCheckoutPanel} so the
   * {@code create-checkout-session} edge function can scope the subscription to
   * the right team.
   */
  teamId: number;
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
  /**
   * The team's free-tier allowance in documents/month — the real
   * {@code wallet.billableLimit}, threaded from the free-leader view so the
   * step copy quotes the backend's number instead of a hardcoded one.
   */
  freeLimit: number;
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
  teamId,
  onClose,
  onComplete,
  currency = "USD",
  freeLimit,
}: UpgradeModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("cap");
  const [capUsd, setCapUsd] = useState<number>(25);
  const [noCap, setNoCap] = useState<boolean>(false);

  // The config modal hides itself while we're open (it listens for this event)
  // so the upgrade flow visually REPLACES it instead of stacking inside it.
  // Cleanup fires open=false on unmount too, so the config modal can't get
  // stuck hidden if we unmount without a clean close.
  useEffect(() => {
    dispatchOverlay(open);
    return () => dispatchOverlay(false);
  }, [open]);

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

  // Portal to document.body so the overlay escapes the config modal's portal /
  // stacking context. Without this the fixed-position backdrop layers inside
  // the Mantine modal (z-index 1300) instead of over the whole page, producing
  // the modal-in-modal look.
  return createPortal(
    <div className="upm" role="dialog" aria-modal="true">
      <div className="upm-backdrop" onClick={closeAndReset}>
        <div className="upm-frame" onClick={(e) => e.stopPropagation()}>
          {/* Header — title + close. Title stays constant; the step indicator
              below tells the user where they are. */}
          <header className="upm-header">
            <h2 className="upm-header__title">
              {step === "confirm"
                ? t("payg.upgrade.title.confirm", "You're subscribed")
                : t("payg.upgrade.title.default", "Upgrade to Processor plan")}
            </h2>
            <button
              type="button"
              className="upm-header__close"
              aria-label={t("payg.upgrade.closeAria", "Close")}
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
                <span>
                  {t("payg.upgrade.steps.cap", "Set monthly ceiling")}
                </span>
              </div>
              <div className="upm-step__connector" />
              <div
                className="upm-step"
                data-state={step === "checkout" ? "active" : "idle"}
              >
                <span className="upm-step__dot">2</span>
                <span>
                  {t(
                    "payg.upgrade.steps.payment",
                    "Add payment method",
                  )}
                </span>
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
                freeLimit={freeLimit}
              />
            )}
            {step === "checkout" && (
              // Keyed on the cap value so editing the cap → returning to
              // step 2 unmounts + remounts the panel, triggering a fresh
              // POST /checkout for the new cap. Without the key, the
              // StripeCheckoutPanel's fetchedRef short-circuits and the
              // session keeps the stale cap.
              <CheckoutStep
                key={`co:${effectiveCap ?? "nocap"}`}
                teamId={teamId}
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
                freeLimit={freeLimit}
              />
            )}
          </div>

          <footer className="upm-footer">
            <span className="upm-footer__hint">
              {step === "cap" &&
                t(
                  "payg.upgrade.footer.capHint",
                  "You can change your cap any time later.",
                )}
              {step === "checkout" &&
                t(
                  "payg.upgrade.footer.checkoutHint",
                  "Card details handled by Stripe — never touched by Stirling.",
                )}
              {step === "confirm" &&
                t(
                  "payg.upgrade.footer.confirmHint",
                  "Your wallet will refresh automatically in a moment.",
                )}
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
                    {t("payg.upgrade.button.back", "← Back")}
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
                    {t("payg.upgrade.button.cancel", "Cancel")}
                  </button>
                  <button
                    type="button"
                    className="upm-btn"
                    data-variant="primary"
                    onClick={goToCheckout}
                  >
                    {t("payg.upgrade.button.continue", "Continue →")}
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
                  {t("payg.upgrade.button.finish", "Finish")}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Step 1: cap selection ──────────────────────────────────────────────

interface CapStepProps {
  capUsd: number;
  setCapUsd: (v: number) => void;
  noCap: boolean;
  setNoCap: (v: boolean) => void;
  currency: UpgradeModalProps["currency"];
  freeLimit: number;
}

function CapStep({
  capUsd,
  setCapUsd,
  noCap,
  setNoCap,
  currency,
  freeLimit,
}: CapStepProps) {
  const { t } = useTranslation();
  const sym = currencySymbol(currency);

  return (
    <>
      <div className="upm-promise">
        <ShieldIcon className="upm-promise__icon" fontSize="small" />
        <div>
          <span className="upm-promise__highlight">
            {t(
              "payg.upgrade.promise.highlight",
              "Manual tools stay free, always.",
            )}
          </span>{" "}
          {t(
            "payg.upgrade.promise.body",
            "You only pay for automation pipelines, AI tools, and API calls — the work that goes beyond a single click. Edit, merge, split, sign, compress as much as you want, no charge.",
          )}
        </div>
      </div>

      <h3 className="upm-section-title">
        {t(
          "payg.upgrade.cap.title",
          "Set your monthly spend ceiling",
        )}
      </h3>
      <p className="upm-section-help">
        {t(
          "payg.upgrade.cap.help",
          "We'll never charge above this. Your first {{limit}} documents processed by automation / AI / API every month stay free. Set $0 if you want to keep everything free while testing.",
          { limit: freeLimit.toLocaleString() },
        )}
      </p>

      <div
        className="upm-cap-presets"
        role="radiogroup"
        aria-label={t(
          "payg.upgrade.cap.presetsAria",
          "Monthly cap preset",
        )}
      >
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
          placeholder={t(
            "payg.upgrade.cap.customPlaceholder",
            "Or enter your own amount ($0 keeps it free)",
          )}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v) && v >= 0) {
              setCapUsd(v);
              setNoCap(false);
            }
          }}
          className="upm-cap-input-row__input"
        />
        <span className="upm-cap-input-row__period">
          {t("payg.upgrade.cap.perMonthSuffix", "/ month")}
        </span>
      </label>

      <label className="upm-no-cap-toggle">
        <input
          type="checkbox"
          checked={noCap}
          onChange={(e) => setNoCap(e.target.checked)}
        />
        <span className="upm-no-cap-toggle__text">
          {t(
            "payg.upgrade.cap.noCapLabel",
            "No cap — I'll manage spend manually",
          )}
          <span className="upm-no-cap-toggle__hint">
            {t(
              "payg.upgrade.cap.noCapHint",
              "You can still cancel anytime from the customer portal.",
            )}
          </span>
        </span>
      </label>

      <div className="upm-help-card">
        <span className="upm-help-card__title">
          {t(
            "payg.upgrade.help.title",
            "What we count toward billing",
          )}
        </span>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
          <li>
            <strong>
              {t(
                "payg.upgrade.help.automationTitle",
                "Automation pipelines",
              )}
            </strong>
            {" — "}
            {t(
              "payg.upgrade.help.automationBody",
              "chained tools or scheduled runs that don't need clicks",
            )}
          </li>
          <li>
            <strong>
              {t("payg.upgrade.help.aiTitle", "AI tools")}
            </strong>
            {" — "}
            {t(
              "payg.upgrade.help.aiBody",
              "summarise, classify, redact, AI-OCR",
            )}
          </li>
          <li>
            <strong>
              {t("payg.upgrade.help.apiTitle", "API calls")}
            </strong>
            {" — "}
            {t(
              "payg.upgrade.help.apiBody",
              "programmatic access to any Stirling endpoint",
            )}
          </li>
        </ul>
        <div style={{ marginTop: 8, fontStyle: "italic" }}>
          {t(
            "payg.upgrade.help.footnote",
            "Manual tools — viewing, editing, merging, splitting, signing, watermarking, compressing, manual OCR — are always free, even past 500. The distinction is the type of work, not where you click.",
          )}
        </div>
      </div>
    </>
  );
}

// ─── Step 2: Stripe Embedded Checkout (lazy-loaded) ────────────────────

interface CheckoutStepProps {
  teamId: number;
  effectiveCap: number | null;
  currency: UpgradeModalProps["currency"];
  onEditCap: () => void;
  onComplete: () => void;
}

function CheckoutStep({
  teamId,
  effectiveCap,
  currency,
  onEditCap,
  onComplete,
}: CheckoutStepProps) {
  const { t } = useTranslation();
  const sym = currencySymbol(currency);
  return (
    <>
      <div className="upm-cap-confirmation">
        <span className="upm-cap-confirmation__label">
          {t("payg.upgrade.checkout.capLabel", "Monthly ceiling:")}
        </span>
        <span className="upm-cap-confirmation__value">
          {effectiveCap === null
            ? t("payg.upgrade.checkout.noCap", "No cap")
            : t("payg.upgrade.checkout.capValue", "{{symbol}}{{amount}} / month", {
                symbol: sym,
                amount: effectiveCap,
              })}
        </span>
        <button
          type="button"
          className="upm-cap-confirmation__edit"
          onClick={onEditCap}
        >
          {t("payg.upgrade.checkout.edit", "Edit")}
        </button>
      </div>

      <h3 className="upm-section-title">
        {t(
          "payg.upgrade.checkout.title",
          "Add your payment method",
        )}
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
        <StripeCheckoutPanel
          teamId={teamId}
          currency={currency?.toLowerCase() ?? "gbp"}
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
  freeLimit: number;
}

function ConfirmationStep({
  effectiveCap,
  currency,
  freeLimit,
}: ConfirmationStepProps) {
  const { t } = useTranslation();
  const sym = currencySymbol(currency);
  return (
    <div className="upm-confirm">
      <CheckCircleIcon className="upm-confirm__icon" />
      <h3 className="upm-confirm__title">
        {t(
          "payg.confirm.title",
          "Welcome to the Processor plan",
        )}
      </h3>
      <p className="upm-confirm__body">
        {t(
          "payg.confirm.body",
          "Your team can now process documents with automation, AI, and the API beyond the {{limit}}/month free allowance.",
          { limit: freeLimit.toLocaleString() },
        )}
      </p>
      <div className="upm-confirm__summary">
        <span>{t("payg.confirm.summaryLabel", "Monthly ceiling")}</span>
        <strong>
          {effectiveCap === null
            ? t("payg.confirm.noCap", "No cap")
            : t("payg.confirm.capValue", "{{symbol}}{{amount}} / month", {
                symbol: sym,
                amount: effectiveCap,
              })}
        </strong>
      </div>
      <p className="upm-confirm__note">
        {t(
          "payg.confirm.note",
          "You can change your cap, cancel, or open the Stripe customer portal any time from this page.",
        )}
      </p>
    </div>
  );
}
