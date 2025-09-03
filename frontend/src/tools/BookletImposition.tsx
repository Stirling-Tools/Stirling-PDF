import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import BookletImpositionSettings from "../components/tools/bookletImposition/BookletImpositionSettings";
import { useBookletImpositionParameters } from "../hooks/tools/bookletImposition/useBookletImpositionParameters";
import { useBookletImpositionOperation } from "../hooks/tools/bookletImposition/useBookletImpositionOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const BookletImposition = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'bookletImposition',
    useBookletImpositionParameters,
    useBookletImpositionOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      placeholder: t("bookletImposition.files.placeholder", "Select PDF files to create booklet impositions from"),
    },
    steps: [
      {
        title: "Settings",
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
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