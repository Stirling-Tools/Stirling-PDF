import { useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ReplaceColorSettings, {
  DetectedTextColor,
} from "@app/components/tools/replaceColor/ReplaceColorSettings";
import { useReplaceColorParameters } from "@app/hooks/tools/replaceColor/useReplaceColorParameters";
import { useReplaceColorOperation } from "@app/hooks/tools/replaceColor/useReplaceColorOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useReplaceColorTips } from "@app/components/tooltips/useReplaceColorTips";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";

const ReplaceColor = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const replaceColorTips = useReplaceColorTips();
  const [detectedTextColors, setDetectedTextColors] = useState<DetectedTextColor[]>(
    [],
  );
  const [isScanningTextColors, setIsScanningTextColors] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const base = useBaseTool(
    "replaceColor",
    useReplaceColorParameters,
    useReplaceColorOperation,
    props,
  );

  const handleScanTextColors = async () => {
    if (base.selectedFiles.length === 0) {
      setScanError(t("noFileSelected", "No files selected"));
      return;
    }

    setIsScanningTextColors(true);
    setScanError(null);
    try {
      const formData = new FormData();
      formData.append("fileInput", base.selectedFiles[0]);
      const response = await apiClient.post<DetectedTextColor[]>(
        "/api/v1/misc/detect-text-colors",
        formData,
      );
      setDetectedTextColors(response.data ?? []);
    } catch (error: unknown) {
      setScanError(extractErrorMessage(error));
    } finally {
      setIsScanningTextColors(false);
    }
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("replaceColor.labels.settings", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: replaceColorTips,
        content: (
          <ReplaceColorSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            detectedTextColors={detectedTextColors}
            onScanTextColors={handleScanTextColors}
            isScanningTextColors={isScanningTextColors}
            scanError={scanError}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text:
        base.params.parameters.mode === "TEXT_COLOR_REPLACEMENT"
          ? t("replaceColor.actions.replaceTextColours", "Replace text colours")
          : t("replace-color.submit", "Replace"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("replace-color.title", "Replace-Invert-Color"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ReplaceColor as ToolComponent;
