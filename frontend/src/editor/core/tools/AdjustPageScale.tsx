import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import AdjustPageScaleSettings from "@editor/components/tools/adjustPageScale/AdjustPageScaleSettings";
import { useAdjustPageScaleParameters } from "@editor/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import { useAdjustPageScaleOperation } from "@editor/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useAdjustPageScaleTips } from "@editor/components/tooltips/useAdjustPageScaleTips";

const AdjustPageScale = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const adjustPageScaleTips = useAdjustPageScaleTips();

  const base = useBaseTool(
    "adjustPageScale",
    useAdjustPageScaleParameters,
    useAdjustPageScaleOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: "Settings",
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: adjustPageScaleTips,
        content: (
          <AdjustPageScaleSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("adjustPageScale.submit", "Adjust Page Scale"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("adjustPageScale.title", "Page Scale Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default AdjustPageScale as ToolComponent;
