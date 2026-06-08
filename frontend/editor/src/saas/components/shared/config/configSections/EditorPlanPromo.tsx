/**
 * Editor → Processor plan promo page.
 *
 * Shown to free (unsubscribed) users in the Plan / Billing nav slot, in place of
 * the {@code Payg.tsx} dashboard that subscribed users see. The single job of this
 * screen is to make the "editing is always free; you only pay when our servers
 * process documents" promise unmissable, and to make the upgrade flow one click
 * away.
 *
 * Marketing names (per 2026-06 product call):
 *   - "Editor plan"     = free; everything that runs in the browser
 *   - "Processor plan"  = pay-as-you-go; server-side jobs, AI, automation
 *
 * Code keeps the internal name PAYG. Renaming the FE strings later is a one-place
 * change via the i18n keys this component reads.
 */
import React from "react";
import CheckIcon from "@mui/icons-material/CheckRounded";
import BoltIcon from "@mui/icons-material/BoltRounded";
import ShieldIcon from "@mui/icons-material/ShieldOutlined";
// eslint-disable-next-line no-restricted-imports
import "./EditorPlanPromo.css";

interface EditorPlanPromoProps {
  /**
   * Called when the user clicks the "Upgrade to Processor" CTA. Parent owns the
   * modal so the promo stays presentation-only.
   */
  onUpgradeClick: () => void;
}

const EDITOR_FEATURES = [
  "View any PDF — fast in-browser viewer",
  "Edit pages: reorder, split, merge",
  "Annotate, highlight, redact",
  "Fill and sign forms",
  "Add images, watermarks, page numbers",
  "Export PDFs and password-protect",
];

const PROCESSOR_FEATURES = [
  "Everything in the Editor plan",
  "OCR — extract text from scans",
  "Compress + convert (Word, Excel, images, …)",
  "AI tools — summarise, redact, classify, AI-OCR",
  "Server-side automation pipelines",
  "Batch processing on the server",
];

export default function EditorPlanPromo({
  onUpgradeClick,
}: EditorPlanPromoProps) {
  return (
    <div className="epp" data-testid="editor-plan-promo">
      {/* Hero — anchors the promise. Eyebrow pill + headline + supporting line. */}
      <header className="epp-hero">
        <div className="epp-hero__eyebrow">
          <ShieldIcon style={{ fontSize: "0.85rem" }} />
          No card needed to edit
        </div>
        <h2 className="epp-hero__title">
          Editing is{" "}
          <span className="epp-hero__accent">free, forever.</span>
        </h2>
        <p className="epp-hero__subtitle">
          You only pay when our servers process documents — OCR, conversions,
          AI, automation. Everything else stays free.
        </p>
      </header>

      {/* Two-card comparison. Left is the current plan (neutral); right is the
          upgrade option (gradient border + interactive). */}
      <div className="epp-cards">
        <article className="epp-card" data-testid="editor-plan-card">
          <div className="epp-card__head">
            <span className="epp-card__name">Editor plan</span>
            <span className="epp-card__pill" data-tone="current">
              Current
            </span>
          </div>
          <div className="epp-card__price">
            <span className="epp-card__price-amount">Free</span>
            <span className="epp-card__price-period">forever</span>
          </div>
          <p className="epp-card__tagline">
            Everything that runs in your browser. No account upgrade required.
          </p>
          <ul className="epp-card__features">
            {EDITOR_FEATURES.map((feature) => (
              <li key={feature} className="epp-card__feature">
                <CheckIcon className="epp-card__feature-icon" fontSize="small" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="epp-card__cta"
            data-variant="neutral"
            disabled
          >
            You're on this plan
          </button>
          <p className="epp-card__footnote">No payment method required.</p>
        </article>

        <article
          className="epp-card"
          data-emphasis="true"
          data-testid="processor-plan-card"
        >
          <div className="epp-card__head">
            <span className="epp-card__name">
              <BoltIcon
                style={{
                  fontSize: "1.05rem",
                  marginRight: 4,
                  verticalAlign: "-3px",
                  color: "var(--epp-accent)",
                }}
              />
              Processor plan
            </span>
            <span className="epp-card__pill" data-tone="upgrade">
              Upgrade
            </span>
          </div>
          <div className="epp-card__price">
            <span className="epp-card__price-amount">Pay-as-you-go</span>
          </div>
          <p className="epp-card__price-sub">
            From $0.02 per processed document · monthly cap is yours to set
          </p>
          <p className="epp-card__tagline">
            Unlock server-side tools. You set a monthly ceiling; you only pay
            for what's actually processed.
          </p>
          <ul className="epp-card__features">
            {PROCESSOR_FEATURES.map((feature) => (
              <li key={feature} className="epp-card__feature">
                <CheckIcon className="epp-card__feature-icon" fontSize="small" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="epp-card__cta"
            data-variant="primary"
            onClick={onUpgradeClick}
            data-testid="upgrade-cta"
          >
            Upgrade to Processor →
          </button>
          <p className="epp-card__footnote">
            Set your monthly ceiling · Cancel anytime
          </p>
        </article>
      </div>

      {/* Bottom reinforcement strip. Belt to the hero's braces. */}
      <footer className="epp-footer">
        <span className="epp-footer__highlight">
          The Editor stays free regardless.
        </span>
        <span className="epp-footer__divider">·</span>
        <span>
          Processor billing only kicks in when you upload a document for our
          servers to process — and only above your free-tier allowance.
        </span>
      </footer>
    </div>
  );
}
