import React, { useEffect, useMemo } from "react";
import { TourProvider, type StepType } from '@reactour/tour';
import { useTranslation } from 'react-i18next';
import { CloseButton, ActionIcon } from '@mantine/core';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import InitialOnboardingModal from '@app/components/onboarding/InitialOnboardingModal';
import ServerLicenseModal from '@app/components/onboarding/ServerLicenseModal';
import '@app/components/onboarding/OnboardingTour.css';
import ToolPanelModePrompt from '@app/components/tools/ToolPanelModePrompt';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useTourOrchestration } from '@app/contexts/TourOrchestrationContext';
import { useAdminTourOrchestration } from '@app/contexts/AdminTourOrchestrationContext';
import { useOnboardingFlow } from '@app/components/onboarding/hooks/useOnboardingFlow';
import { createUserStepsConfig } from '@app/components/onboarding/userStepsConfig';
import { createAdminStepsConfig } from '@app/components/onboarding/adminStepsConfig';
import { removeAllGlows } from '@app/components/onboarding/tourGlow';
import TourContent from '@app/components/onboarding/TourContent';
import i18n from "@app/i18n";

export default function OnboardingTour() {
  const { t } = useTranslation();
  const flow = useOnboardingFlow();
  const { openFilesModal, closeFilesModal } = useFilesModalContext();
  const {
    saveWorkbenchState,
    restoreWorkbenchState,
    backToAllTools,
    selectCropTool,
    loadSampleFile,
    switchToViewer,
    switchToPageEditor,
    switchToActiveFiles,
    selectFirstFile,
    pinFile,
    modifyCropSettings,
    executeTool,
  } = useTourOrchestration();
  const {
    saveAdminState,
    restoreAdminState,
    openConfigModal,
    navigateToSection,
    scrollNavToSection,
  } = useAdminTourOrchestration();

  useEffect(() => {
    if (!flow.isTourOpen) {
      removeAllGlows();
    }
    return () => removeAllGlows();
  }, [flow.isTourOpen]);

  const userStepsConfig = useMemo(
    () =>
      createUserStepsConfig({
        t,
        actions: {
          saveWorkbenchState,
          closeFilesModal,
          backToAllTools,
          selectCropTool,
          loadSampleFile,
          switchToViewer,
          switchToPageEditor,
          switchToActiveFiles,
          selectFirstFile,
          pinFile,
          modifyCropSettings,
          executeTool,
          openFilesModal,
        },
      }),
    [
      t,
      backToAllTools,
      closeFilesModal,
      executeTool,
      loadSampleFile,
      modifyCropSettings,
      openFilesModal,
      pinFile,
      saveWorkbenchState,
      selectCropTool,
      selectFirstFile,
      switchToActiveFiles,
      switchToPageEditor,
      switchToViewer,
    ],
  );

  const adminStepsConfig = useMemo(
    () =>
      createAdminStepsConfig({
        t,
        actions: {
          saveAdminState,
          openConfigModal,
          navigateToSection,
          scrollNavToSection,
        },
      }),
    [navigateToSection, openConfigModal, saveAdminState, scrollNavToSection, t],
  );

  const steps = useMemo<StepType[]>(() => {
    const config = flow.tourType === 'admin' ? adminStepsConfig : userStepsConfig;
    return Object.values(config);
  }, [adminStepsConfig, flow.tourType, userStepsConfig]);

  const advanceTour = ({
    setCurrentStep,
    currentStep,
    steps,
    setIsOpen,
  }: {
    setCurrentStep: (value: number | ((prev: number) => number)) => void;
    currentStep: number;
    steps?: StepType[];
    setIsOpen: (value: boolean) => void;
  }) => {
    if (steps && currentStep === steps.length - 1) {
      setIsOpen(false);
      if (flow.tourType === 'admin') {
        restoreAdminState();
      } else {
        restoreWorkbenchState();
      }
      flow.handleTourCompletion();
    } else if (steps) {
      setCurrentStep((s) => (s === steps.length - 1 ? 0 : s + 1));
    }
  };

  const handleCloseTour = ({ setIsOpen }: { setIsOpen: (value: boolean) => void }) => {
    setIsOpen(false);
    if (flow.tourType === 'admin') {
      restoreAdminState();
    } else {
      restoreWorkbenchState();
    }
    flow.handleTourCompletion();
  };

  return (
    <>
      <InitialOnboardingModal {...flow.initialModalProps} />
      <ToolPanelModePrompt onComplete={flow.handleToolPromptComplete} />
      <TourProvider
        key={`${flow.tourType}-${i18n.language}`}
        steps={steps}
        maskClassName={flow.maskClassName}
        onClickClose={handleCloseTour}
        onClickMask={advanceTour}
        onClickHighlighted={(e, clickProps) => {
          e.stopPropagation();
          advanceTour(clickProps);
        }}
        keyboardHandler={(e, clickProps, status) => {
          if (e.key === 'ArrowRight' && !status?.isRightDisabled && clickProps) {
            e.preventDefault();
            advanceTour(clickProps);
          } else if (e.key === 'Escape' && !status?.isEscDisabled && clickProps) {
            e.preventDefault();
            handleCloseTour(clickProps);
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
          controls: (base) => ({
            ...base,
            justifyContent: 'center',
          }),
        }}
        highlightedMaskClassName="tour-highlight-glow"
        showNavigation={true}
        showBadge={false}
        showCloseButton={true}
        disableInteraction={true}
        disableDotsNavigation={true}
        prevButton={() => null}
        nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
          const isLast = currentStep === stepsLength - 1;

          return (
            <ActionIcon
              onClick={() => {
                advanceTour({ setCurrentStep, currentStep, steps, setIsOpen });
              }}
              variant="subtle"
              size="lg"
              aria-label={isLast ? t('onboarding.finish', 'Finish') : t('onboarding.next', 'Next')}
            >
              {isLast ? <CheckIcon /> : <ArrowForwardIcon />}
            </ActionIcon>
          );
        }}
        components={{
          Close: ({ onClick }) => (
            <CloseButton onClick={onClick} size="md" style={{ position: 'absolute', top: '8px', right: '8px' }} />
          ),
          Content: ({ content }: { content: string }) => (
            <div style={{ paddingRight: '16px' }} dangerouslySetInnerHTML={{ __html: content }} />
          ),
        }}
      >
        <TourContent />
      </TourProvider>
      <ServerLicenseModal {...flow.serverLicenseModalProps} />
    </>
  );
}
