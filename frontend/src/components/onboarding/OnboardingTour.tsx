import React from "react";
import { TourProvider, useTour, type StepType } from '@reactour/tour';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import { Button, CloseButton } from '@mantine/core';
import { useFilesModalContext } from '../../contexts/FilesModalContext';

// Enum case order defines order steps will appear
enum TourStep {
  QUICK_ACCESS,
  TOOL_PANEL,
  FILES_BUTTON,
  FILE_SOURCES,
  FILE_DETAILS,
}

function TourContent() {
  const { isOpen } = useOnboarding();
  const { setIsOpen, currentStep, setCurrentStep } = useTour();
  const { isFilesModalOpen } = useFilesModalContext();
  const hasAdvancedRef = React.useRef(false);

  // Sync tour open state with context
  React.useEffect(() => {
    setIsOpen(isOpen);
  }, [isOpen, setIsOpen]);

  // Reset the advanced flag when we're back on Files button step
  React.useEffect(() => {
    if (currentStep === TourStep.FILES_BUTTON && !isFilesModalOpen) {
      hasAdvancedRef.current = false;
    }
  }, [currentStep, isFilesModalOpen]);

  // Advance tour when Files modal opens (if on Files button step)
  React.useEffect(() => {
    if (isFilesModalOpen && currentStep === TourStep.FILES_BUTTON && isOpen && !hasAdvancedRef.current) {
      hasAdvancedRef.current = true;
      // Wait for the file-sources element to exist in DOM and modal to settle
      const checkElement = () => {
        const element = document.querySelector('[data-tour="file-sources"]');
        if (element) {
          // Wait for modal opening animation to complete (Mantine modals have ~200ms transition)
          setTimeout(() => {
            setCurrentStep(TourStep.FILE_SOURCES);
          }, 300);
        } else {
          // Check again in next frame
          requestAnimationFrame(checkElement);
        }
      };
      checkElement();
    }
  }, [isFilesModalOpen, currentStep, isOpen, setCurrentStep]);

  return null;
}

export default function OnboardingTour() {
  const { t } = useTranslation();
  const { completeTour, closeTour } = useOnboarding();

  // Define steps as object keyed by enum - TypeScript ensures all keys are present
  const stepsConfig: Record<TourStep, StepType> = {
    [TourStep.QUICK_ACCESS]: {
      selector: '[data-tour="quick-access"]',
      content: t('onboarding.quickAccess', 'Quick access to your most-used tools and settings. Pin your favourite tools here for easy access.'),
      position: 'right',
    },
    [TourStep.TOOL_PANEL]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.toolPanel', 'Browse all available PDF tools organised by category. Select a tool to get started.'),
      position: 'right',
    },
    [TourStep.FILES_BUTTON]: {
      selector: '[data-testid="files-button"]',
      content: t('onboarding.filesButton', 'Click the Files button to manage your PDFs and see your recent files.'),
      position: 'right',
    },
    [TourStep.FILE_SOURCES]: {
      selector: '[data-tour="file-sources"]',
      content: t('onboarding.fileSources', 'Choose where to load files from - your recent files or upload new ones from your device.'),
      position: 'right',
    },
    [TourStep.FILE_DETAILS]: {
      selector: '[data-tour="file-details"]',
      content: t('onboarding.fileDetails', 'View detailed information about selected files, including size, type, and preview.'),
      position: 'left',
    },
  };

  // Convert to array using enum's numeric ordering
  const steps = Object.values(stepsConfig);

  return (
    <TourProvider
      steps={steps}
      onClickClose={({ setIsOpen }) => {
        setIsOpen(false);
        closeTour();
      }}
      onClickMask={({ setCurrentStep, currentStep, steps, setIsOpen }) => {
        // Files button step - don't allow clicking outside to advance
        if (currentStep === TourStep.FILES_BUTTON) {
          return;
        }

        if (steps && currentStep === steps.length - 1) {
          setIsOpen(false);
          completeTour();
        } else if (steps) {
          setCurrentStep((s) => (s === steps.length - 1 ? 0 : s + 1));
        }
      }}
      styles={{
        popover: (base) => ({
          ...base,
          backgroundColor: 'var(--mantine-color-body)',
          color: 'var(--mantine-color-text)',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          maxWidth: '400px',
        }),
        maskArea: (base) => ({
          ...base,
          rx: 8,
        }),
        badge: (base) => ({
          ...base,
          backgroundColor: 'var(--mantine-primary-color-filled)',
        }),
      }}
      showNavigation={true}
      showBadge={true}
      showCloseButton={true}
      disableInteraction={false}
      padding={0}
      prevButton={({ currentStep, setCurrentStep }) => {
        const isFirst = currentStep === TourStep.QUICK_ACCESS;
        const isFirstModalStep = currentStep === TourStep.FILE_SOURCES;
        return (
          <Button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={isFirst || isFirstModalStep}
            variant="filled"
            size="sm"
            style={{ marginRight: '8px' }}
          >
            {t('onboarding.previous', 'Previous')}
          </Button>
        );
      }}
      nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = currentStep === stepsLength - 1;
        const isFilesStep = currentStep === TourStep.FILES_BUTTON;

        return (
          <Button
            onClick={() => {
              if (isLast) {
                setIsOpen(false);
                completeTour();
              } else {
                setCurrentStep(Math.min(stepsLength - 1, currentStep + 1));
              }
            }}
            variant="filled"
            size="sm"
            disabled={isFilesStep}
          >
            {isLast ? t('onboarding.finish', 'Finish') : t('onboarding.next', 'Next')}
          </Button>
        );
      }}
      components={{
        Close: ({ onClick }) => (
          <CloseButton
            onClick={onClick}
            size="md"
            style={{ position: 'absolute', top: '8px', right: '8px' }}
          />
        ),
        Content: ({ content }) => (
          <div style={{ paddingRight: '16px' /* Ensure text doesn't overlap with close button */ }}>
            {content}
          </div>
        ),
      }}
    >
      <TourContent />
    </TourProvider>
  );
}
