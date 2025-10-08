import React from "react";
import { TourProvider, useTour } from '@reactour/tour';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@mantine/hooks';
import { Button, CloseButton } from '@mantine/core';

function TourContent() {
  const { isOpen, currentStep } = useOnboarding();
  const { setIsOpen, setCurrentStep } = useTour();

  // Sync tour state with context
  React.useEffect(() => {
    setIsOpen(isOpen);
  }, [isOpen, setIsOpen]);

  React.useEffect(() => {
    setCurrentStep(currentStep);
  }, [currentStep, setCurrentStep]);

  return null;
}

export default function OnboardingTour() {
  const { t } = useTranslation();
  const { completeTour, closeTour } = useOnboarding();
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const desktopSteps = [
    {
      selector: '[data-tour="quick-access"]',
      content: t('onboarding.quickAccess', 'Quick access to your most-used tools and settings. Pin your favorite tools here for easy access.'),
      position: 'right' as const,
    },
    {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.toolPanel', 'Browse all available PDF tools organized by category. Select a tool to get started.'),
      position: 'right' as const,
    },
    {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.workbench', 'Your main workspace. Upload files, configure tool settings, and process your PDFs here.'),
      position: 'left' as const,
    },
    {
      selector: '[data-tour="right-rail"]',
      content: t('onboarding.rightRail', 'View your active files, processing history, and tool-specific options in this panel.'),
      position: 'left' as const,
    },
  ];

  const mobileSteps = [
    {
      selector: '[data-tour="mobile-tools-tab"]',
      content: t('onboarding.mobile.toolsTab', 'Browse all available PDF tools. Swipe or tap to switch between Tools and Workspace views.'),
      position: 'bottom' as const,
    },
    {
      selector: '[data-tour="mobile-workspace-tab"]',
      content: t('onboarding.mobile.workspaceTab', 'Your workspace where you can upload files and configure tool settings.'),
      position: 'bottom' as const,
    },
    {
      selector: '[data-tour="mobile-bottom-bar"]',
      content: t('onboarding.mobile.bottomBar', 'Quick access to all tools, automation, your files, and settings from the bottom bar.'),
      position: 'top' as const,
    },
  ];

  const steps = isMobile ? mobileSteps : desktopSteps;

  return (
    <TourProvider
      steps={steps}
      onClickClose={({ setIsOpen }) => {
        setIsOpen(false);
        closeTour();
      }}
      onClickMask={({ setCurrentStep, currentStep, steps, setIsOpen }) => {
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
        const isFirst = currentStep === 0;
        return (
          <Button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={isFirst}
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
