import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import BookletImpositionSettings from "@editor/components/tools/bookletImposition/BookletImpositionSettings";
import BookletImpositionAdvancedSettings from "@editor/components/tools/bookletImposition/BookletImpositionAdvancedSettings";
import { useBookletImpositionParameters } from "@editor/hooks/tools/bookletImposition/useBookletImpositionParameters";
import { useBookletImpositionOperation } from "@editor/hooks/tools/bookletImposition/useBookletImpositionOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useAccordionSteps } from "@editor/hooks/tools/shared/useAccordionSteps";
import {
  useBookletImpositionTips,
  useBookletImpositionAdvancedTips,
} from "@editor/components/tooltips/useBookletImpositionTips";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

enum BookletImpositionStep {
  NONE = "none",
  SETTINGS = "settings",
  ADVANCED = "advanced",
}

const BookletImposition = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "bookletImposition",
    useBookletImpositionParameters,
    useBookletImpositionOperation,
    props,
  );

  const bookletTips = useBookletImpositionTips();
  const bookletAdvancedTips = useBookletImpositionAdvancedTips();

  const accordion = useAccordionSteps<BookletImpositionStep>({
    noneValue: BookletImpositionStep.NONE,
    initialStep: BookletImpositionStep.SETTINGS,
    stateConditions: {
      hasFiles: base.hasFiles,
      hasResults: base.hasResults,
    },
    afterResults: base.handleSettingsReset,
  });

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("bookletImposition.settings.title", "Settings"),
        isCollapsed: accordion.getCollapsedState(
          BookletImpositionStep.SETTINGS,
        ),
        onCollapsedClick: () =>
          accordion.handleStepToggle(BookletImpositionStep.SETTINGS),
        tooltip: bookletTips,
        content: (
          <BookletImpositionSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("bookletImposition.advanced.title", "Advanced"),
        isCollapsed: accordion.getCollapsedState(
          BookletImpositionStep.ADVANCED,
        ),
        onCollapsedClick: () =>
          accordion.handleStepToggle(BookletImpositionStep.ADVANCED),
        tooltip: bookletAdvancedTips,
        content: (
          <BookletImpositionAdvancedSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("bookletImposition.submit", "Create Booklet"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("bookletImposition.title", "Booklet Imposition Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default BookletImposition as ToolComponent;
