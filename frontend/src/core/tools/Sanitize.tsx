import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import SanitizeSettings from "@app/components/tools/sanitize/SanitizeSettings";
import { useSanitizeParameters } from "@app/hooks/tools/sanitize/useSanitizeParameters";
import { useSanitizeOperation } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const Sanitize = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'sanitize',
    useSanitizeParameters,
    useSanitizeOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("sanitize.steps.settings", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <SanitizeSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("sanitize.submit", "Sanitize PDF"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("sanitize.sanitizationResults", "Sanitization Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
Sanitize.tool = () => useSanitizeOperation;

export default Sanitize as ToolComponent;
