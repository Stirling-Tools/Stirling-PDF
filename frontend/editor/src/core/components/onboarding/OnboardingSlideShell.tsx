import type { ReactNode } from "react";
import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button, type ButtonAccent } from "@app/ui/Button";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import stirlingMark from "@app/assets/brand/modern-logo/logo512.png";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";

/** A footer button. `action` is an opaque string handled by the caller. */
export interface ShellButton {
  key: string;
  /** Chevron-left icon button (a back control) instead of a labelled button. */
  back?: boolean;
  label?: string;
  /** Filled primary (blue) vs. quiet text button. */
  primary?: boolean;
  /** Accent override for a primary button (e.g. "premium"). */
  accent?: ButtonAccent;
  action: string;
  disabled?: boolean;
}

export interface OnboardingSlideShellProps {
  opened?: boolean;
  /** Hero art node — use {@link ShellHero} to render the app mark or a glyph. */
  hero: ReactNode;
  slideKey: string;
  title: ReactNode;
  body: ReactNode;
  stepIndex: number;
  stepCount: number;
  buttons: ShellButton[];
  onAction: (action: string) => void;
  onClose: () => void;
  allowDismiss?: boolean;
}

/**
 * Hero art for the inset panel. `appIcon` renders the Stirling app mark
 * directly; otherwise the children glyph sits inside a soft white tile.
 */
export function ShellHero({
  appIcon = false,
  children,
}: {
  appIcon?: boolean;
  children?: ReactNode;
}) {
  if (appIcon) {
    return (
      <img src={stirlingMark} alt="Stirling" className={styles.heroAppIcon} />
    );
  }
  return <div className={styles.heroTile}>{children}</div>;
}

/**
 * Shared onboarding slide chrome: branded header + step progress, an inset
 * hero panel, left-aligned title/body, and a right-aligned action footer.
 * Generic over button actions so every flow (editor, SaaS, portal) renders
 * the same card.
 */
export default function OnboardingSlideShell({
  opened = true,
  hero,
  slideKey,
  title,
  body,
  stepIndex,
  stepCount,
  buttons,
  onAction,
  onClose,
  allowDismiss = true,
}: OnboardingSlideShellProps) {
  const { t } = useTranslation();
  const showProgress = stepCount > 1;

  // Back/icon buttons anchor the left; text actions cluster on the right.
  // A back control can't do anything on the first slide, so hide it there.
  const backButtons = stepIndex === 0 ? [] : buttons.filter((b) => b.back);
  const actionButtons = buttons.filter((b) => !b.back);

  const renderButton = (button: ShellButton) => (
    <Button
      key={button.key}
      onClick={() => onAction(button.action)}
      disabled={button.disabled}
      variant={button.primary ? "primary" : "quiet"}
      accent={button.accent ?? (button.primary ? "default" : "neutral")}
    >
      {button.label}
    </Button>
  );

  const actions = (
    <div className={styles.footerGroup}>{actionButtons.map(renderButton)}</div>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={allowDismiss}
      centered
      size="lg"
      radius={20}
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      styles={{
        body: { padding: 0, maxHeight: "90vh", overflow: "hidden" },
        content: {
          overflow: "hidden",
          border: "none",
          background: "var(--bg-surface)",
          maxHeight: "90vh",
        },
      }}
    >
      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <img
              src={stirlingMark}
              alt=""
              aria-hidden="true"
              className={styles.brandLogo}
            />
            <span className={styles.wordmark}>Stirling</span>
          </div>
          <div className={styles.headerRight}>
            {showProgress && (
              <span className={styles.stepPill}>
                {t("onboarding.stepOf", "Step {{current}} of {{total}}", {
                  current: stepIndex + 1,
                  total: stepCount,
                })}
              </span>
            )}
            {allowDismiss && (
              <ActionIcon
                onClick={onClose}
                variant="tertiary"
                accent="neutral"
                size="md"
                aria-label={t("common.close", "Close")}
              >
                <LocalIcon
                  icon="close-rounded"
                  width="1.1rem"
                  height="1.1rem"
                />
              </ActionIcon>
            )}
          </div>
        </header>

        {showProgress && (
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={stepCount}
          >
            {Array.from({ length: stepCount }, (_, index) => (
              <span
                key={index}
                className={`${styles.progressSeg} ${
                  index <= stepIndex ? styles.progressSegDone : ""
                }`}
              />
            ))}
          </div>
        )}

        <div className={styles.divider} />

        <div className={styles.content}>
          <div className={styles.heroPanel}>
            <div className={styles.heroArt} key={`hero-${slideKey}`}>
              {hero}
            </div>
          </div>

          <div key={`title-${slideKey}`} className={styles.titleNew}>
            {title}
          </div>

          <div key={`body-${slideKey}`} className={styles.bodyNew}>
            {body}
            <style>{`.${styles.bodyNew} strong{color: var(--onboarding-title); font-weight: 600;}`}</style>
          </div>

          <div className={styles.footer}>
            {backButtons.length === 0 ? (
              <div className={styles.footerEnd}>{actions}</div>
            ) : (
              <div className={styles.footerBetween}>
                <div className={styles.footerGroup}>
                  {backButtons.map((button) => (
                    <ActionIcon
                      key={button.key}
                      onClick={() => onAction(button.action)}
                      variant="tertiary"
                      accent="neutral"
                      disabled={button.disabled}
                      aria-label={t("onboarding.buttons.back", "Back")}
                    >
                      <ChevronLeftIcon fontSize="small" />
                    </ActionIcon>
                  ))}
                </div>
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
