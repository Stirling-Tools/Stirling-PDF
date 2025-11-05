import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useExtractPagesParameters } from "@app/hooks/tools/extractPages/useExtractPagesParameters";
import { useExtractPagesOperation } from "@app/hooks/tools/extractPages/useExtractPagesOperation";
import ExtractPagesSettings from "@app/components/tools/extractPages/ExtractPagesSettings";
import useExtractPagesTips from "@app/components/tooltips/useExtractPagesTips";

const ExtractPages = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tooltipContent = useExtractPagesTips();

  const base = useBaseTool(
    'extract-pages',
    useExtractPagesParameters,
    useExtractPagesOperation,
    props
  );

  const settingsContent = (
    <ExtractPagesSettings
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
        title: t("extractPages.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: settingsContent,
        tooltip: tooltipContent,
      },
    ],
    executeButton: {
      text: t("extractPages.submit", "Extract Pages"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("extractPages.results.title", "Pages Extracted"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ExtractPages as ToolComponent;


