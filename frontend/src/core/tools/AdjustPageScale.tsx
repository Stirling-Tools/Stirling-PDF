import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import AdjustPageScaleSettings from "@app/components/tools/adjustPageScale/AdjustPageScaleSettings";
import { useAdjustPageScaleParameters } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import { useAdjustPageScaleOperation } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useAdjustPageScaleTips } from "@app/components/tooltips/useAdjustPageScaleTips";

const AdjustPageScale = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const adjustPageScaleTips = useAdjustPageScaleTips();

  const base = useBaseTool(
    'adjustPageScale',
    useAdjustPageScaleParameters,
    useAdjustPageScaleOperation,
    props
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
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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
