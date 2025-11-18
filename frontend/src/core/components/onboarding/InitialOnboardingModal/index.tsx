import React from 'react';
import { Modal, Stack } from '@mantine/core';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LocalIcon from '@app/components/shared/LocalIcon';
import AnimatedSlideBackground from '@app/components/onboarding/slides/AnimatedSlideBackground';
import OnboardingStepper from '@app/components/onboarding/OnboardingStepper';
import { renderButtons } from './renderButtons';
import styles from './InitialOnboardingModal.module.css';
import type { InitialOnboardingModalProps } from './types';
import { useInitialOnboardingState } from './useInitialOnboardingState';

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
    handleDownloadIconSelect,
    devButtons,
    activeDevScenario,
    handleDevScenarioClick,
  } = flow;

  const showDevButtons = devButtons.length > 0;

  const renderHero = () => {
    if (slideDefinition.hero.type === 'dual-icon') {
      return (
        <div className={styles.heroIconsContainer}>
          <div className={styles.iconWrapper}>
            <button
              className={`${styles.iconButton} ${state.selectedDownloadIcon === 'new' ? styles.iconButtonSelected : ''}`}
              onClick={() => handleDownloadIconSelect('new')}
              aria-label="Select new icon version"
            >
              <img src="/branding/StirlingLogo.svg" alt="Stirling new icon" className={styles.downloadIcon} />
            </button>
            {state.selectedDownloadIcon === 'new' && <div className={styles.iconLabel}>Modern Icon</div>}
          </div>
          <div className={styles.iconWrapper}>
            <button
              className={`${styles.iconButton} ${state.selectedDownloadIcon === 'classic' ? styles.iconButtonSelected : ''}`}
              onClick={() => handleDownloadIconSelect('classic')}
              aria-label="Select classic icon version"
            >
              <img src="/branding/StirlingLogoLegacy.svg" alt="Stirling classic icon" className={styles.downloadIcon} />
            </button>
            {state.selectedDownloadIcon === 'classic' && <div className={styles.iconLabel}>Classic Icon</div>}
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

  const renderDevOverlay = () => {
    if (!showDevButtons) {
      return null;
    }

    return (
      <div className={styles.devOverlay}>
        {devButtons.map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => handleDevScenarioClick(btn)}
            title={btn.overLimit ? 'Set simulated users to 57' : 'Set simulated users to 3'}
            className={`${styles.devButton} ${activeDevScenario === btn.label ? styles.devButtonActive : ''}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <Modal
      opened={props.opened}
      onClose={closeAndMarkSeen}
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
        {renderDevOverlay()}
      </Stack>
    </Modal>
  );
}

