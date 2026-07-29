import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useAutoFormDetectionParameters } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";
import { useAutoFormDetectionOperation } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const AutoFormDetection = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "autoFormDetection",
    useAutoFormDetectionParameters,
    useAutoFormDetectionOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasFiles || base.hasResults,
    },
    steps: [],
    executeButton: {
      text: t("autoFormDetection.submit", "Detect & make fillable"),
      isVisible: !base.hasResults,
      loadingText: t("autoFormDetection.loading", "Detecting form fields..."),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("autoFormDetection.results.title", "Detected Form Fields"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation.
AutoFormDetection.tool = () => useAutoFormDetectionOperation;

export default AutoFormDetection as ToolComponent;
