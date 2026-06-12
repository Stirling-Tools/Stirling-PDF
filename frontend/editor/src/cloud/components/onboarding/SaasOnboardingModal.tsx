import React from "react";
import { Modal, Stack } from "@mantine/core";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import { useTranslation } from "react-i18next";
import AnimatedSlideBackground from "@app/components/onboarding/slides/AnimatedSlideBackground";
import OnboardingStepper from "@app/components/onboarding/OnboardingStepper";
import { renderButtons } from "@app/components/onboarding/renderButtons";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";
import { useSaasOnboardingState } from "@app/components/onboarding/useSaasOnboardingState";
import { BASE_PATH } from "@app/constants/app";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

interface SaasOnboardingModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Drop the closing "desktop-install" slide. Set by the desktop app, which
   * reuses this flow but has no reason to pitch its own download. Defaults to
   * false (slide shown) so the web (saas) flow is unchanged.
   */
  hideDesktopInstall?: boolean;
}

export default function SaasOnboardingModal(props: SaasOnboardingModalProps) {
  const { t } = useTranslation();
  const flow = useSaasOnboardingState(props);

  if (!flow) {
    return null;
  }

  const {
    currentStep,
    totalSteps,
    currentSlide,
    slideDefinition,
    flowState,
    handleButtonAction,
  } = flow;

  const renderHero = () => {
    if (slideDefinition.hero.type === "dual-icon") {
      return (
        <div className={styles.heroIconsContainer}>
          <div className={styles.iconWrapper}>
            <img
              src={`${BASE_PATH}/modern-logo/logo512.png`}
              alt="Stirling icon"
              className={styles.downloadIcon}
            />
          </div>
        </div>
      );
    }

    if (slideDefinition.hero.type === "logo") {
      return (
        <img
          src={`${BASE_PATH}/modern-logo/logo512.png`}
          alt="Stirling logo"
          className={styles.standaloneIcon}
        />
      );
    }

    return (
      <div className={styles.heroLogoCircle}>
        {slideDefinition.hero.type === "bolt" && (
          <BoltRoundedIcon sx={{ fontSize: 64, color: "#000000" }} />
        )}
        {slideDefinition.hero.type === "team" && (
          <GroupAddRoundedIcon sx={{ fontSize: 56, color: "#000000" }} />
        )}
      </div>
    );
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      closeOnClickOutside={false}
      centered
      size="lg"
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      styles={{
        body: { padding: 0 },
        content: {
          overflow: "hidden",
          border: "none",
          background: "var(--bg-surface)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack
        gap={0}
        className={styles.modalContent}
        style={{
          height: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className={styles.heroWrapper} style={{ flexShrink: 0 }}>
          <AnimatedSlideBackground
            gradientStops={currentSlide.background.gradientStops}
            circles={currentSlide.background.circles}
            isActive
            slideKey={currentSlide.key}
          />
          <div className={styles.heroLogo} key={`logo-${currentSlide.key}`}>
            {renderHero()}
          </div>
        </div>

        <div
          className={styles.modalBody}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <Stack gap={16}>
            <div
              key={`title-${currentSlide.key}`}
              className={`${styles.title} ${styles.titleText}`}
            >
              {currentSlide.title}
            </div>

            <div className={styles.bodyText}>
              <div
                key={`body-${currentSlide.key}`}
                className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}
              >
                {currentSlide.body}
              </div>
              <style>{`div strong{color: var(--onboarding-title); font-weight: 600;}`}</style>
            </div>

            <OnboardingStepper
              totalSteps={totalSteps}
              activeStep={currentStep}
            />

            <div className={styles.buttonContainer}>
              {renderButtons({
                slideDefinition,
                flowState,
                onAction: handleButtonAction,
                t,
              })}
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}
