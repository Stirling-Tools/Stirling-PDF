import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import RemoveAnnotationsSettings from "../components/tools/removeAnnotations/RemoveAnnotationsSettings";
import { useRemoveAnnotationsParameters } from "../hooks/tools/removeAnnotations/useRemoveAnnotationsParameters";
import { useRemoveAnnotationsOperation } from "../hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const RemoveAnnotations = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'removeAnnotations',
    useRemoveAnnotationsParameters,
    useRemoveAnnotationsOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removeAnnotations.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: <RemoveAnnotationsSettings />,
      },
    ],
    executeButton: {
      text: t("removeAnnotations.submit", "Remove Annotations"),
      isVisible: !base.hasResults,
      loadingText: t("loading", "Processing..."),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeAnnotations.title", "Annotations Removed"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default RemoveAnnotations as ToolComponent;