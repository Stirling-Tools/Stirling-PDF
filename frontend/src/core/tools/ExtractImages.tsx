import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ExtractImagesSettings from "@app/components/tools/extractImages/ExtractImagesSettings";
import { useExtractImagesParameters } from "@app/hooks/tools/extractImages/useExtractImagesParameters";
import { useExtractImagesOperation } from "@app/hooks/tools/extractImages/useExtractImagesOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const ExtractImages = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'extractImages',
    useExtractImagesParameters,
    useExtractImagesOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("extractImages.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <ExtractImagesSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("extractImages.submit", "Extract Images"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("extractImages.title", "Extracted Images"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ExtractImages as ToolComponent;