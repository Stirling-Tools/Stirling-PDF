import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RotateSettings from "@app/components/tools/rotate/RotateSettings";
import { useRotateParameters } from "@app/hooks/tools/rotate/useRotateParameters";
import { useRotateOperation } from "@app/hooks/tools/rotate/useRotateOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRotateTips } from "@app/components/tooltips/useRotateTips";

const Rotate = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const rotateTips = useRotateTips();

  const base = useBaseTool(
    'rotate',
    useRotateParameters,
    useRotateOperation,
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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
