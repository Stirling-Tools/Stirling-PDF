import { Stack, PasswordInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ChangePermissionsSettings from "@app/components/tools/changePermissions/ChangePermissionsSettings";
import { useChangePermissionsParameters } from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "@app/hooks/tools/changePermissions/useChangePermissionsOperation";
import { usePermissionExtraction } from "@app/hooks/tools/changePermissions/usePermissionExtraction";
import { useChangePermissionsTips } from "@app/components/tooltips/useChangePermissionsTips";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import { getPdfAccess } from "@app/services/pdfPasswordStore";

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
  usePdfAccess(base.selectedFiles[0]);
  const protectedInput =
    base.selectedFiles.length > 0 &&
    base.selectedFiles.every((file) => getPdfAccess(file)?.encrypted === true);
  const needsOpeningPassword = base.selectedFiles.some((file) => {
    const access = getPdfAccess(file);
    return access?.encrypted && access.requiresOpeningPassword !== false;
  });

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
          <Stack>
            {needsOpeningPassword && (
              <PasswordInput
                label={t(
                  "encryptedPdfUnlock.resultOpeningPassword",
                  "Password to open the updated PDF",
                )}
                description={t(
                  "encryptedPdfUnlock.replaceOpeningHint",
                  "Enter the current opening password to keep it, or choose a new one.",
                )}
                value={base.params.parameters.password ?? ""}
                onChange={(e) =>
                  base.params.updateParameter("password", e.currentTarget.value)
                }
                disabled={base.operation.isLoading}
                required
              />
            )}
            <PasswordInput
              label={t(
                "encryptedPdfUnlock.newOwnerPassword",
                "New permissions password",
              )}
              description={
                protectedInput
                  ? t(
                      "encryptedPdfUnlock.keepOwnerHint",
                      "Leave blank to keep the existing permissions password.",
                    )
                  : t(
                      "encryptedPdfUnlock.newOwnerHint",
                      "Required to change these restrictions later.",
                    )
              }
              value={base.params.parameters.ownerPassword ?? ""}
              onChange={(e) =>
                base.params.updateParameter(
                  "ownerPassword",
                  e.currentTarget.value,
                )
              }
              disabled={base.operation.isLoading}
            />
            <ChangePermissionsSettings
              parameters={base.params.parameters}
              onParameterChange={base.params.updateParameter}
              disabled={base.endpointLoading || base.operation.isLoading}
              isLoading={permissions.isLoading}
              hasReadError={permissions.hasError}
              multipleFiles={base.selectedFiles.length > 1}
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
      paramsValid:
        base.params.validateParameters() &&
        (protectedInput || !!base.params.parameters.ownerPassword) &&
        (!needsOpeningPassword || !!base.params.parameters.password),
      disabled: permissions.isLoading,
    },
    review: {
      protectionSummary: t(
        "encryptedPdfUnlock.protectionSaved",
        "Protection saved",
      ),
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
