import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
// No brand webfont is loaded, so the wordmark must be this SVG rather than styled text.
import wordmarkLight from "@app/assets/brand/modern-logo/StirlingProcessorLogoBlackText.svg";
import wordmarkDark from "@app/assets/brand/modern-logo/StirlingProcessorLogoWhiteText.svg";
import "@app/components/shared/StepModalHeader.css";

/**
 * Header for any stepped flow modal: identity row, step badge, progress bar, step title. Worn by
 * the prepay wizard, the metered checkout and the procurement quote builder.
 *
 * <p>The step label arrives already translated, so each flow keeps its own copy key.
 */
export function StepModalHeader({
  title,
  subtitle,
  step,
  total,
  stepLabel,
  aside,
  brand = false,
  className,
  closeLabel,
  onClose,
}: {
  /** The current step's heading. Omit when the host modal already renders one. */
  title?: string;
  /** A line under the title, for a heading that needs qualifying. */
  subtitle?: ReactNode;
  /** Actions belonging to what is on screen, seated before the close. */
  aside?: ReactNode;
  /** 1-based current step. Omit to hide the badge and the progress bar (e.g. a terminal receipt). */
  step?: number;
  /** Segments to draw; any length. */
  total?: number;
  /** Pre-translated "Step 2 of 3"; omitted renders no badge. */
  stepLabel?: string;
  /** Show the Stirling wordmark instead of a plain heading, for flows that stand alone. */
  brand?: boolean;
  /** Extra class on the root, so a host modal can own its own padding. */
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
            {/* `wordmark`, not `wordmark-light-only`: theme.css hides the former in dark mode and
                has no rule for the latter, so both used to render at once. */}
            <img
              src={wordmarkLight}
              alt="Stirling"
              className="portal-stepmodal__wordmark wordmark"
            />
            <img
              src={wordmarkDark}
              alt=""
              aria-hidden
              className="portal-stepmodal__wordmark wordmark-dark-only"
            />
          </div>
        ) : title ? (
          <div className="portal-stepmodal__ident">
            <h3 className="portal-stepmodal__flow-title">{title}</h3>
            {subtitle && (
              <p className="portal-stepmodal__flow-sub">{subtitle}</p>
            )}
          </div>
        ) : (
          <span />
        )}
        <div className="portal-stepmodal__head-right">
          {aside}
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
