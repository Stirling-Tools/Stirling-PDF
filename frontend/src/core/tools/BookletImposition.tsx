import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import BookletImpositionSettings from "@app/components/tools/bookletImposition/BookletImpositionSettings";
import { useBookletImpositionParameters } from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";
import { useBookletImpositionOperation } from "@app/hooks/tools/bookletImposition/useBookletImpositionOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useBookletImpositionTips } from "@app/components/tooltips/useBookletImpositionTips";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const BookletImposition = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'bookletImposition',
    useBookletImpositionParameters,
    useBookletImpositionOperation,
    props
  );

  const bookletTips = useBookletImpositionTips();

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: "Settings",
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: bookletTips,
        content: (
          <BookletImpositionSettings
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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