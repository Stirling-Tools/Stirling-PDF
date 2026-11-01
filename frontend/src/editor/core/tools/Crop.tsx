import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import CropSettings from "@editor/components/tools/crop/CropSettings";
import { useCropParameters } from "@editor/hooks/tools/crop/useCropParameters";
import { useCropOperation } from "@editor/hooks/tools/crop/useCropOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useCropTooltips } from "@editor/components/tooltips/useCropTooltips";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const Crop = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool("crop", useCropParameters, useCropOperation, props);

  const tooltips = useCropTooltips();

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: 1,
    },
    steps: [
      {
        title: t("crop.steps.selectArea", "Select Crop Area"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
        tooltip: tooltips,
        content: (
          <CropSettings
            parameters={base.params}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("crop.submit", "Apply Crop"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("crop.results.title", "Crop Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Crop as ToolComponent;
