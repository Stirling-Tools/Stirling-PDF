import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ScannerImageSplitSettings from "@app/components/tools/scannerImageSplit/ScannerImageSplitSettings";
import { useScannerImageSplitParameters } from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitParameters";
import { useScannerImageSplitOperation } from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useScannerImageSplitTips } from "@app/components/tooltips/useScannerImageSplitTips";

const ScannerImageSplit = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const scannerImageSplitTips = useScannerImageSplitTips();

  const base = useBaseTool(
    'scannerImageSplit',
    useScannerImageSplitParameters,
    useScannerImageSplitOperation,
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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