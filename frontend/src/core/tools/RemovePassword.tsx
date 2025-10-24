import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RemovePasswordSettings from "@app/components/tools/removePassword/RemovePasswordSettings";
import { useRemovePasswordParameters } from "@app/hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "@app/hooks/tools/removePassword/useRemovePasswordOperation";
import { useRemovePasswordTips } from "@app/components/tooltips/useRemovePasswordTips";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const RemovePassword = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const removePasswordTips = useRemovePasswordTips();

  const base = useBaseTool(
    'removePassword',
    useRemovePasswordParameters,
    useRemovePasswordOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removePassword.password.stepTitle", "Remove Password"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.hasResults ? base.handleSettingsReset : undefined,
        tooltip: removePasswordTips,
        content: (
          <RemovePasswordSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("removePassword.submit", "Remove Password"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removePassword.results.title", "Decrypted PDFs"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
RemovePassword.tool = () => useRemovePasswordOperation;

export default RemovePassword as ToolComponent;
