import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import ChangePermissionsSettings from "@editor/components/tools/changePermissions/ChangePermissionsSettings";
import { useChangePermissionsParameters } from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "@editor/hooks/tools/changePermissions/useChangePermissionsOperation";
import { useChangePermissionsTips } from "@editor/components/tooltips/useChangePermissionsTips";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const ChangePermissions = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const changePermissionsTips = useChangePermissionsTips();

  const base = useBaseTool(
    "changePermissions",
    useChangePermissionsParameters,
    useChangePermissionsOperation,
    props,
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
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
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
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
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
