import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import TimestampPdfSettings from "@editor/components/tools/timestampPdf/TimestampPdfSettings";
import { useTimestampPdfParameters } from "@editor/hooks/tools/timestampPdf/useTimestampPdfParameters";
import { useTimestampPdfOperation } from "@editor/hooks/tools/timestampPdf/useTimestampPdfOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const TimestampPdf = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "timestampPdf",
    useTimestampPdfParameters,
    useTimestampPdfOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("timestampPdf.steps.settings", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        content: (
          <TimestampPdfSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("timestampPdf.submit", "Apply Timestamp"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled:
        !base.params.validateParameters() ||
        !base.hasFiles ||
        !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("timestampPdf.results", "Timestamp Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

TimestampPdf.tool = () => useTimestampPdfOperation;

export default TimestampPdf as ToolComponent;
