import type { StepType } from "@reactour/tour";
import type { TFunction } from "i18next";
import {
  besideCentered,
  insideBottom,
  revealPickerTool,
  waitForElement,
  waitForHighlightable,
} from "@editor/components/onboarding/tourUtils";

export enum TourStep {
  ALL_TOOLS,
  SELECT_CROP_TOOL,
  TOOL_INTERFACE,
  FILES_BUTTON,
  FILE_SOURCES,
  WORKBENCH,
  ACTIVE_FILES,
  FILE_CHECKBOX,
  CROP_SETTINGS,
  RUN_BUTTON,
  RESULTS,
  FILE_REPLACEMENT,
  PIN_BUTTON,
  WRAP_UP,
}

interface UserStepActions {
  saveWorkbenchState: () => void;
  closeFilesModal: () => void;
  backToAllTools: () => void;
  selectCropTool: () => void;
  loadSampleFile: () => void;
  switchToActiveFiles: () => void;
  pinFile: () => void;
  revealFileCardHoverMenu: () => void;
  modifyCropSettings: () => void;
  executeTool: () => void;
  openFilesModal: () => void;
  openSettingsHelpSection: () => void;
}

interface CreateUserStepsConfigArgs {
  t: TFunction;
  actions: UserStepActions;
}

export function createUserStepsConfig({
  t,
  actions,
}: CreateUserStepsConfigArgs): Record<TourStep, StepType> {
  const {
    saveWorkbenchState,
    closeFilesModal,
    backToAllTools,
    selectCropTool,
    loadSampleFile,
    switchToActiveFiles,
    pinFile,
    revealFileCardHoverMenu,
    modifyCropSettings,
    executeTool,
    openFilesModal,
    openSettingsHelpSection,
  } = actions;

  return {
    [TourStep.ALL_TOOLS]: {
      selector: '[data-tour="tool-panel"]',
      content: t(
        "onboarding.allTools",
        "This is the <strong>Tools</strong> panel, where you can browse and select from all available PDF tools.",
      ),
      position: besideCentered,
      padding: 0,
      action: () => {
        saveWorkbenchState();
        closeFilesModal();
        backToAllTools();
      },
    },
    [TourStep.SELECT_CROP_TOOL]: {
      selector: '[data-tour="tool-button-crop"]',
      content: t(
        "onboarding.selectCropTool",
        "Select the <strong>Crop</strong> tool to see how a tool works.",
      ),
      padding: 0,
      action: async () => {
        await revealPickerTool('[data-tour="tool-button-crop"]');
      },
      actionAfter: () => selectCropTool(),
    },
    [TourStep.TOOL_INTERFACE]: {
      selector: '[data-tour="tool-panel"]',
      content: t(
        "onboarding.toolInterface",
        "This is the <strong>Crop</strong> tool. It's mostly empty because no PDFs have been added yet.",
      ),
      position: besideCentered,
      padding: 0,
    },
    [TourStep.FILES_BUTTON]: {
      selector: '[data-tour="files-button"]',
      content: t(
        "onboarding.filesButton",
        "The <strong>Files</strong> button on the Quick Access bar allows you to upload PDFs to use the tools on.",
      ),
      position: "right",
      padding: 4,
      actionAfter: () => openFilesModal(),
    },
    [TourStep.FILE_SOURCES]: {
      selector: '[data-tour="file-sources"]',
      highlightedSelectors: [
        '[data-tour="file-sources"]',
        '[data-tour="files-modal"] .files-page-view-tabs',
      ],
      content: t(
        "onboarding.fileSources",
        "Upload new files or open recent ones here. For the tour, we'll use a sample file.",
      ),
      position: "bottom",
      padding: 6,
      action: async () => {
        await waitForElement('[data-tour="file-sources"]', 5000);
        await waitForHighlightable('[data-tour="file-sources"]', 5000);
      },
      actionAfter: () => {
        loadSampleFile();
        closeFilesModal();
      },
    },
    [TourStep.WORKBENCH]: {
      selector: '[data-tour="workbench"]',
      content: t(
        "onboarding.workbench",
        "This is the <strong>Workbench</strong>, where you view and edit your PDFs.",
      ),
      position: insideBottom,
      padding: 0,
    },
    [TourStep.ACTIVE_FILES]: {
      selector: '[data-tour="workbench"]',
      content: t(
        "onboarding.activeFiles",
        "The <strong>Active Files</strong> view shows all of the PDFs you have loaded into the tool.",
      ),
      position: insideBottom,
      padding: 0,
      action: () => switchToActiveFiles(),
    },
    [TourStep.FILE_CHECKBOX]: {
      selector: '[data-tour="file-card-checkbox"]',
      content: t(
        "onboarding.fileCheckbox",
        "Files on the workbench are selected for processing. You can select multiple files for batch operations using the left files sidebar.",
      ),
      padding: 6,
    },
    [TourStep.CROP_SETTINGS]: {
      selector: '[data-tour="crop-settings"]',
      content: t(
        "onboarding.cropSettings",
        "Now that we've selected the file we want crop, we can configure the <strong>Crop</strong> tool to choose the area that we want to crop the PDF to.",
      ),
      position: besideCentered,
      padding: 6,
      action: () => modifyCropSettings(),
    },
    [TourStep.RUN_BUTTON]: {
      selector: '[data-tour="run-button"]',
      content: t(
        "onboarding.runButton",
        "Once the tool has been configured, this button allows you to run the tool on all the selected PDFs.",
      ),
      position: "top",
      padding: 6,
      actionAfter: () => executeTool(),
    },
    [TourStep.RESULTS]: {
      selector: '[data-tour="tool-panel"]',
      content: t(
        "onboarding.results",
        "After the tool has finished running, the <strong>Review</strong> step will show a preview of the results in this panel, and allow you to undo the operation or download the file. ",
      ),
      position: besideCentered,
      padding: 0,
    },
    [TourStep.FILE_REPLACEMENT]: {
      selector: '[data-tour="file-card-checkbox"]',
      content: t(
        "onboarding.fileReplacement",
        "The modified file replaces the original in the Workbench, so you can run it through more tools.",
      ),
      padding: 6,
    },
    [TourStep.PIN_BUTTON]: {
      selector: '[data-tour="file-card-pin"]',
      content: t(
        "onboarding.pinButton",
        "You can use the <strong>Pin</strong> button if you'd rather your files stay active after running tools on them.",
      ),
      position: "left",
      padding: 4,
      action: () => revealFileCardHoverMenu(),
      actionAfter: () => pinFile(),
    },
    [TourStep.WRAP_UP]: {
      selector: '[data-tour="settings-tours"]',
      content: t(
        "onboarding.wrapUp",
        "You can replay this tour from <strong>Settings</strong>, in the <strong>Tours</strong> section under Help.",
      ),
      padding: 6,
      action: async () => {
        openSettingsHelpSection();
        await waitForElement('[data-tour="settings-tours"]', 5000);
        await waitForHighlightable('[data-tour="settings-tours"]', 5000);
      },
    },
  };
}
