import type { ReactNode } from "react";
import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button, type ButtonAccent } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { Z_INDEX_ONBOARDING_CARD } from "@app/styles/zIndex";
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
  /** Hero art — see {@link ShellHero}. Omit for a slide whose body is a form: the
   *  panel is a fixed block of height that would otherwise show nothing. */
  hero?: ReactNode;
  slideKey: string;
  /** Omit when the body draws its own heading, so the card does not state it twice. */
  title?: ReactNode;
  body: ReactNode;
  stepIndex: number;
  stepCount: number;
  buttons: ShellButton[];
  onAction: (action: string) => void;
  onClose: () => void;
  /** Escape closes the card. Turn off for a flow the user has to move through. */
  allowDismiss?: boolean;
  /** "close" dismisses; "forward" advances, for a flow with no way out. Both call
   *  {@link onClose}; forward is drawn even when `allowDismiss` is false. */
  headerControl?: "close" | "forward";
  /** Standalone prompts supply their own dialog name instead of "Onboarding". */
  ariaLabel?: string;
  /** Prompts opened over a fullscreen editor must sit above that surface. */
  zIndex?: number;
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
  headerControl = "close",
  ariaLabel,
  zIndex = Z_INDEX_ONBOARDING_CARD,
}: OnboardingSlideShellProps) {
  const { t } = useTranslation();
  const showProgress = stepCount > 1;
  const stepLabel = t("onboarding.stepOf", "Step {{current}} of {{total}}", {
    current: stepIndex + 1,
    total: stepCount,
  });

  return (
    // Composed rather than the plain <Modal>, because only Modal.Content lands
    // props on the role="dialog" element — the slide draws its own title, so the
    // dialog needs an aria-label to have an accessible name.
    <Modal.Root
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={allowDismiss}
      centered
      size="lg"
      radius={20}
      zIndex={zIndex}
      styles={{
        body: { padding: 0, maxHeight: "90vh", overflow: "hidden" },
        content: {
          overflow: "hidden",
          border: "none",
          background: "var(--c-surface)",
          maxHeight: "90vh",
        },
      }}
    >
      <Modal.Overlay />
      <Modal.Content
        radius={20}
        aria-label={ariaLabel ?? t("onboarding.dialogLabel", "Onboarding")}
      >
        <Modal.Body>
          <div className={styles.card}>
            <ShellHeader
              stepLabel={showProgress ? stepLabel : null}
              showClose={allowDismiss}
              headerControl={headerControl}
              onClose={onClose}
            />

            {showProgress && (
              <StepProgress
                stepIndex={stepIndex}
                stepCount={stepCount}
                label={stepLabel}
              />
            )}

            <div className={styles.divider} />

            <div className={styles.content}>
              {hero && (
                <div className={styles.heroPanel}>
                  <div className={styles.heroArt} key={`hero-${slideKey}`}>
                    {hero}
                  </div>
                </div>
              )}

              {title && (
                <div key={`title-${slideKey}`} className={styles.titleNew}>
                  {title}
                </div>
              )}

              <div key={`body-${slideKey}`} className={styles.bodyNew}>
                {body}
                <style>{`.${styles.bodyNew} strong{color: var(--c-text); font-weight: 600;}`}</style>
              </div>

              <ShellFooter
                buttons={buttons}
                stepIndex={stepIndex}
                onAction={onAction}
              />
            </div>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

interface ShellHeaderProps {
  stepLabel: string | null;
  showClose: boolean;
  headerControl: "close" | "forward";
  onClose: () => void;
}

function ShellHeader({
  stepLabel,
  showClose,
  headerControl,
  onClose,
}: ShellHeaderProps) {
  return (
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
        {stepLabel && <span className={styles.stepPill}>{stepLabel}</span>}
        <HeaderControl
          showClose={showClose}
          headerControl={headerControl}
          onClose={onClose}
        />
      </div>
    </header>
  );
}

function HeaderControl({
  showClose,
  headerControl,
  onClose,
}: Omit<ShellHeaderProps, "stepLabel">) {
  const { t } = useTranslation();
  const forward = headerControl === "forward";
  if (!showClose && !forward) return null;
  return (
    <ActionIcon
      onClick={onClose}
      variant="tertiary"
      accent="neutral"
      size="md"
      aria-label={
        forward
          ? t("onboarding.buttons.continue", "Continue")
          : t("common.close", "Close")
      }
    >
      <Icon name={forward ? "arrow-right" : "x"} size="1.1rem" />
    </ActionIcon>
  );
}

function StepProgress({
  stepIndex,
  stepCount,
  label,
}: {
  stepIndex: number;
  stepCount: number;
  label: string;
}) {
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-valuenow={stepIndex + 1}
      aria-valuemin={1}
      aria-valuemax={stepCount}
      aria-label={label}
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
  );
}

function ShellFooter({
  buttons,
  stepIndex,
  onAction,
}: {
  buttons: ShellButton[];
  stepIndex: number;
  onAction: (action: string) => void;
}) {
  const { t } = useTranslation();

  // Back/icon buttons anchor the left; text actions cluster on the right.
  // A back control can't do anything on the first slide, so hide it there.
  const backButtons = stepIndex === 0 ? [] : buttons.filter((b) => b.back);
  const actionButtons = buttons.filter((b) => !b.back);

  const actions = (
    <div className={styles.footerGroup}>
      {actionButtons.map((button) => (
        <Button
          key={button.key}
          onClick={() => onAction(button.action)}
          disabled={button.disabled}
          variant={button.primary ? "primary" : "quiet"}
          accent={button.accent ?? (button.primary ? "default" : "neutral")}
        >
          {button.label}
        </Button>
      ))}
    </div>
  );

  if (backButtons.length === 0) {
    return (
      <div className={styles.footer}>
        <div className={styles.footerEnd}>{actions}</div>
      </div>
    );
  }
  return (
    <div className={styles.footer}>
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
              <Icon name="chevron-left" size={20} />
            </ActionIcon>
          ))}
        </div>
        {actions}
      </div>
    </div>
  );
}
