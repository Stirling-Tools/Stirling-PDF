import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import RemoveAnnotationsSettings from "@editor/components/tools/removeAnnotations/RemoveAnnotationsSettings";
import { useRemoveAnnotationsParameters } from "@editor/hooks/tools/removeAnnotations/useRemoveAnnotationsParameters";
import { useRemoveAnnotationsOperation } from "@editor/hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useRemoveAnnotationsTips } from "@editor/components/tooltips/useRemoveAnnotationsTips";

const RemoveAnnotations = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const removeAnnotationsTips = useRemoveAnnotationsTips();

  const base = useBaseTool(
    "removeAnnotations",
    useRemoveAnnotationsParameters,
    useRemoveAnnotationsOperation,
    props,
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
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: removeAnnotationsTips,
        content: <RemoveAnnotationsSettings />,
      },
    ],
    executeButton: {
      text: t("removeAnnotations.submit", "Remove Annotations"),
      isVisible: !base.hasResults,
      loadingText: t("loading", "Processing..."),
      onClick: base.handleExecute,
      paramsValid: base.params.validateParameters(),
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
