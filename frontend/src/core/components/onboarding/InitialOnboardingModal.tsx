import React from 'react';
import { Modal, Button, Group, Stack, ActionIcon } from '@mantine/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';
import OnboardingStepper from '@app/components/onboarding/OnboardingStepper';
import { useOs } from '@app/hooks/useOs';
import { useAppConfig } from '@app/contexts/AppConfigContext';

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

  const titleByStep = [
    'Welcome to Stirling',
    os.label ? `Download for ${os.label}` : 'Download',
    isAdmin ? 'Admin Overview' : 'Plan Overview',
  ];

  const bodyByStep: React.ReactNode[] = [
    (
      <span>
        Stirling helps you read and edit PDFs privately. The app includes a simple <strong>Reader</strong> with basic editing tools and an advanced <strong>Editor</strong> with professional editing tools.
      </span>
    ),
    (
      <span>
        Stirling works best as a desktop app. You can use it offline, access documents faster, and make edits locally on your computer.
      </span>
    ),
    isAdmin ? (
      <span>
        As an admin, you can manage users, configure settings, and monitor server health. The first 5 people on your server get to use Stirling free of charge.
      </span>
    ) : (
      <span>
        For the next <strong>30 days</strong>, you’ll enjoy <strong>unlimited Pro access</strong> to the Reader and the Editor. Afterwards, you can continue with the Reader for free or upgrade to keep the Editor too.
      </span>
    ),
  ];

  const imageByStep = [
    '/branding/onboarding1.svg',
    '/branding/onboarding2.svg',
    '/branding/onboarding3.svg',
  ];

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
              if (os.url) {
                window.open(os.url, '_blank', 'noopener');
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
        <div style={{ width: '100%', height: 220, overflow: 'hidden' }}>
          <img
            src={imageByStep[step]}
            alt={titleByStep[step]}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        <div style={{ padding: 24 }}>
          <Stack gap={16}>
            <div
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontWeight: 600,
                fontSize: 22,
                color: 'var(--onboarding-title)',
              }}
            >
              {titleByStep[step]}
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
              <div style={{ color: 'inherit' }}>
                {bodyByStep[step]}
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


