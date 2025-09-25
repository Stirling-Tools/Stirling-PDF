import React from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import RemovePasswordSettings from "../components/tools/removePassword/RemovePasswordSettings";
import { useRemovePasswordParameters } from "../hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "../hooks/tools/removePassword/useRemovePasswordOperation";
import { useRemovePasswordTips } from "../components/tooltips/useRemovePasswordTips";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

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
