import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
// The trademarked Stirling wordmark — the font is baked into the SVG (no brand webfont is loaded),
// so we render the same asset the portal nav uses rather than styled text. Theme-switched in CSS.
import wordmarkLight from "@app/assets/brand/modern-logo/StirlingProcessorLogoBlackText.svg";
import wordmarkDark from "@app/assets/brand/modern-logo/StirlingProcessorLogoWhiteText.svg";
import "@portal/components/shared/StepModalHeader.css";

/**
 * Header for any stepped flow modal: an identity row (brand wordmark or the flow's own title) with a
 * "Step N of M" badge and close, an M-segment progress bar, and the current step's title.
 *
 * Shared so a flow's chrome is not re-implemented per flow — the prepay wizard, the metered
 * checkout, and the procurement quote builder all wear this. The step label is passed already
 * translated: each flow keeps its own copy key rather than this component inventing a shared one.
 */
export function StepModalHeader({
  title,
  step,
  total,
  stepLabel,
  brand = false,
  className,
  closeLabel,
  onClose,
}: {
  /** The current step's heading. Omit when the host modal already renders one. */
  title?: string;
  /** 1-based current step. Omit to hide the badge and the progress bar (e.g. a terminal receipt). */
  step?: number;
  /** Segments to draw. Any length — a flow is not limited to three steps. */
  total?: number;
  /** Pre-translated "Step 2 of 3"; omitted renders no badge. */
  stepLabel?: string;
  /** Show the Stirling wordmark instead of a plain heading, for flows that stand alone. */
  brand?: boolean;
  /** Extra class on the root, so a host modal can still own its padding/layout. */
  className?: string;
  closeLabel?: string;
  /** Omit when the host modal already owns a close control, so there is only ever one. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const showSteps = step != null && total != null && total > 0;

  return (
    <div className={`portal-stepmodal__head ${className ?? ""}`.trim()}>
      <div className="portal-stepmodal__head-top">
        {brand ? (
          <div className="portal-stepmodal__brand">
            <img
              src={wordmarkLight}
              alt="Stirling"
              className="portal-stepmodal__wordmark wordmark-light-only"
            />
            <img
              src={wordmarkDark}
              alt=""
              aria-hidden
              className="portal-stepmodal__wordmark wordmark-dark-only"
            />
          </div>
        ) : title ? (
          <h3 className="portal-stepmodal__flow-title">{title}</h3>
        ) : (
          <span />
        )}
        <div className="portal-stepmodal__head-right">
          {stepLabel && (
            <span className="portal-stepmodal__step">{stepLabel}</span>
          )}
          {onClose && (
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              shape="circle"
              onClick={onClose}
              aria-label={closeLabel ?? t("portal.stepModal.close", "Close")}
              leftSection={
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              }
            />
          )}
        </div>
      </div>

      {showSteps && (
        <div className="portal-stepmodal__progress" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < step ? "is-filled" : ""} />
          ))}
        </div>
      )}

      {/* With the wordmark up top the step title carries the heading; without it the flow title
          already did, so repeating it here would say the same thing twice. */}
      {brand && <div className="portal-stepmodal__title">{title}</div>}
    </div>
  );
}
