import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import RotateSettings from "@editor/components/tools/rotate/RotateSettings";
import { useRotateParameters } from "@editor/hooks/tools/rotate/useRotateParameters";
import { useRotateOperation } from "@editor/hooks/tools/rotate/useRotateOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useRotateTips } from "@editor/components/tooltips/useRotateTips";

const Rotate = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const rotateTips = useRotateTips();

  const base = useBaseTool(
    "rotate",
    useRotateParameters,
    useRotateOperation,
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
        tooltip: rotateTips,
        content: (
          <RotateSettings
            parameters={base.params}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("rotate.submit", "Apply Rotation"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("rotate.title", "Rotation Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Rotate as ToolComponent;
