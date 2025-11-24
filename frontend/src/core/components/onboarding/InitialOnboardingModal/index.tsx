import React from 'react';
import { Modal, Stack } from '@mantine/core';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import LocalIcon from '@app/components/shared/LocalIcon';
import AnimatedSlideBackground from '@app/components/onboarding/slides/AnimatedSlideBackground';
import OnboardingStepper from '@app/components/onboarding/OnboardingStepper';
import { renderButtons } from '@app/components/onboarding/InitialOnboardingModal/renderButtons';
import styles from '@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css';
import type { InitialOnboardingModalProps } from '@app/components/onboarding/InitialOnboardingModal/types';
import { useInitialOnboardingState } from '@app/components/onboarding/InitialOnboardingModal/useInitialOnboardingState';

export default function InitialOnboardingModal(props: InitialOnboardingModalProps) {
  const flow = useInitialOnboardingState(props);

  if (!flow) {
    return null;
  }

  const {
    state,
    totalSteps,
    currentSlide,
    slideDefinition,
    licenseNotice,
    flowState,
    closeAndMarkSeen,
    handleButtonAction,
  } = flow;

  const renderHero = () => {
    if (slideDefinition.hero.type === 'dual-icon') {
      return (
        <div className={styles.heroIconsContainer}>
          <div className={styles.iconWrapper}>
            <img src="/branding/StirlingLogoLegacy.svg" alt="Stirling icon" className={styles.downloadIcon} />
          </div>
        </div>
      );
    }

    return (
      <div className={styles.heroLogoCircle}>
        {slideDefinition.hero.type === 'rocket' && (
          <LocalIcon icon="rocket-launch" width={64} height={64} className={styles.heroIcon} />
        )}
        {slideDefinition.hero.type === 'shield' && (
          <LocalIcon icon="verified-user-outline" width={64} height={64} className={styles.heroIcon} />
        )}
        {slideDefinition.hero.type === 'diamond' && <DiamondOutlinedIcon sx={{ fontSize: 64, color: '#000000' }} />}
        {slideDefinition.hero.type === 'logo' && (
          <img src="/branding/StirlingPDFLogoNoTextLightHC.svg" alt="Stirling logo" />
        )}
      </div>
    );
  };

  return (
    <Modal
      opened={props.opened}
      onClose={closeAndMarkSeen}
      closeOnClickOutside={false}
      centered
      size="lg"
      radius="lg"
      withCloseButton={false}
      zIndex={1001}
      styles={{
        body: { padding: 0 },
        content: { overflow: 'hidden', border: 'none', background: 'var(--bg-surface)' },
      }}
    >
      <Stack gap={0} className={styles.modalContent}>
        <div className={styles.heroWrapper}>
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

        <div className={styles.modalBody}>
          <Stack gap={16}>
            <div
              key={`title-${currentSlide.key}`}
              className={`${styles.title} ${styles.titleText}`}
            >
              {currentSlide.title}
            </div>

            <div className={styles.bodyText}>
              <div key={`body-${currentSlide.key}`} className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}>
                {currentSlide.body}
              </div>
              <style>{`div strong{color: var(--onboarding-title); font-weight: 600;}`}</style>
            </div>

            <OnboardingStepper totalSteps={totalSteps} activeStep={state.step} />

            <div className={styles.buttonContainer}>
              {renderButtons({
                slideDefinition,
                licenseNotice,
                flowState,
                onAction: handleButtonAction,
              })}
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}

