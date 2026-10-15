import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useAdjustColorsRustParameters } from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustParameters";
import { useAdjustColorsRustOperation } from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustOperation";
import AdjustContrastBasicSettings from "@app/components/tools/adjustContrast/AdjustContrastBasicSettings";
import AdjustContrastColorSettings from "@app/components/tools/adjustContrast/AdjustContrastColorSettings";
import AdjustContrastPreview from "@app/components/tools/adjustContrast/AdjustContrastPreview";
import AdjustColorsRustProcessingSettings from "@app/components/tools/adjustColorsRust/AdjustColorsRustProcessingSettings";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import NavigationArrows from "@app/components/shared/filePreview/NavigationArrows";

enum Step {
  NONE = "none",
  BASIC = "basic",
  COLORS = "colors",
  PROCESSING = "processing",
}

/**
 * Adjust Colors/Contrast backed by the shared Rust code, beside the TS tool for
 * comparison. The preview is the TS tool's canvas preview; only the output
 * comes from Rust, in the browser or on the server.
 */
const AdjustColorsRust = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "adjustColorsRust",
    useAdjustColorsRustParameters,
    useAdjustColorsRustOperation,
    props,
  );

  const accordion = useAccordionSteps<Step>({
    noneValue: Step.NONE,
    initialStep: Step.BASIC,
    stateConditions: { hasFiles: base.hasFiles, hasResults: base.hasResults },
    afterResults: base.handleSettingsReset,
  });

  const [previewIndex, setPreviewIndex] = useState(0);
  const totalSelected = base.selectedFiles.length;

  useEffect(() => {
    if (previewIndex >= totalSelected) {
      setPreviewIndex(Math.max(0, totalSelected - 1));
    }
  }, [totalSelected, previewIndex]);

  const currentFile = useMemo(
    () => (totalSelected > 0 ? base.selectedFiles[previewIndex] : null),
    [base.selectedFiles, previewIndex, totalSelected],
  );

  const handlePrev = () => setPreviewIndex((i) => Math.max(0, i - 1));
  const handleNext = () =>
    setPreviewIndex((i) => Math.min(totalSelected - 1, i + 1));

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("adjustContrast.basic", "Basic Adjustments"),
        isCollapsed: accordion.getCollapsedState(Step.BASIC),
        onCollapsedClick: () => accordion.handleStepToggle(Step.BASIC),
        content: (
          <AdjustContrastBasicSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("adjustContrast.adjustColors", "Adjust Colors"),
        isCollapsed: accordion.getCollapsedState(Step.COLORS),
        onCollapsedClick: () => accordion.handleStepToggle(Step.COLORS),
        content: (
          <AdjustContrastColorSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("adjustColorsRust.processing", "Processing"),
        isCollapsed: accordion.getCollapsedState(Step.PROCESSING),
        onCollapsedClick: () => accordion.handleStepToggle(Step.PROCESSING),
        content: (
          <AdjustColorsRustProcessingSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    preview: (
      <NavigationArrows
        onPrevious={handlePrev}
        onNext={handleNext}
        disabled={totalSelected <= 1}
      >
        <div style={{ width: "100%" }}>
          <AdjustContrastPreview
            file={currentFile}
            parameters={base.params.parameters}
          />
        </div>
      </NavigationArrows>
    ),
    executeButton: {
      text: t("adjustContrast.confirm", "Confirm"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      paramsValid: true,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("adjustContrast.results.title", "Adjusted PDF"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
    forceStepNumbers: true,
  });
};

export default AdjustColorsRust as ToolComponent;
