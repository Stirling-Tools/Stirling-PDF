import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { useRemoveBlanksParameters } from "../hooks/tools/removeBlanks/useRemoveBlanksParameters";
import { useRemoveBlanksOperation } from "../hooks/tools/removeBlanks/useRemoveBlanksOperation";
import RemoveBlanksSettings from "../components/tools/removeBlanks/RemoveBlanksSettings";
import { useRemoveBlanksTips } from "../components/tooltips/useRemoveBlanksTips";

const RemoveBlanks = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tooltipContent = useRemoveBlanksTips();

  const base = useBaseTool(
    'remove-blanks',
    useRemoveBlanksParameters,
    useRemoveBlanksOperation,
    props
  );

  const settingsContent = (
    <RemoveBlanksSettings
      parameters={base.params.parameters}
      onParameterChange={base.params.updateParameter}
      disabled={base.endpointLoading}
    />
  );

  const handleSettingsClick = () => {
    if (base.hasResults) {
      base.handleSettingsReset();
    }
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removeBlanks.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: handleSettingsClick,
        content: settingsContent,
        tooltip: tooltipContent,
      },
    ],
    executeButton: {
      text: t("removeBlanks.submit", "Remove blank pages"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeBlanks.results.title", "Removed Blank Pages"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

RemoveBlanks.tool = () => useRemoveBlanksOperation;

export default RemoveBlanks as ToolComponent;


