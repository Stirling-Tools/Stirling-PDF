import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useInsertBlankPagesParameters } from "@app/hooks/tools/insertBlankPages/useInsertBlankPagesParameters";
import { useInsertBlankPagesOperation } from "@app/hooks/tools/insertBlankPages/useInsertBlankPagesOperation";
import InsertBlankPagesSettings from "@app/components/tools/insertBlankPages/InsertBlankPagesSettings";
import useInsertBlankPagesTips from "@app/components/tooltips/useInsertBlankPagesTips";

const InsertBlankPages = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tooltipContent = useInsertBlankPagesTips();

  const base = useBaseTool(
    "insert-blank-pages",
    useInsertBlankPagesParameters,
    useInsertBlankPagesOperation,
    props,
  );

  const settingsContent = (
    <InsertBlankPagesSettings
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
        title: t("insertBlankPages.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        content: settingsContent,
        tooltip: tooltipContent,
      },
    ],
    executeButton: {
      text: t("insertBlankPages.submit", "Insert Blank Pages"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("insertBlankPages.results.title", "Blank Pages Inserted"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default InsertBlankPages as ToolComponent;
