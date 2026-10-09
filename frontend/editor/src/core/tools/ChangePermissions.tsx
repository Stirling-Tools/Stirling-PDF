import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mantine/core";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ChangePermissionsSettings from "@app/components/tools/changePermissions/ChangePermissionsSettings";
import { useChangePermissionsParameters } from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "@app/hooks/tools/changePermissions/useChangePermissionsOperation";
import { usePermissionExtraction } from "@app/hooks/tools/changePermissions/usePermissionExtraction";
import { useChangePermissionsTips } from "@app/components/tooltips/useChangePermissionsTips";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const ChangePermissions = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const changePermissionsTips = useChangePermissionsTips();

  const base = useBaseTool(
    "changePermissions",
    useChangePermissionsParameters,
    useChangePermissionsOperation,
    props,
    { skipResetParamsOnFirstFiles: true },
  );

  const permissions = usePermissionExtraction(
    base.selectedFiles.length === 1 ? base.selectedFiles[0] : undefined,
    base.params.setParameters,
    !base.operation.isLoading && !base.hasResults,
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
          <Stack gap="sm">
            {base.selectedFiles.length > 1 && (
              <Text size="sm">
                {t(
                  "changePermissions.multipleFiles",
                  "Select a single PDF to automatically load its current permissions. These settings will apply to all selected PDFs.",
                )}
              </Text>
            )}
            {permissions.isLoading && (
              <Text size="sm" role="status">
                {t("changePermissions.loading", "Loading current permissions…")}
              </Text>
            )}
            {permissions.hasError && (
              <Text size="sm" role="alert">
                {t(
                  "changePermissions.error.readFailed",
                  "Could not read this PDF's current permissions. Set the restrictions manually before applying changes.",
                )}
              </Text>
            )}
            <ChangePermissionsSettings
              parameters={base.params.parameters}
              onParameterChange={base.params.updateParameter}
              disabled={
                base.endpointLoading ||
                permissions.isLoading ||
                base.operation.isLoading
              }
            />
          </Stack>
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
      disabled: permissions.isLoading,
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
