import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ReplaceColorSettings from "@app/components/tools/replaceColor/ReplaceColorSettings";
import { useReplaceColorParameters } from "@app/hooks/tools/replaceColor/useReplaceColorParameters";
import { useReplaceColorOperation } from "@app/hooks/tools/replaceColor/useReplaceColorOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useReplaceColorTips } from "@app/components/tooltips/useReplaceColorTips";

const ReplaceColor = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const replaceColorTips = useReplaceColorTips();

  const base = useBaseTool(
    'replaceColor',
    useReplaceColorParameters,
    useReplaceColorOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("replaceColor.labels.settings", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: replaceColorTips,
        content: (
          <ReplaceColorSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("replace-color.submit", "Replace"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("replace-color.title", "Replace-Invert-Color"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ReplaceColor as ToolComponent;