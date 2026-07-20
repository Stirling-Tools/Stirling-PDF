import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import RemovePasswordSettings from "@editor/components/tools/removePassword/RemovePasswordSettings";
import { useRemovePasswordParameters } from "@editor/hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "@editor/hooks/tools/removePassword/useRemovePasswordOperation";
import { useRemovePasswordTips } from "@editor/components/tooltips/useRemovePasswordTips";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const RemovePassword = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const removePasswordTips = useRemovePasswordTips();

  const base = useBaseTool(
    "removePassword",
    useRemovePasswordParameters,
    useRemovePasswordOperation,
    props,
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
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
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
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
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
