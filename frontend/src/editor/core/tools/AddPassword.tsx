import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useViewScopedFiles } from "@app/hooks/tools/shared/useViewScopedFiles";

import { createToolFlow } from "@app/components/tools/shared/createToolFlow";

import AddPasswordSettings from "@app/components/tools/addPassword/AddPasswordSettings";
import ChangePermissionsSettings from "@app/components/tools/changePermissions/ChangePermissionsSettings";

import {
  useAddPasswordParameters,
  validateAddPasswordParameters,
} from "@app/hooks/tools/addPassword/useAddPasswordParameters";
import { useAddPasswordOperation } from "@app/hooks/tools/addPassword/useAddPasswordOperation";
import { usePermissionExtraction } from "@app/hooks/tools/changePermissions/usePermissionExtraction";
import { useAddPasswordTips } from "@app/components/tooltips/useAddPasswordTips";
import { useAddPasswordPermissionsTips } from "@app/components/tooltips/useAddPasswordPermissionsTips";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { Stack, PasswordInput, Text } from "@mantine/core";
import { usePdfAccess } from "@app/hooks/usePdfAccess";

const AddPassword = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const selectedFiles = useViewScopedFiles();
  const access = usePdfAccess(selectedFiles[0]);

  const [collapsedPermissions, setCollapsedPermissions] = useState(true);

  const addPasswordParams = useAddPasswordParameters();
  const addPasswordOperation = useAddPasswordOperation();
  const addPasswordTips = useAddPasswordTips();
  const addPasswordPermissionsTips = useAddPasswordPermissionsTips();
  const hasResults =
    addPasswordOperation.files.length > 0 ||
    addPasswordOperation.downloadUrl !== null;
  const permissions = usePermissionExtraction(
    selectedFiles.length === 1 ? selectedFiles[0] : undefined,
    addPasswordParams.permissions.setParameters,
    !addPasswordOperation.isLoading && !hasResults,
  );
  const hasRestrictions = Object.entries(
    addPasswordParams.permissions.parameters,
  ).some(([key, value]) => key.startsWith("prevent") && value === true);
  const outputParameters = {
    ...addPasswordParams.fullParameters,
    ownerPassword: hasRestrictions
      ? addPasswordParams.parameters.ownerPassword
      : "",
  };

  useEffect(() => {
    if (permissions.hasError || hasRestrictions) setCollapsedPermissions(false);
  }, [permissions.hasError, hasRestrictions]);

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } =
    useEndpointEnabled(addPasswordParams.getEndpointName());

  useEffect(() => {
    addPasswordOperation.resetResults();
    onPreviewFile?.(null);
  }, [addPasswordParams.parameters, addPasswordParams.permissions.parameters]);

  const handleAddPassword = async () => {
    try {
      await addPasswordOperation.executeOperation(
        outputParameters,
        selectedFiles,
      );
      if (addPasswordOperation.files && onComplete) {
        onComplete(addPasswordOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(
          error instanceof Error
            ? error.message
            : t("addPassword.error.failed", "Add password operation failed"),
        );
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "addPassword");
  };

  const handleSettingsReset = () => {
    addPasswordOperation.resetResults();
    onPreviewFile?.(null);
  };

  const handleUndo = async () => {
    await addPasswordOperation.undoOperation();
    onPreviewFile?.(null);
  };

  const hasFiles = selectedFiles.length > 0;
  const passwordsCollapsed = !hasFiles || hasResults;
  const permissionsCollapsed = collapsedPermissions || hasResults;

  return createToolFlow({
    files: {
      selectedFiles:
        addPasswordOperation.getEligibleFiles?.(
          outputParameters,
          selectedFiles,
        ) ?? selectedFiles,
      isCollapsed: hasResults,
    },
    steps: [
      {
        title: t("encryptedPdfUnlock.openingPassword", "Password to open"),
        isCollapsed: passwordsCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : undefined,
        tooltip: addPasswordTips,
        content: (
          <Stack gap="sm">
            {access?.encrypted && (
              <Text size="xs">
                {t(
                  "encryptedPdfUnlock.replaceProtection",
                  "These settings replace the PDF's current protection.",
                )}
              </Text>
            )}
            <AddPasswordSettings
              parameters={addPasswordParams.parameters}
              onParameterChange={addPasswordParams.updateParameter}
              disabled={endpointLoading}
              showOwnerPassword={false}
            />
          </Stack>
        ),
      },
      {
        title: t("encryptedPdfUnlock.restrictActions", "Restrict actions"),
        isCollapsed: permissionsCollapsed,
        onCollapsedClick: hasResults
          ? handleSettingsReset
          : () => setCollapsedPermissions(!collapsedPermissions),
        content: (
          <Stack gap="sm">
            <ChangePermissionsSettings
              parameters={addPasswordParams.permissions.parameters}
              onParameterChange={addPasswordParams.permissions.updateParameter}
              disabled={endpointLoading || addPasswordOperation.isLoading}
              isLoading={permissions.isLoading}
              hasReadError={permissions.hasError}
            />
            {hasRestrictions && (
              <PasswordInput
                size="xs"
                label={t(
                  "encryptedPdfUnlock.newOwnerPassword",
                  "New permissions password",
                )}
                value={addPasswordParams.parameters.ownerPassword}
                onChange={(event) =>
                  addPasswordParams.updateParameter(
                    "ownerPassword",
                    event.currentTarget.value,
                  )
                }
                error={
                  addPasswordParams.parameters.ownerPassword &&
                  addPasswordParams.parameters.ownerPassword ===
                    addPasswordParams.parameters.password
                    ? t(
                        "encryptedPdfUnlock.passwordsMustDiffer",
                        "The two passwords must be different.",
                      )
                    : undefined
                }
                required
                autoComplete="new-password"
                disabled={addPasswordOperation.isLoading}
              />
            )}
          </Stack>
        ),
        tooltip: addPasswordPermissionsTips,
      },
    ],
    executeButton: {
      text: t("encryptedPdfUnlock.saveProtection", "Save protection"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleAddPassword,
      endpointEnabled: endpointEnabled,
      paramsValid: validateAddPasswordParameters(outputParameters),
      disabled: permissions.isLoading,
    },
    review: {
      protectionSummary: t(
        "encryptedPdfUnlock.protectionSaved",
        "Protection saved",
      ),
      isVisible: hasResults,
      operation: addPasswordOperation,
      title: t("addPassword.results.title", "Encrypted PDFs"),
      onFileClick: handleThumbnailClick,
      onUndo: handleUndo,
    },
  });
};

export default AddPassword as ToolComponent;
