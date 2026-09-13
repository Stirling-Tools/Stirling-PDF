import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useAutoFormDetectionParameters } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";
import { useAutoFormDetectionOperation } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import {
  DetectionSummary,
  onSummary,
} from "@app/services/formDetection/progress";
import AutoFormDetectionSettings from "@app/components/tools/autoFormDetection/AutoFormDetectionSettings";
import DetectionProgressPanel from "@app/components/tools/autoFormDetection/DetectionProgressPanel";
import DetectionSummaryPanel from "@app/components/tools/autoFormDetection/DetectionSummaryPanel";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const AutoFormDetection = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "autoFormDetection",
    useAutoFormDetectionParameters,
    useAutoFormDetectionOperation,
    props,
  );

  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  useEffect(() => onSummary(setSummary), []);
  useEffect(() => {
    if (!base.hasResults) setSummary(null);
  }, [base.hasResults]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasFiles || base.hasResults,
    },
    steps: [
      {
        title: t("autoFormDetection.settings.title", "Settings"),
        isCollapsed: !base.hasFiles || base.hasResults,
        isVisible: !base.hasResults,
        content: (
          <AutoFormDetectionSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.operation.isLoading}
          />
        ),
      },
      {
        title: t("autoFormDetection.summary.stepTitle", "Detection results"),
        isVisible: base.hasResults && summary !== null,
        isCollapsed: false,
        content: summary ? <DetectionSummaryPanel summary={summary} /> : null,
      },
    ],
    executeButton: {
      text: t("autoFormDetection.submit", "Detect form fields"),
      isVisible: !base.hasResults,
      loadingText: t("autoFormDetection.loading", "Detecting form fields..."),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    belowExecuteButton: (
      <DetectionProgressPanel active={base.operation.isLoading} />
    ),
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("autoFormDetection.results.title", "Review fillable PDF"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

AutoFormDetection.tool = () => useAutoFormDetectionOperation;

export default AutoFormDetection as ToolComponent;
