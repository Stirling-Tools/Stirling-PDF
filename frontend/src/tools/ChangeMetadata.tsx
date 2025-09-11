import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import ChangeMetadataSettings from "../components/tools/changeMetadata/ChangeMetadataSettings";
import { useChangeMetadataParameters } from "../hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useChangeMetadataOperation } from "../hooks/tools/changeMetadata/useChangeMetadataOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useChangeMetadataTips } from "../components/tooltips/useChangeMetadataTips";

const ChangeMetadata = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const changeMetadataTips = useChangeMetadataTips();

  const base = useBaseTool(
    'changeMetadata',
    useChangeMetadataParameters,
    useChangeMetadataOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("changeMetadata.settings.title", "Metadata Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: changeMetadataTips,
        content: (
          <ChangeMetadataSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            addCustomMetadata={base.params.addCustomMetadata}
            removeCustomMetadata={base.params.removeCustomMetadata}
            updateCustomMetadata={base.params.updateCustomMetadata}
          />
        ),
      },
    ],
    executeButton: {
      text: t("changeMetadata.submit", "Update Metadata"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("changeMetadata.results.title", "Updated PDFs"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ChangeMetadata as ToolComponent;
