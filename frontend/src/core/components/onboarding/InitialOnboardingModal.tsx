import React from 'react';
import { Modal, Button, Group, Stack, ActionIcon } from '@mantine/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';
import OnboardingStepper from '@app/components/onboarding/OnboardingStepper';
import { useOs } from '@app/hooks/useOs';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import WelcomeSlide from '@app/components/onboarding/slides/WelcomeSlide';
import DesktopInstallSlide from '@app/components/onboarding/slides/DesktopInstallSlide';
import PlanOverviewSlide from '@app/components/onboarding/slides/PlanOverviewSlide';
import AnimatedSlideBackground from '@app/components/onboarding/slides/AnimatedSlideBackground';
import { SlideConfig } from '@app/components/onboarding/slides/types';
import styles from './InitialOnboardingModal.module.css';

interface InitialOnboardingModalProps {
  opened: boolean;
  onClose: () => void;
}


export default function InitialOnboardingModal({ opened, onClose }: InitialOnboardingModalProps) {
  const { preferences, updatePreference } = usePreferences();
  const { startTour, setShowWelcomeModal, setStartAfterToolModeSelection } = useOnboarding();
  const [step, setStep] = React.useState(0);
  const totalSteps = 3;
  const { config } = useAppConfig();
  const isAdmin = !!config?.isAdmin;

  React.useEffect(() => {
    if (!opened) setStep(0);
  }, [opened]);

  const osType = useOs();
  const os = React.useMemo(() => {
    switch (osType) {
      case 'windows':
        return { label: 'Windows', url: 'https://files.stirlingpdf.com/win-installer.exe' };
      case 'mac-apple':
        return { label: 'Mac', url: 'https://files.stirlingpdf.com/mac-installer.dmg' };
      case 'mac-intel':
        return { label: 'Mac (Intel)', url: 'https://files.stirlingpdf.com/mac-x86_64-installer.dmg' };
      case 'linux-x64':
      case 'linux-arm64':
        return { label: 'Linux', url: 'https://docs.stirlingpdf.com/Installation/Unix%20Installation/' };
      // For mobile/unknown, hide OS label and skip opening a URL
      default:
        return { label: '', url: '' };
    }
  }, [osType]);

  const closeAndMarkSeen = React.useCallback(() => {
    if (!preferences.hasSeenIntroOnboarding) {
      updatePreference('hasSeenIntroOnboarding', true);
    }
    onClose();
  }, [onClose, preferences.hasSeenIntroOnboarding, updatePreference]);

  const goNext = () => setStep((s) => Math.min(totalSteps - 1, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  // Get slide content from the slide components
  const slides = React.useMemo<SlideConfig[]>(
    () => [
      WelcomeSlide(),
      DesktopInstallSlide({ osLabel: os.label, osUrl: os.url }),
      PlanOverviewSlide({ isAdmin }),
    ],
    [isAdmin, os.label, os.url],
  );

  const currentSlide = slides[step];

  // Buttons per step
  const renderButtons = () => {
    if (step === 0) {
      return (
        <Group justify="flex-end">
          <Button
            onClick={goNext}
            styles={{
              root: {
                background: 'var(--onboarding-primary-button-bg)',
                color: 'var(--onboarding-primary-button-text)',
              },
            }}
          >
            Next →
          </Button>
        </Group>
      );
    }

    if (step === 1) {
      return (
        <Group justify="space-between">
          <Group gap={12}>
            <ActionIcon
              onClick={goPrev}
              radius="md"
              size={40}
              styles={{
                root: {
                  background: 'var(--onboarding-secondary-button-bg)',
                  border: '1px solid var(--onboarding-secondary-button-border)',
                  color: 'var(--onboarding-secondary-button-text)',
                },
              }}
            >
              <ChevronLeftIcon fontSize="small" />
            </ActionIcon>

            <Button
              variant="default"
              onClick={goNext}
              styles={{
                root: {
                  background: 'var(--onboarding-secondary-button-bg)',
                  border: '1px solid var(--onboarding-secondary-button-border)',
                  color: 'var(--onboarding-secondary-button-text)',
                },
              }}
            >
              Skip for now
            </Button>
          </Group>
          <Button
            onClick={() => {
              const downloadUrl = currentSlide.downloadUrl;
              if (downloadUrl) {
                window.open(downloadUrl, '_blank', 'noopener');
              }
              goNext();
            }}
            styles={{
              root: {
                background: 'var(--onboarding-primary-button-bg)',
                color: 'var(--onboarding-primary-button-text)',
              },
            }}
          >
            Download →
          </Button>
        </Group>
      );
    }

    return (
      <Group justify="space-between">
        <Group gap={12}>
          <ActionIcon
            onClick={goPrev}
            radius="md"
            size={40}
            styles={{
              root: {
                background: 'var(--onboarding-secondary-button-bg)',
                border: '1px solid var(--onboarding-secondary-button-border)',
                color: 'var(--onboarding-secondary-button-text)',
              },
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </ActionIcon>

          <Button
            variant="default"
            onClick={() => {
              updatePreference('hasCompletedOnboarding', true);
              closeAndMarkSeen();
            }}
            styles={{
              root: {
                background: 'var(--onboarding-secondary-button-bg)',
                border: '1px solid var(--onboarding-secondary-button-border)',
                color: 'var(--onboarding-secondary-button-text)',
              },
            }}
          >
            Skip the tour
          </Button>
        </Group>

        <Button
          onClick={() => {
            // Close slides first
            closeAndMarkSeen();
            // Ensure the legacy welcome modal state is controlled by our gating
            setShowWelcomeModal(false);
            // If the user still needs to choose a tool mode, mark to start the tour after they do
            if (!preferences.toolPanelModePromptSeen) {
              setStartAfterToolModeSelection(true);
              return; // The prompt will show next; tour will be started from there
            }
            // Otherwise, start immediately (if not completed previously)
            if (!preferences.hasCompletedOnboarding) {
              if (isAdmin) {
                startTour('admin');
              } else {
                startTour('tools');
              }
            }
          }}
          styles={{
            root: {
              background: 'var(--onboarding-primary-button-bg)',
              color: 'var(--onboarding-primary-button-text)',
            },
          }}
        >
          Show me around →
        </Button>
      </Group>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={closeAndMarkSeen}
      centered
      size="lg"
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      styles={{
        body: { padding: 0 },
        content: { overflow: 'hidden', border: 'none', background: 'var(--bg-surface)' },
      }}
    >
      <Stack gap={0} style={{ background: 'var(--bg-surface)' }}>
        <div className={styles.heroWrapper}>
          <AnimatedSlideBackground
            gradientStops={currentSlide.background.gradientStops}
            circles={currentSlide.background.circles}
            isActive
            slideKey={currentSlide.key}
          />
          <div className={styles.heroLogo} key={`logo-${currentSlide.key}`}>
            <div className={styles.heroLogoCircle}>
              <img src="/branding/StirlingPDFLogoNoTextLight.svg" alt="Stirling logo" />
            </div>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <Stack gap={16}>
            <div
              key={`title-${currentSlide.key}`}
              className={styles.title}
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontWeight: 600,
                fontSize: 22,
                color: 'var(--onboarding-title)',
              }}
            >
              {currentSlide.title}
            </div>

            <div
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontSize: 16,
                color: 'var(--onboarding-body)',
                lineHeight: 1.5,
              }}
            >
              {/* strong tags should match the title color */}
              <div
                key={`body-${currentSlide.key}`}
                className={styles.bodyCopy}
                style={{ color: 'inherit' }}
              >
                {currentSlide.body}
              </div>
              <style>{`div strong{color: var(--onboarding-title); font-weight: 600;}`}</style>
            </div>

            <OnboardingStepper totalSteps={totalSteps} activeStep={step} />

            <div style={{ marginTop: 8 }}>
              {renderButtons()}
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}


