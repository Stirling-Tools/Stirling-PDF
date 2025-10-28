import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CropSettings from "@app/components/tools/crop/CropSettings";
import { useCropParameters } from "@app/hooks/tools/crop/useCropParameters";
import { useCropOperation } from "@app/hooks/tools/crop/useCropOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useCropTooltips } from "@app/components/tooltips/useCropTooltips";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const Crop = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'crop',
    useCropParameters,
    useCropOperation,
    props
  );

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
        onCollapsedClick: base.hasResults ? base.handleSettingsReset : undefined,
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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
