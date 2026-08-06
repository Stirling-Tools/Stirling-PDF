import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import ScannerImageSplitSettings from "@editor/components/tools/scannerImageSplit/ScannerImageSplitSettings";
import { useScannerImageSplitParameters } from "@editor/hooks/tools/scannerImageSplit/useScannerImageSplitParameters";
import { useScannerImageSplitOperation } from "@editor/hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useScannerImageSplitTips } from "@editor/components/tooltips/useScannerImageSplitTips";

const ScannerImageSplit = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const scannerImageSplitTips = useScannerImageSplitTips();

  const base = useBaseTool(
    "scannerImageSplit",
    useScannerImageSplitParameters,
    useScannerImageSplitOperation,
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
        tooltip: scannerImageSplitTips,
        content: (
          <ScannerImageSplitSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("scannerImageSplit.submit", "Extract Image Scans"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("scannerImageSplit.title", "Extracted Images"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ScannerImageSplit as ToolComponent;
