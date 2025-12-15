/**
 * OnboardingModalSlide Component
 * 
 * Renders a single modal slide in the onboarding flow.
 * Handles the hero image, content, stepper, and button actions.
 */

import React from 'react';
import { Modal, Stack, ActionIcon } from '@mantine/core';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import CloseIcon from '@mui/icons-material/Close';

import type { SlideDefinition, ButtonAction } from '@app/components/onboarding/onboardingFlowConfig';
import type { OnboardingRuntimeState } from '@app/components/onboarding/orchestrator/onboardingConfig';
import type { SlideConfig } from '@app/types/types';
import AnimatedSlideBackground from '@app/components/onboarding/slides/AnimatedSlideBackground';
import OnboardingStepper from '@app/components/onboarding/OnboardingStepper';
import { SlideButtons } from '@app/components/onboarding/InitialOnboardingModal/renderButtons';
import LocalIcon from '@app/components/shared/LocalIcon';
import { BASE_PATH } from '@app/constants/app';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';
import styles from '@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css';

interface OnboardingModalSlideProps {
  slideDefinition: SlideDefinition;
  slideContent: SlideConfig;
  runtimeState: OnboardingRuntimeState;
  modalSlideCount: number;
  currentModalSlideIndex: number;
  onSkip: () => void;
  onAction: (action: ButtonAction) => void;
  allowDismiss?: boolean;
}

export default function OnboardingModalSlide({
  slideDefinition,
  slideContent,
  runtimeState,
  modalSlideCount,
  currentModalSlideIndex,
  onSkip,
  onAction,
  allowDismiss = true,
}: OnboardingModalSlideProps) {

  const renderHero = () => {
    if (slideDefinition.hero.type === 'dual-icon') {
      return (
        <div className={styles.heroIconsContainer}>
          <div className={styles.iconWrapper}>
            <img src={`${BASE_PATH}/modern-logo/logo512.png`} alt="Stirling icon" className={styles.downloadIcon} />
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
        {slideDefinition.hero.type === 'lock' && (
          <LocalIcon icon="lock-outline" width={64} height={64} className={styles.heroIcon} />
        )}
        {slideDefinition.hero.type === 'analytics' && (
          <LocalIcon icon="analytics" width={64} height={64} className={styles.heroIcon} />
        )}
        {slideDefinition.hero.type === 'diamond' && <DiamondOutlinedIcon sx={{ fontSize: 64, color: '#000000' }} />}
        {slideDefinition.hero.type === 'logo' && (
          <img src={`${BASE_PATH}/branding/StirlingPDFLogoNoTextLightHC.svg`} alt="Stirling logo" />
        )}
      </div>
    );
  };

  return (
    <Modal
      opened={true}
      onClose={onSkip}
      closeOnClickOutside={false}
      closeOnEscape={allowDismiss}
      centered
      size="lg"
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      styles={{
        body: { padding: 0, maxHeight: '90vh', overflow: 'hidden' },
        content: { overflow: 'hidden', border: 'none', background: 'var(--bg-surface)', maxHeight: '90vh' },
      }}
    >
      <Stack gap={0} className={styles.modalContent}>
        <div className={styles.heroWrapper}>
          <AnimatedSlideBackground
            gradientStops={slideContent.background.gradientStops}
            circles={slideContent.background.circles}
            isActive
            slideKey={slideContent.key}
          />
          {allowDismiss && (
            <ActionIcon
              onClick={onSkip}
              radius="md"
              size={36}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                backdropFilter: 'blur(4px)',
                zIndex: 10,
              }}
              styles={{
                root: {
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  },
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </ActionIcon>
          )}
          <div className={styles.heroLogo} key={`logo-${slideContent.key}`}>
            {renderHero()}
          </div>
        </div>

        <div className={styles.modalBody} style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 220px)' }}>
          <Stack gap={16}>
            <div
              key={`title-${slideContent.key}`}
              className={`${styles.title} ${styles.titleText}`}
            >
              {slideContent.title}
            </div>

            <div className={styles.bodyText}>
              <div key={`body-${slideContent.key}`} className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}>
                {slideContent.body}
              </div>
              <style>{`div strong{color: var(--onboarding-title); font-weight: 600;}`}</style>
            </div>

            {modalSlideCount > 1 && (
              <OnboardingStepper totalSteps={modalSlideCount} activeStep={currentModalSlideIndex} />
            )}

            <div className={styles.buttonContainer}>
              <SlideButtons
                slideDefinition={slideDefinition}
                licenseNotice={runtimeState.licenseNotice}
                flowState={{ selectedRole: runtimeState.selectedRole }}
                onAction={onAction}
              />
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}

