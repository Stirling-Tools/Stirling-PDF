import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import FlattenSettings from "@editor/components/tools/flatten/FlattenSettings";
import { useFlattenParameters } from "@editor/hooks/tools/flatten/useFlattenParameters";
import { useFlattenOperation } from "@editor/hooks/tools/flatten/useFlattenOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useFlattenTips } from "@editor/components/tooltips/useFlattenTips";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const Flatten = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const flattenTips = useFlattenTips();

  const base = useBaseTool(
    "flatten",
    useFlattenParameters,
    useFlattenOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("flatten.options.stepTitle", "Flatten Options"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: flattenTips,
        content: (
          <FlattenSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("flatten.submit", "Flatten PDF"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("flatten.results.title", "Flatten Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
Flatten.tool = () => useFlattenOperation;

export default Flatten as ToolComponent;
