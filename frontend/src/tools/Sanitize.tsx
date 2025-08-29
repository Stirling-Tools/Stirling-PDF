import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import SanitizeSettings from "../components/tools/sanitize/SanitizeSettings";
import { useSanitizeParameters } from "../hooks/tools/sanitize/useSanitizeParameters";
import { useSanitizeOperation } from "../hooks/tools/sanitize/useSanitizeOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

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
      placeholder: t("sanitize.files.placeholder", "Select a PDF file in the main view to get started"),
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
    },
  });
};

// Static method to get the operation hook for automation
Sanitize.tool = () => useSanitizeOperation;

export default Sanitize as ToolComponent;
