import React from "react";
import { TourProvider, useTour, type StepType } from '@reactour/tour';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import { CloseButton, ActionIcon } from '@mantine/core';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { useTourOrchestration } from '../../contexts/TourOrchestrationContext';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Enum case order defines order steps will appear
enum TourStep {
  ALL_TOOLS,
  SELECT_CROP_TOOL,
  TOOL_INTERFACE,
  FILES_BUTTON,
  FILE_SOURCES,
  WORKBENCH,
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
    [TourStep.ALL_TOOLS]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.allTools', 'Welcome to Stirling PDF! This is the All Tools panel where you can browse and select from all available PDF tools organized by category.'),
      position: 'right',
      padding: 0,
      action: () => {
        closeFilesModal();
        backToAllTools();
      },
    },
    [TourStep.SELECT_CROP_TOOL]: {
      selector: '[data-tour="tool-button-crop"]',
      content: t('onboarding.selectCropTool', "Let's select the Crop tool to demonstrate a complete workflow. We'll automatically select it for you in a moment."),
      position: 'right',
      padding: 0,
      action: () => closeFilesModal(),
    },
    [TourStep.TOOL_INTERFACE]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.toolInterface', "This is the Crop tool interface. It replaces the All Tools panel and shows tool-specific settings. But first, we need a PDF file to work with."),
      position: 'right',
      padding: 0,
      action: () => {
        closeFilesModal();
        selectCropTool();
      },
    },
    [TourStep.FILES_BUTTON]: {
      selector: '[data-tour="files-button"]',
      content: t('onboarding.filesButton', "The Files button on the Quick Access bar lets you load PDFs. We'll automatically open the Files modal."),
      position: 'right',
      padding: 10,
      action: () => openFilesModal(),
    },
    [TourStep.FILE_SOURCES]: {
      selector: '[data-tour="file-sources"]',
      content: t('onboarding.fileSources', 'You can upload new files or access recent files from here.'),
      position: 'right',
      padding: 0,
      action: () => openFilesModal(),
    },
    [TourStep.WORKBENCH]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.workbench', 'This is the Workbench - the main area where you view and edit your PDFs. You can switch between three different views using the controls at the top.'),
      position: 'center',
      padding: 0,
      action: () => {
        loadSampleFile();
      },
    },
    [TourStep.VIEWER]: {
      selector: '[data-tour="view-switcher"]',
      content: t('onboarding.viewer', "The Viewer lets you read and annotate PDFs. Let's switch to it now to see our sample file."),
      position: 'bottom',
      padding: 0,
      action: () => {
        closeFilesModal();
        switchToViewer();
      },
    },
    [TourStep.PAGE_EDITOR]: {
      selector: '[data-tour="view-switcher"]',
      content: t('onboarding.pageEditor', "The Page Editor allows you to reorder, rotate, split, and delete pages. Let's take a quick look."),
      position: 'bottom',
      padding: 0,
      action: () => {
        closeFilesModal();
        switchToPageEditor();
      },
    },
    [TourStep.ACTIVE_FILES]: {
      selector: '[data-tour="view-switcher"]',
      content: t('onboarding.activeFiles', "Active Files shows all loaded PDFs and lets you select which ones to process. Let's go back there now."),
      position: 'bottom',
      padding: 0,
      action: () => {
        closeFilesModal();
        switchToActiveFiles();
      },
    },
    [TourStep.FILE_CHECKBOX]: {
      selector: '[data-tour="file-card-checkbox"]',
      content: t('onboarding.fileCheckbox', "Click a file card to select it for processing. You can select multiple files for batch operations."),
      position: 'top',
      padding: 0,
      action: () => closeFilesModal(),
    },
    [TourStep.SELECT_CONTROLS]: {
      selector: '[data-tour="select-all-button"]',
      content: t('onboarding.selectControls', 'Use these buttons to quickly select or deselect all files when working with multiple PDFs.'),
      position: 'left',
      padding: 0,
      action: () => {
        closeFilesModal();
        selectFirstFile();
      },
    },
    [TourStep.CROP_SETTINGS]: {
      selector: '[data-tour="crop-settings"]',
      content: t('onboarding.cropSettings', "Here you can adjust the crop area by dragging on the preview or entering precise coordinates. We'll modify the crop area slightly."),
      position: 'left',
      padding: 0,
      action: () => {
        closeFilesModal();
        modifyCropSettings();
      },
    },
    [TourStep.RUN_BUTTON]: {
      selector: '[data-tour="run-button"]',
      content: t('onboarding.runButton', "Once your settings are configured, click Run to execute the tool and process your selected files."),
      position: 'top',
      padding: 10,
      action: () => closeFilesModal(),
    },
    [TourStep.RESULTS]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.results', "After processing, you'll see a preview of the results in this panel. You can download the file or continue working with it in other tools."),
      position: 'right',
      padding: 0,
      action: () => {
        closeFilesModal();
        executeTool();
      },
    },
    [TourStep.UNDO]: {
      selector: '[data-tour="undo-button"]',
      content: t('onboarding.undo', "Made a mistake? Use the Undo button to revert the operation and restore your original files."),
      position: 'left',
      padding: 0,
      action: () => closeFilesModal(),
    },
    [TourStep.WRAP_UP]: {
      selector: 'body',
      content: t('onboarding.wrapUp', "You're all set! You've learned how to select tools, load files, switch views, configure settings, and process PDFs. Click the Help button anytime to see this tour again."),
      position: 'center',
      padding: 0,
      action: () => {
        closeFilesModal();
        undoOperation();
      },
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
      disableInteraction={true}
      prevButton={({ currentStep, setCurrentStep }) => {
        const isFirst = currentStep === TourStep.ALL_TOOLS;
        return (
          <ActionIcon
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={isFirst}
            variant="filled"
            size="lg"
            style={{ marginRight: '8px' }}
            aria-label={t('onboarding.previous', 'Previous')}
          >
            <ArrowBackIcon />
          </ActionIcon>
        );
      }}
      nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = currentStep === stepsLength - 1;

        return (
          <ActionIcon
            onClick={() => {
              if (isLast) {
                setIsOpen(false);
                completeTour();
              } else {
                setCurrentStep(Math.min(stepsLength - 1, currentStep + 1));
              }
            }}
            variant="filled"
            size="lg"
            aria-label={isLast ? t('onboarding.finish', 'Finish') : t('onboarding.next', 'Next')}
          >
            <ArrowForwardIcon />
          </ActionIcon>
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
