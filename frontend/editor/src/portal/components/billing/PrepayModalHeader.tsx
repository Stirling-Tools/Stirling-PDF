import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
// The trademarked Stirling wordmark — the font is baked into the SVG (no brand webfont is loaded), so
// we render the same asset the portal nav uses rather than styled text. Theme-switched in CSS.
import wordmarkLight from "@app/assets/brand/modern-logo/StirlingProcessorLogoBlackText.svg";
import wordmarkDark from "@app/assets/brand/modern-logo/StirlingProcessorLogoWhiteText.svg";

/**
 * Shared header for the prepay-flow modals — the prepaid wizard (activation → calculator → pay, of 3)
 * and the metered checkout (spend limit → payment, of 2): Stirling brand + "Step N of M" badge + close,
 * an M-segment progress bar, and the step title. Pass {@code step=undefined} to hide the badge +
 * progress (e.g. a terminal confirmation).
 */
export function PrepayModalHeader({
  step,
  total = 3,
  title,
  onClose,
}: {
  step?: number;
  /** Total steps in this flow (3 for the prepaid wizard, 2 for the metered checkout). */
  total?: number;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showSteps = step != null;
  const filled = step ?? 0;
  return (
    <div className="portal-billing__bundle-head">
      <div className="portal-billing__bundle-head-top">
        <div className="portal-billing__bundle-brand">
          <img
            src={wordmarkLight}
            alt="Stirling"
            className="portal-billing__bundle-wordmark wordmark-light-only"
          />
          <img
            src={wordmarkDark}
            alt=""
            aria-hidden
            className="portal-billing__bundle-wordmark wordmark-dark-only"
          />
        </div>
        <div className="portal-billing__bundle-head-right">
          {showSteps && (
            <span className="portal-billing__bundle-step">
              {t(
                "portal.billing.prepaid.buy.step",
                "Step {{current}} of {{total}}",
                { current: step, total },
              )}
            </span>
          )}
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            shape="circle"
            onClick={onClose}
            aria-label={t("portal.billing.prepaid.buy.close", "Close")}
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
        </div>
      </div>
      {showSteps && (
        <div className="portal-billing__bundle-progress" aria-hidden>
          <span className={filled >= 1 ? "is-filled" : ""} />
          <span className={filled >= 2 ? "is-filled" : ""} />
          {total >= 3 && <span className={filled >= 3 ? "is-filled" : ""} />}
        </div>
      )}
      <div className="portal-billing__bundle-head-title">{title}</div>
    </div>
  );
}
