import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import AutoRotateSettings from "@editor/components/tools/autoRotate/AutoRotateSettings";
import AutoRotateReport from "@editor/components/tools/autoRotate/AutoRotateReport";
import { useAutoRotateParameters } from "@editor/hooks/tools/autoRotate/useAutoRotateParameters";
import { useAutoRotateOperation } from "@editor/hooks/tools/autoRotate/useAutoRotateOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useAutoRotateTips } from "@editor/components/tooltips/useAutoRotateTips";

const AutoRotate = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const autoRotateTips = useAutoRotateTips();

  // Instantiated here (not inside useBaseTool) so the component can read the
  // per-page detection reports the operation hook additionally exposes.
  const operation = useAutoRotateOperation();

  const base = useBaseTool(
    "autoRotate",
    useAutoRotateParameters,
    () => operation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("autoRotate.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: autoRotateTips,
        content: (
          <AutoRotateSettings
            parameters={base.params}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("autoRotate.report.title", "Detection report"),
        isVisible: base.hasResults && operation.reports.length > 0,
        content: <AutoRotateReport reports={operation.reports} />,
      },
    ],
    executeButton: {
      text: t("autoRotate.submit", "Auto Rotate"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("autoRotate.results.title", "Auto Rotate Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default AutoRotate as ToolComponent;
