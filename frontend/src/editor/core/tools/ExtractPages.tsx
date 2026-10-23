import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useExtractPagesParameters } from "@editor/hooks/tools/extractPages/useExtractPagesParameters";
import { useExtractPagesOperation } from "@editor/hooks/tools/extractPages/useExtractPagesOperation";
import ExtractPagesSettings from "@editor/components/tools/extractPages/ExtractPagesSettings";
import useExtractPagesTips from "@editor/components/tooltips/useExtractPagesTips";

const ExtractPages = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tooltipContent = useExtractPagesTips();

  const base = useBaseTool(
    "extract-pages",
    useExtractPagesParameters,
    useExtractPagesOperation,
    props,
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
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        content: settingsContent,
        tooltip: tooltipContent,
      },
    ],
    executeButton: {
      text: t("extractPages.submit", "Extract Pages"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
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
