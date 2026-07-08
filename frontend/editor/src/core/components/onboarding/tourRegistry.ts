import type { StepType } from "@reactour/tour";
import type { TFunction } from "i18next";
import type { useTourOrchestration } from "@app/contexts/TourOrchestrationContext";
import type { useAdminTourOrchestration } from "@app/contexts/AdminTourOrchestrationContext";
import { createAdminStepsConfig } from "@app/components/onboarding/adminStepsConfig";
import { createUserStepsConfig } from "@app/components/onboarding/userStepsConfig";
import { createWhatsNewStepsConfig } from "@app/components/onboarding/whatsNewStepsConfig";

type WorkbenchTourActions = ReturnType<typeof useTourOrchestration>;
type AdminTourActions = ReturnType<typeof useAdminTourOrchestration>;

/**
 * Everything a tour's step builder might need, resolved once by the onboarding
 * component from the two orchestration contexts. Each tour picks what it uses.
 */
export interface TourBuildContext {
  t: TFunction;
  workbench: WorkbenchTourActions;
  admin: AdminTourActions;
  openFilesModal: () => void;
  closeFilesModal: () => void;
}

export interface TourDefinition {
  id: string;
  build: (ctx: TourBuildContext) => StepType[];
}

/**
 * Registry of guided tours. Adding a tour is a single entry here — no changes
 * to the onboarding component's rendering. Tour ids are open strings so future
 * builds/features can register their own without editing a central union.
 */
export const TOUR_REGISTRY: Record<string, TourDefinition> = {
  admin: {
    id: "admin",
    build: ({ t, admin }) =>
      Object.values(
        createAdminStepsConfig({
          t,
          actions: {
            saveAdminState: admin.saveAdminState,
            openConfigModal: admin.openConfigModal,
            navigateToSection: admin.navigateToSection,
            scrollNavToSection: admin.scrollNavToSection,
          },
        }),
      ),
  },
  tools: {
    id: "tools",
    build: ({ t, workbench, admin, openFilesModal, closeFilesModal }) =>
      Object.values(
        createUserStepsConfig({
          t,
          actions: {
            saveWorkbenchState: workbench.saveWorkbenchState,
            closeFilesModal,
            backToAllTools: workbench.backToAllTools,
            selectCropTool: workbench.selectCropTool,
            loadSampleFile: workbench.loadSampleFile,
            switchToActiveFiles: workbench.switchToActiveFiles,
            pinFile: workbench.pinFile,
            revealFileCardHoverMenu: workbench.revealFileCardHoverMenu,
            modifyCropSettings: workbench.modifyCropSettings,
            executeTool: workbench.executeTool,
            openFilesModal,
            openSettingsHelpSection: () => admin.navigateToSection("help"),
          },
        }),
      ),
  },
  whatsnew: {
    id: "whatsnew",
    build: ({ t, workbench, openFilesModal, closeFilesModal }) =>
      Object.values(
        createWhatsNewStepsConfig({
          t,
          actions: {
            saveWorkbenchState: workbench.saveWorkbenchState,
            closeFilesModal,
            backToAllTools: workbench.backToAllTools,
            openFilesModal,
            loadSampleFile: workbench.loadSampleFile,
            switchToViewer: workbench.switchToViewer,
            switchToPageEditor: workbench.switchToPageEditor,
            switchToActiveFiles: workbench.switchToActiveFiles,
          },
        }),
      ),
  },
};

/** Default tour when a requested id is unknown or unset. */
export const DEFAULT_TOUR_TYPE = "whatsnew";

/** Resolves a tour's steps, falling back to the default tour for unknown ids. */
export function getTourSteps(
  tourType: string,
  ctx: TourBuildContext,
): StepType[] {
  const definition =
    TOUR_REGISTRY[tourType] ?? TOUR_REGISTRY[DEFAULT_TOUR_TYPE];
  return definition.build(ctx);
}
