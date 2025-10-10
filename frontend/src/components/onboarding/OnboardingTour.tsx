import React from "react";
import { TourProvider, useTour, type StepType } from '@reactour/tour';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import { CloseButton, Button } from '@mantine/core';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { useTourOrchestration } from '../../contexts/TourOrchestrationContext';

// Enum case order defines order steps will appear
enum TourStep {
  WELCOME,
  ALL_TOOLS,
  SELECT_CROP_TOOL,
  TOOL_INTERFACE,
  FILES_BUTTON,
  FILE_SOURCES,
  WORKBENCH,
  VIEW_SWITCHER,
  VIEWER,
  PAGE_EDITOR,
  ACTIVE_FILES,
  FILE_CHECKBOX,
  SELECT_CONTROLS,
  CROP_SETTINGS,
  RUN_BUTTON,
  RESULTS,
  UNDO,
  WRAP_UP,
}

function TourContent() {
  const { isOpen } = useOnboarding();
  const { setIsOpen, setCurrentStep } = useTour();
  const previousIsOpenRef = React.useRef(isOpen);

  // Sync tour open state with context and reset to step 0 when reopening
  React.useEffect(() => {
    const wasClosedNowOpen = !previousIsOpenRef.current && isOpen;
    previousIsOpenRef.current = isOpen;

    if (wasClosedNowOpen) {
      // Tour is being opened (Help button pressed), reset to first step
      setCurrentStep(0);
    }
    setIsOpen(isOpen);
  }, [isOpen, setIsOpen, setCurrentStep]);

  return null;
}

export default function OnboardingTour() {
  const { t } = useTranslation();
  const { completeTour, closeTour } = useOnboarding();
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
    modifyCropSettings,
    executeTool,
    undoOperation,
  } = useTourOrchestration();

  // Define steps as object keyed by enum - TypeScript ensures all keys are present
  const stepsConfig: Record<TourStep, StepType> = {
    [TourStep.WELCOME]: {
      selector: 'body',
      content: t('onboarding.welcome', "Welcome to Stirling PDF! Let's take you on a quick tour around the app."),
      position: 'center',
      padding: 0,
      action: () => {
        saveWorkbenchState();
        closeFilesModal();
        backToAllTools();
      },
    },
    [TourStep.ALL_TOOLS]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.allTools', 'This is the All Tools panel, where you can browse and select from all available PDF tools.'),
      position: 'center',
      padding: 0,
    },
    [TourStep.SELECT_CROP_TOOL]: {
      selector: '[data-tour="tool-button-crop"]',
      content: t('onboarding.selectCropTool', "Let's select the Crop tool to demonstrate how to use one of the tools."),
      position: 'right',
      padding: 0,
      actionAfter: () => selectCropTool(),
    },
    [TourStep.TOOL_INTERFACE]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.toolInterface', "This is the Crop tool interface. As you can see, there's not much there yet because we haven't added any PDF files to work with yet."),
      position: 'center',
      padding: 0,
    },
    [TourStep.FILES_BUTTON]: {
      selector: '[data-tour="files-button"]',
      content: t('onboarding.filesButton', "The Files button on the Quick Access bar allows you to upload PDFs to use the tools on."),
      position: 'right',
      padding: 10,
      action: () => openFilesModal(),
    },
    [TourStep.FILE_SOURCES]: {
      selector: '[data-tour="file-sources"]',
      content: t('onboarding.fileSources', 'You can upload new files or access recent files from here.'),
      position: 'right',
      padding: 0,
      actionAfter: () => {
        closeFilesModal();
        loadSampleFile();
      }
    },
    [TourStep.WORKBENCH]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.workbench', 'This is the Workbench - the main area where you view and edit your PDFs.'),
      position: 'center',
      padding: 0,
    },
    [TourStep.VIEW_SWITCHER]: {
      selector: '[data-tour="view-switcher"]',
      content: t('onboarding.viewSwitcher', 'Use these controls to select how you want to view your PDFs.'),
      position: 'bottom',
      padding: 0,
    },
    [TourStep.VIEWER]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.viewer', "The Viewer lets you read and annotate your PDFs."),
      position: 'center',
      padding: 0,
      action: () => switchToViewer(),
    },
    [TourStep.PAGE_EDITOR]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.pageEditor', "The Page Editor allows you to do various operations on the pages within your PDFs, such as reordering, rotating and deleting."),
      position: 'center',
      padding: 0,
      action: () => switchToPageEditor(),
    },
    [TourStep.ACTIVE_FILES]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.activeFiles', "The Active Files view shows all of the PDFs you have loaded into the tool, and allows you to select which ones to process."),
      position: 'center',
      padding: 0,
      action: () => switchToActiveFiles(),
    },
    [TourStep.FILE_CHECKBOX]: {
      selector: '[data-tour="file-card-checkbox"]',
      content: t('onboarding.fileCheckbox', "Clicking one of the files selects it for processing. You can select multiple files for batch operations."),
      position: 'top',
      padding: 10,
    },
    [TourStep.SELECT_CONTROLS]: {
      selector: '[data-tour="select-all-button"]',
      content: t('onboarding.selectControls', "The Right Rail contains buttons to quickly select/deselect all of your active PDFs, along with buttons to change the app's theme or language."),
      position: 'left',
      padding: 10,
      action: () => selectFirstFile(),
    },
    [TourStep.CROP_SETTINGS]: {
      selector: '[data-tour="crop-settings"]',
      content: t('onboarding.cropSettings', "Now that we've selected the file we want crop, we can configure the Crop tool to choose the area that we want to crop the PDF to."),
      position: 'left',
      padding: 10,
      action: () => modifyCropSettings(),
    },
    [TourStep.RUN_BUTTON]: {
      selector: '[data-tour="run-button"]',
      content: t('onboarding.runButton', "Once the tool has been configured, this button allows you to run the tool on all the selected PDFs."),
      position: 'top',
      padding: 10,
      actionAfter: () => executeTool(),
    },
    [TourStep.RESULTS]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.results', "After the tool has finished running, the Review step will show a preview of the results in this panel. The modified file will replace the original file in the Workbench automatically (unless you Pin the original file)."),
      position: 'center',
      padding: 0,
    },
    [TourStep.UNDO]: {
      selector: '[data-tour="undo-button"]',
      content: t('onboarding.undo', "If you're unhappy with the results from the tool, you can use the Undo button to revert the operation and restore your original files."),
      position: 'left',
      padding: 10,
      actionAfter: () => undoOperation(),
    },
    [TourStep.WRAP_UP]: {
      selector: '[data-tour="help-button"]',
      content: t('onboarding.wrapUp', "You're all set! You've learnt about the main areas of the app and how to use them. Click the Help button whenever you like to see this tour again."),
      position: 'right',
      padding: 10,
    },
  };

  // Convert to array using enum's numeric ordering
  const steps = Object.values(stepsConfig);

  return (
    <TourProvider
      steps={steps}
      onClickClose={({ setIsOpen }) => {
        setIsOpen(false);
        restoreWorkbenchState();
        closeTour();
      }}
      onClickMask={({ setCurrentStep, currentStep, steps, setIsOpen }) => {
        if (steps && currentStep === steps.length - 1) {
          setIsOpen(false);
          restoreWorkbenchState();
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
      disableInteraction={true}
      disableKeyboardNavigation={['left']}
      disableDotsNavigation={true}
      prevButton={() => null}
      nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = currentStep === stepsLength - 1;

        return (
          <Button
            onClick={() => {
              if (isLast) {
                setIsOpen(false);
                restoreWorkbenchState();
                completeTour();
              } else {
                setCurrentStep(Math.min(stepsLength - 1, currentStep + 1));
              }
            }}
            variant="filled"
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
