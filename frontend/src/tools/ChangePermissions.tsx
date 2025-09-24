import React from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import ChangePermissionsSettings from "../components/tools/changePermissions/ChangePermissionsSettings";
import { useChangePermissionsParameters } from "../hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "../hooks/tools/changePermissions/useChangePermissionsOperation";
import { useChangePermissionsTips } from "../components/tooltips/useChangePermissionsTips";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const ChangePermissions = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const changePermissionsTips = useChangePermissionsTips();

  const base = useBaseTool(
    'changePermissions',
    useChangePermissionsParameters,
    useChangePermissionsOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("changePermissions.title", "Document Permissions"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: changePermissionsTips,
        content: (
          <ChangePermissionsSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("changePermissions.submit", "Change Permissions"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("changePermissions.results.title", "Modified PDFs"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
ChangePermissions.tool = () => useChangePermissionsOperation;

export default ChangePermissions as ToolComponent;
