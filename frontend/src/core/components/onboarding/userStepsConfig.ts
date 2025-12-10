import type { StepType } from '@reactour/tour';
import type { TFunction } from 'i18next';

export enum TourStep {
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

interface UserStepActions {
  saveWorkbenchState: () => void;
  closeFilesModal: () => void;
  backToAllTools: () => void;
  selectCropTool: () => void;
  loadSampleFile: () => void;
  switchToViewer: () => void;
  switchToPageEditor: () => void;
  switchToActiveFiles: () => void;
  selectFirstFile: () => void;
  pinFile: () => void;
  modifyCropSettings: () => void;
  executeTool: () => void;
  openFilesModal: () => void;
}

interface CreateUserStepsConfigArgs {
  t: TFunction;
  actions: UserStepActions;
}

export function createUserStepsConfig({ t, actions }: CreateUserStepsConfigArgs): Partial<Record<TourStep, StepType>> {
  const {
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
  } = actions;

  return {
    [TourStep.ALL_TOOLS]: {
      selector: '[data-tour="tool-panel"]',
      content: t('onboarding.allTools', 'This is the <strong>Tools</strong> panel, where you can browse and select from all available PDF tools.'),
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
      },
    },
    [TourStep.WORKBENCH]: {
      selector: '[data-tour="workbench"]',
      content: t('onboarding.workbench', 'This is the <strong>Workbench</strong> - the main area where you view and edit your PDFs.'),
      position: 'center',
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
}

