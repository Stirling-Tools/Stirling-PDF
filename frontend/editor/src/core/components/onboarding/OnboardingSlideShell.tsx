import type { ReactNode } from "react";
import { Modal, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import LocalIcon from "@app/components/shared/LocalIcon";
import AnimatedSlideBackground from "@app/components/onboarding/slides/AnimatedSlideBackground";
import OnboardingStepper from "@app/components/onboarding/OnboardingStepper";
import type { AnimatedSlideBackgroundProps } from "@app/types/types";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import stirlingLogo from "@app/assets/brand/modern-logo/StirlingPDFLogoNoTextLight.svg";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";

/** A button in the shell footer. `action` is an opaque string handled by the caller. */
export interface ShellButton {
  key: string;
  /** Chevron-left icon button (a back control) instead of a labelled button. */
  back?: boolean;
  label?: string;
  variant?: "primary" | "secondary" | "tertiary";
  group: "left" | "right";
  action: string;
  disabled?: boolean;
}

export interface OnboardingSlideShellProps {
  opened?: boolean;
  /** Icon shown in the hero circle; "logo" renders the Stirling logo image. */
  heroType?: string;
  background: AnimatedSlideBackgroundProps;
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

const HERO_ICON: Record<string, string> = {
  rocket: "rocket-launch",
  shield: "verified-user-outline",
  lock: "lock-outline",
  analytics: "analytics",
  policy: "layers",
  processor: "layers",
};

/**
 * Shared onboarding slide chrome (hero + animated background + title + body +
 * stepper + footer buttons). Generic over the button actions so both the editor
 * flow and the portal flow can drive it. Mirrors the SaaS/editor slide look by
 * reusing the same background, stepper, and CSS module.
 */
export default function OnboardingSlideShell({
  opened = true,
  heroType = "logo",
  background,
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
  const leftButtons = buttons.filter((b) => b.group === "left");
  const rightButtons = buttons.filter((b) => b.group === "right");

  const renderHero = () => {
    if (heroType === "logo") {
      return (
        <div className={styles.heroLogoCircle}>
          <img src={stirlingLogo} alt="Stirling logo" />
        </div>
      );
    }
    return (
      <div className={styles.heroLogoCircle}>
        <LocalIcon
          icon={HERO_ICON[heroType] ?? HERO_ICON.rocket}
          width={64}
          height={64}
          className={styles.heroIcon}
        />
      </div>
    );
  };

  const renderButton = (button: ShellButton) => {
    if (button.back) {
      return (
        <ActionIcon
          key={button.key}
          onClick={() => onAction(button.action)}
          variant="secondary"
          accent="neutral"
          disabled={button.disabled}
          aria-label={t("onboarding.buttons.back", "Back")}
        >
          <ChevronLeftIcon fontSize="small" />
        </ActionIcon>
      );
    }
    return (
      <Button
        key={button.key}
        onClick={() => onAction(button.action)}
        disabled={button.disabled}
        variant={button.variant ?? "secondary"}
      >
        {button.label}
      </Button>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={allowDismiss}
      centered
      size="lg"
      radius="lg"
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
      <Stack gap={0} className={styles.modalContent}>
        <div className={styles.heroWrapper}>
          <AnimatedSlideBackground
            gradientStops={background.gradientStops}
            circles={background.circles}
            isActive
            slideKey={slideKey}
          />
          {allowDismiss && (
            <ActionIcon
              onClick={onClose}
              variant="tertiary"
              size="lg"
              aria-label={t("common.close", "Close")}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                color: "white",
                backdropFilter: "blur(4px)",
                zIndex: 10,
              }}
            >
              <LocalIcon
                icon="close-rounded"
                width="1.25rem"
                height="1.25rem"
              />
            </ActionIcon>
          )}
          <div className={styles.heroLogo} key={`logo-${slideKey}`}>
            {renderHero()}
          </div>
        </div>

        <div
          className={styles.modalBody}
          style={{ overflowY: "auto", maxHeight: "calc(90vh - 220px)" }}
        >
          <Stack gap={16}>
            <div
              key={`title-${slideKey}`}
              className={`${styles.title} ${styles.titleText}`}
            >
              {title}
            </div>

            <div className={styles.bodyText}>
              <div
                key={`body-${slideKey}`}
                className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}
              >
                {body}
              </div>
              <style>{`div strong{color: var(--onboarding-title); font-weight: 600;}`}</style>
            </div>

            {stepCount > 1 && (
              <OnboardingStepper
                totalSteps={stepCount}
                activeStep={stepIndex}
              />
            )}

            <div className={styles.buttonContainer}>
              {leftButtons.length === 0 ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {rightButtons.map(renderButton)}
                </div>
              ) : rightButtons.length === 0 ? (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  {leftButtons.map(renderButton)}
                </div>
              ) : (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", gap: 12 }}>
                    {leftButtons.map(renderButton)}
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    {rightButtons.map(renderButton)}
                  </div>
                </div>
              )}
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}
