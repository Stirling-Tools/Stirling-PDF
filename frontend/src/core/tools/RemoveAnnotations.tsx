import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RemoveAnnotationsSettings from "@app/components/tools/removeAnnotations/RemoveAnnotationsSettings";
import { useRemoveAnnotationsParameters } from "@app/hooks/tools/removeAnnotations/useRemoveAnnotationsParameters";
import { useRemoveAnnotationsOperation } from "@app/hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRemoveAnnotationsTips } from "@app/components/tooltips/useRemoveAnnotationsTips";

const RemoveAnnotations = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const removeAnnotationsTips = useRemoveAnnotationsTips();

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
        tooltip: removeAnnotationsTips,
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