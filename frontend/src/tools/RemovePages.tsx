import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { useRemovePagesParameters } from "../hooks/tools/removePages/useRemovePagesParameters";
import { useRemovePagesOperation } from "../hooks/tools/removePages/useRemovePagesOperation";
import RemovePagesSettings from "../components/tools/removePages/RemovePagesSettings";
import { useRemovePagesTips } from "../components/tooltips/useRemovePagesTips";

const RemovePages = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tooltipContent = useRemovePagesTips();

  const base = useBaseTool(
    'remove-pages',
    useRemovePagesParameters,
    useRemovePagesOperation,
    props
  );


  const settingsContent = (
    <RemovePagesSettings
      parameters={base.params.parameters}
      onParameterChange={base.params.updateParameter}
      disabled={base.endpointLoading}
    />
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removePages.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: settingsContent,
        tooltip: tooltipContent,
      },
    ],
    executeButton: {
      text: t("removePages.submit", "Remove Pages"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removePages.results.title", "Pages Removed"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

RemovePages.tool = () => useRemovePagesOperation;

export default RemovePages as ToolComponent;
