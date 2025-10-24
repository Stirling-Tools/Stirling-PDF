import React from "react";
import { TourProvider, useTour, type StepType } from '@reactour/tour';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import { CloseButton, ActionIcon } from '@mantine/core';

    
          
            
    

          
          Expand Down
          
            
    

          
          Expand Up
    
    @@ -250,14 +254,14 @@ export default function OnboardingTour() {
  
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { useTourOrchestration } from '../../contexts/TourOrchestrationContext';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import TourWelcomeModal from './TourWelcomeModal';
import './OnboardingTour.css';
// Enum case order defines order steps will appear
enum TourStep {
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
  FILE_REPLACEMENT,
  PIN_BUTTON,
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
  const { completeTour, showWelcomeModal, setShowWelcomeModal, startTour } = useOnboarding();
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
  // Define steps as object keyed by enum - TypeScript ensures all keys are present
  const stepsConfig: Record<TourStep, StepType> = {
    [TourStep.ALL_TOOLS]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.allTools', 'This is the <strong>All Tools</strong> panel, where you can browse and select from all available PDF tools.'),
      position: 'center',
      padding: 0,
      action: () => {
        saveWorkbenchState();
        closeFilesModal();
        backToAllTools();
      },
    },
    [TourStep.SELECT_CROP_TOOL]: {
      selector: '[data-tour="tool-button-crop"]',
      content: t('onboarding.selectCropTool', "Let's select the <strong>Crop</strong> tool to demonstrate how to use one of the tools."),
      position: 'right',
      padding: 0,
      actionAfter: () => selectCropTool(),
    },
    [TourStep.TOOL_INTERFACE]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.toolInterface', "This is the <strong>Crop</strong> tool interface. As you can see, there's not much there because we haven't added any PDF files to work with yet."),
      position: 'center',
      padding: 0,
    },
    [TourStep.FILES_BUTTON]: {
      selector: '[data-tour="files-button"]',
      content: t('onboarding.filesButton', "The <strong>Files</strong> button on the Quick Access bar allows you to upload PDFs to use the tools on."),
      position: 'right',
      padding: 10,
      action: () => openFilesModal(),
    },
    [TourStep.FILE_SOURCES]: {
      selector: '[data-tour="file-sources"]',
      content: t('onboarding.fileSources', "You can upload new files or access recent files from here. For the tour, we'll just use a sample file."),
      position: 'right',
      padding: 0,
      actionAfter: () => {
        loadSampleFile();
        closeFilesModal();
      }
    },
    [TourStep.WORKBENCH]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.workbench', 'This is the <strong>Workbench</strong> - the main area where you view and edit your PDFs.'),
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
      content: t('onboarding.viewer', "The <strong>Viewer</strong> lets you read and annotate your PDFs."),
      position: 'center',
      padding: 0,
      action: () => switchToViewer(),
    },
    [TourStep.PAGE_EDITOR]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.pageEditor', "The <strong>Page Editor</strong> allows you to do various operations on the pages within your PDFs, such as reordering, rotating and deleting."),
      position: 'center',
      padding: 0,
      action: () => switchToPageEditor(),
    },
    [TourStep.ACTIVE_FILES]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.activeFiles', "The <strong>Active Files</strong> view shows all of the PDFs you have loaded into the tool, and allows you to select which ones to process."),
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
      selector: '[data-tour="right-rail-controls"]',
      highlightedSelectors: ['[data-tour="right-rail-controls"]', '[data-tour="right-rail-settings"]'],
      content: t('onboarding.selectControls', "The <strong>Right Rail</strong> contains buttons to quickly select/deselect all of your active PDFs, along with buttons to change the app's theme or language."),
      position: 'left',
      padding: 5,
      action: () => selectFirstFile(),
    },
    [TourStep.CROP_SETTINGS]: {
      selector: '[data-tour="crop-settings"]',
      content: t('onboarding.cropSettings', "Now that we've selected the file we want crop, we can configure the <strong>Crop</strong> tool to choose the area that we want to crop the PDF to."),
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
      content: t('onboarding.results', "After the tool has finished running, the <strong>Review</strong> step will show a preview of the results in this panel, and allow you to undo the operation or download the file. "),
      position: 'center',
      padding: 0,
    },
    [TourStep.FILE_REPLACEMENT]: {
      selector: '[data-tour="file-card-checkbox"]',
      content: t('onboarding.fileReplacement', "The modified file will replace the original file in the Workbench automatically, allowing you to easily run it through more tools."),
      position: 'left',
      padding: 10,
    },
    [TourStep.PIN_BUTTON]: {
      selector: '[data-tour="file-card-pin"]',
      content: t('onboarding.pinButton', "You can use the <strong>Pin</strong> button if you'd rather your files stay active after running tools on them."),
      position: 'left',
      padding: 10,
      action: () => pinFile(),
    },
    [TourStep.WRAP_UP]: {
      selector: '[data-tour="help-button"]',
      content: t('onboarding.wrapUp', "You're all set! You've learnt about the main areas of the app and how to use them. Click the <strong>Help</strong> button whenever you like to see this tour again."),
      position: 'right',
      padding: 10,
    },
  };
  // Convert to array using enum's numeric ordering
  const steps = Object.values(stepsConfig);
  const advanceTour = ({ setCurrentStep, currentStep, steps, setIsOpen }: {
    setCurrentStep: (value: number | ((prev: number) => number)) => void;
    currentStep: number;
    steps?: StepType[];
    setIsOpen: (value: boolean) => void;
  }) => {
    if (steps && currentStep === steps.length - 1) {
      setIsOpen(false);
      restoreWorkbenchState();
      completeTour();
    } else if (steps) {
      setCurrentStep((s) => (s === steps.length - 1 ? 0 : s + 1));
    }
  };
  const handleCloseTour = ({ setIsOpen }: { setIsOpen: (value: boolean) => void }) => {
    setIsOpen(false);
    restoreWorkbenchState();
    completeTour();
  };
  return (
    <>
      <TourWelcomeModal
        opened={showWelcomeModal}
        onStartTour={() => {
          setShowWelcomeModal(false);
          startTour();
        }}
        onMaybeLater={() => {
          setShowWelcomeModal(false);
        }}
        onDontShowAgain={() => {
          setShowWelcomeModal(false);
          completeTour();
        }}
      />
      <TourProvider
        steps={steps}
        onClickClose={handleCloseTour}
        onClickMask={advanceTour}
        onClickHighlighted={(e, clickProps) => {
          e.stopPropagation();
          advanceTour(clickProps);
        }}
        keyboardHandler={(e, clickProps, status) => {
          // Handle right arrow key to advance tour
          if (e.key === 'ArrowRight' && !status?.isRightDisabled && clickProps) {
            e.preventDefault();
            advanceTour(clickProps);
          }
          // Handle escape key to close tour
          else if (e.key === 'Escape' && !status?.isEscDisabled && clickProps) {
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
        components={{
          Close: ({ onClick }) => (
            <CloseButton
              onClick={onClick}
              size="md"
              style={{ position: 'absolute', top: '8px', right: '8px' }}
            />
          ),
          Content: ({ content } : {content: string}) => (
            <div
              style={{ paddingRight: '16px' /* Ensure text doesn't overlap with close button */ }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ),
        }}
      >
        <TourContent />
      </TourProvider>
    </>
  );
}