import { useState } from "react";
import { Checkbox, Group, Stack, PasswordInput, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import ChangePermissionsSettings from "@editor/components/tools/changePermissions/ChangePermissionsSettings";
import { useChangePermissionsParameters } from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "@editor/hooks/tools/changePermissions/useChangePermissionsOperation";
import { usePermissionExtraction } from "@editor/hooks/tools/changePermissions/usePermissionExtraction";
import { useChangePermissionsTips } from "@editor/components/tooltips/useChangePermissionsTips";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { getPdfAccess } from "@editor/services/pdfAccessService";

const ChangePermissions = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const [replaceOwnerPassword, setReplaceOwnerPassword] = useState(false);
  const changePermissionsTips = useChangePermissionsTips();

  const base = useBaseTool(
    "changePermissions",
    useChangePermissionsParameters,
    useChangePermissionsOperation,
    props,
    {
      skipResetParamsOnFirstFiles: true,
    },
  );

  const permissions = usePermissionExtraction(
    base.selectedFiles.length === 1 ? base.selectedFiles[0] : undefined,
    base.params.setParameters,
    !base.operation.isLoading && !base.hasResults,
  );
  usePdfAccess(base.selectedFiles[0]);
  const protectedInput =
    base.selectedFiles.length > 0 &&
    base.selectedFiles.every((file) => getPdfAccess(file)?.encrypted);
  const ownerVerified =
    protectedInput &&
    base.selectedFiles.every(
      (file) => getPdfAccess(file)?.ownerAuthenticated === true,
    );
  const enforcementOff = base.selectedFiles.every(
    (file) => getPdfAccess(file)?.honorOwnerPasswords === false,
  );
  const showOwnerPassword =
    !protectedInput ||
    replaceOwnerPassword ||
    !!base.params.parameters.ownerPassword;

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
            {protectedInput && (
              <>
                <Group justify="space-between" gap="xs">
                  <Text size="sm">
                    {t(
                      "encryptedPdfUnlock.ownerPassword",
                      "Permissions password",
                    )}
                  </Text>
                  <Text size="xs">
                    {enforcementOff
                      ? t(
                          "encryptedPdfUnlock.passwordRetained",
                          "Kept unchanged",
                        )
                      : ownerVerified
                        ? t(
                            "encryptedPdfUnlock.verifiedForSession",
                            "Verified for this session",
                          )
                        : t(
                            "encryptedPdfUnlock.requiredToApply",
                            "Required to apply changes",
                          )}
                  </Text>
                </Group>
                <Checkbox
                  label={t(
                    "encryptedPdfUnlock.changeOwnerPassword",
                    "Change permissions password",
                  )}
                  checked={showOwnerPassword}
                  onChange={(event) => {
                    setReplaceOwnerPassword(event.currentTarget.checked);
                    if (!event.currentTarget.checked)
                      base.params.updateParameter("ownerPassword", "");
                  }}
                  disabled={base.operation.isLoading}
                />
              </>
            )}
            {showOwnerPassword && (
              <PasswordInput
                size="xs"
                label={t(
                  "encryptedPdfUnlock.newOwnerPassword",
                  "New permissions password",
                )}
                value={base.params.parameters.ownerPassword ?? ""}
                onChange={(e) =>
                  base.params.updateParameter(
                    "ownerPassword",
                    e.currentTarget.value,
                  )
                }
                disabled={base.operation.isLoading}
                required
                autoComplete="new-password"
              />
            )}
            <ChangePermissionsSettings
              parameters={base.params.parameters}
              onParameterChange={base.params.updateParameter}
              disabled={base.endpointLoading || base.operation.isLoading}
              isLoading={permissions.isLoading}
              hasReadError={permissions.hasError}
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
        (!showOwnerPassword || !!base.params.parameters.ownerPassword),
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
