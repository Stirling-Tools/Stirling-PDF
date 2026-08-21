import type { StepType } from "@reactour/tour";
import type { TFunction } from "i18next";
import {
  waitForElement,
  waitForHighlightable,
} from "@app/components/onboarding/tourUtils";

export enum WhatsNewTourStep {
  QUICK_ACCESS,
  LEFT_PANEL,
  FILE_UPLOAD,
  TOP_BAR,
  PAGE_EDITOR_VIEW,
  ACTIVE_FILES_VIEW,
  WRAP_UP,
}

interface WhatsNewStepActions {
  saveWorkbenchState: () => void;
  closeFilesModal: () => void;
  backToAllTools: () => void;
  openFilesModal: () => void;
  loadSampleFile: () => Promise<void> | void;
  switchToViewer: () => void;
  switchToPageEditor: () => void;
  switchToActiveFiles: () => void;
}

interface CreateWhatsNewStepsConfigArgs {
  t: TFunction;
  actions: WhatsNewStepActions;
}

export function createWhatsNewStepsConfig({
  t,
  actions,
}: CreateWhatsNewStepsConfigArgs): Record<WhatsNewTourStep, StepType> {
  const {
    saveWorkbenchState,
    closeFilesModal,
    backToAllTools,
    openFilesModal,
    loadSampleFile,
    switchToViewer,
    switchToPageEditor,
    switchToActiveFiles,
  } = actions;

  return {
    [WhatsNewTourStep.QUICK_ACCESS]: {
      selector: '[data-tour="quick-access-bar"]',
      content: t(
        "onboarding.whatsNew.quickAccess",
        "Start at the <strong>Quick Access</strong> rail to jump between Reader, Automate, your files, and all the tours.",
      ),
      position: "right",
      padding: 10,
      action: () => {
        saveWorkbenchState();
        closeFilesModal();
        backToAllTools();
      },
    },
    [WhatsNewTourStep.LEFT_PANEL]: {
      selector: '[data-tour="tool-panel"]',
      content: t(
        "onboarding.whatsNew.leftPanel",
        "The left <strong>Tools</strong> panel lists everything you can do. Browse categories or search to find a tool quickly.",
      ),
      position: "center",
      padding: 0,
    },
    [WhatsNewTourStep.FILE_UPLOAD]: {
      selector: '[data-tour="files-button"]',
      content: t(
        "onboarding.whatsNew.fileUpload",
        "Use the <strong>Files</strong> button to upload or pick a recent PDF. We will load a sample so you can see the workspace.",
      ),
      position: "right",
      padding: 10,
      actionAfter: async () => {
        openFilesModal();
        await waitForElement('[data-tour="file-sources"]', 5000);
        await Promise.resolve(loadSampleFile());
        closeFilesModal();
        switchToViewer();
        // wait for file render and top controls to mount
        await waitForElement('[data-tour="view-switcher"]', 7000);
        await waitForHighlightable('[data-tour="view-switcher"]', 7000);
      },
    },
    [WhatsNewTourStep.TOP_BAR]: {
      selector: '[data-tour="view-switcher"]',
      content: t(
        "onboarding.whatsNew.topBar",
        "The top bar lets you swap between <strong>Viewer</strong>, <strong>Page Editor</strong>, and <strong>Active Files</strong>.",
      ),
      position: "bottom",
      padding: 8,
      // Ensure the switcher has mounted before this step renders
      action: async () => {
        switchToViewer();
        await waitForElement('[data-tour="view-switcher"]', 7000);
        await waitForHighlightable('[data-tour="view-switcher"]', 7000);
      },
    },
    [WhatsNewTourStep.PAGE_EDITOR_VIEW]: {
      selector: '[data-tour="view-switcher"]',
      content: t(
        "onboarding.whatsNew.pageEditorView",
        "Switch to the Page Editor to reorder, rotate, or delete pages.",
      ),
      position: "bottom",
      padding: 8,
      action: async () => {
        switchToPageEditor();
        await waitForElement('[data-tour="view-switcher"]', 7000);
        await waitForHighlightable('[data-tour="view-switcher"]', 7000);
      },
    },
    [WhatsNewTourStep.ACTIVE_FILES_VIEW]: {
      selector: '[data-tour="view-switcher"]',
      content: t(
        "onboarding.whatsNew.activeFilesView",
        "Use Active Files to see everything you have open and pick what to work on.",
      ),
      position: "bottom",
      padding: 8,
      action: async () => {
        switchToActiveFiles();
        await waitForElement('[data-tour="view-switcher"]', 7000);
        await waitForHighlightable('[data-tour="view-switcher"]', 7000);
      },
    },
    [WhatsNewTourStep.WRAP_UP]: {
      selector: '[data-tour="help-button"]',
      content: t(
        "onboarding.whatsNew.wrapUp",
        "That is what is new in V2. Open the <strong>Tours</strong> menu anytime to replay this, the Tools tour, or the Admin tour.",
      ),
      position: "right",
      padding: 10,
    },
  };
}
