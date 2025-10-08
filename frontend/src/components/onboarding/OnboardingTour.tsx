import React from "react";
import { TourProvider, useTour } from '@reactour/tour';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@mantine/hooks';
import { useSidebarContext } from '../../contexts/SidebarContext';

interface TourStep {
  selector: string;
  content: string;
  position?: 'top' | 'right' | 'bottom' | 'left' | 'center';
}

function TourContent() {
  const { t } = useTranslation();
  const { isOpen, currentStep, setCurrentStep, completeTour } = useOnboarding();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const { sidebarRefs } = useSidebarContext();

  // Desktop tour steps
  const desktopSteps: TourStep[] = [
    {
      selector: '[data-tour="quick-access"]',
      content: t('onboarding.quickAccess', 'Quick access to your most-used tools and settings. Pin your favorite tools here for easy access.'),
      position: 'right',
    },
    {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.toolPanel', 'Browse all available PDF tools organized by category. Select a tool to get started.'),
      position: 'right',
    },
    {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.workbench', 'Your main workspace. Upload files, configure tool settings, and process your PDFs here.'),
      position: 'left',
    },
    {
      selector: '[data-tour="right-rail"]',
      content: t('onboarding.rightRail', 'View your active files, processing history, and tool-specific options in this panel.'),
      position: 'left',
    },
  ];

  // Mobile tour steps
  const mobileSteps: TourStep[] = [
    {
      selector: '[data-tour="mobile-tools-tab"]',
      content: t('onboarding.mobile.toolsTab', 'Browse all available PDF tools. Swipe or tap to switch between Tools and Workspace views.'),
      position: 'bottom',
    },
    {
      selector: '[data-tour="mobile-workspace-tab"]',
      content: t('onboarding.mobile.workspaceTab', 'Your workspace where you can upload files and configure tool settings.'),
      position: 'bottom',
    },
    {
      selector: '[data-tour="mobile-bottom-bar"]',
      content: t('onboarding.mobile.bottomBar', 'Quick access to all tools, automation, your files, and settings from the bottom bar.'),
      position: 'top',
    },
  ];

  const steps = isMobile ? mobileSteps : desktopSteps;

  const { setIsOpen: setTourOpen, setCurrentStep: setTourStep } = useTour();

  // Sync tour state with context
  React.useEffect(() => {
    setTourOpen(isOpen);
  }, [isOpen, setTourOpen]);

  React.useEffect(() => {
    setTourStep(currentStep);
  }, [currentStep, setTourStep]);

  return null;
}

export default function OnboardingTour() {
  const { t } = useTranslation();
  const { isOpen, currentStep, setCurrentStep, completeTour, closeTour } = useOnboarding();
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
      currentStep={currentStep}
      setCurrentStep={setCurrentStep}
      isOpen={isOpen}
      onClickClose={({ setIsOpen }) => {
        setIsOpen(false);
        closeTour();
      }}
      onClickMask={({ setCurrentStep, currentStep, steps, setIsOpen }) => {
        if (currentStep === steps.length - 1) {
          setIsOpen(false);
          completeTour();
        } else {
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
        close: (base) => ({
          ...base,
          color: 'var(--mantine-color-text)',
        }),
      }}
      showNavigation={true}
      showBadge={true}
      showCloseButton={true}
      disableInteraction={false}
      padding={10}
      prevButton={({ currentStep, stepsLength, setCurrentStep }) => {
        const isFirst = currentStep === 0;
        return (
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={isFirst}
            style={{
              backgroundColor: isFirst ? '#ccc' : 'var(--mantine-primary-color-filled)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: isFirst ? 'not-allowed' : 'pointer',
              marginRight: '8px',
            }}
          >
            {t('onboarding.previous', 'Previous')}
          </button>
        );
      }}
      nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = currentStep === stepsLength - 1;
        return (
          <button
            onClick={() => {
              if (isLast) {
                setIsOpen(false);
                completeTour();
              } else {
                setCurrentStep(Math.min(stepsLength - 1, currentStep + 1));
              }
            }}
            style={{
              backgroundColor: 'var(--mantine-primary-color-filled)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {isLast ? t('onboarding.finish', 'Finish') : t('onboarding.next', 'Next')}
          </button>
        );
      }}
    >
      <TourContent />
    </TourProvider>
  );
}
