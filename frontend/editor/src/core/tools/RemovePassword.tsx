import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useRemovePasswordParameters } from "@app/hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "@app/hooks/tools/removePassword/useRemovePasswordOperation";
import { useRemovePasswordTips } from "@app/components/tooltips/useRemovePasswordTips";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { PasswordInput, Stack, Text } from "@mantine/core";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import { getPdfAccess } from "@app/services/pdfPasswordStore";

const RemovePassword = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const removePasswordTips = useRemovePasswordTips();

  const base = useBaseTool(
    "removePassword",
    useRemovePasswordParameters,
    useRemovePasswordOperation,
    props,
  );
  usePdfAccess(base.selectedFiles[0]);
  const needsNewOwnerPassword = base.selectedFiles.some((file) => {
    const access = getPdfAccess(file);
    return (
      access?.encrypted &&
      access.honorOwnerPasswords === false &&
      !access.ownerAuthenticated
    );
  });
  const nothingToRemove =
    base.selectedFiles.length > 0 &&
    base.selectedFiles.every((file) => {
      const access = getPdfAccess(file);
      return (
        access &&
        (!access.encrypted || access.requiresOpeningPassword === false)
      );
    });

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("encryptedPdfUnlock.removeOpening", "Remove opening password"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
        tooltip: removePasswordTips,
        content: (
          <Stack gap="sm">
            <Text size="sm">
              {nothingToRemove
                ? t(
                    "encryptedPdfUnlock.noOpeningPassword",
                    "This PDF already opens without a password.",
                  )
                : t(
                    "encryptedPdfUnlock.removeOpeningConsequence",
                    "Removes the opening password. Restrictions remain.",
                  )}
            </Text>
            {!nothingToRemove && needsNewOwnerPassword && (
              <PasswordInput
                size="xs"
                label={t(
                  "encryptedPdfUnlock.newOwnerPassword",
                  "New permissions password",
                )}
                description={t(
                  "encryptedPdfUnlock.replaceUnknownOwner",
                  "Choose a new password to replace the existing permissions password.",
                )}
                value={base.params.parameters.newOwnerPassword ?? ""}
                onChange={(event) =>
                  base.params.updateParameter(
                    "newOwnerPassword",
                    event.currentTarget.value,
                  )
                }
                disabled={base.operation.isLoading}
                required
              />
            )}
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("encryptedPdfUnlock.removeOpening", "Remove opening password"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid:
        !nothingToRemove &&
        (!needsNewOwnerPassword || !!base.params.parameters.newOwnerPassword),
    },
    review: {
      protectionSummary: t(
        "encryptedPdfUnlock.openingPasswordRemoved",
        "Opening password removed. Restrictions retained.",
      ),
      isVisible: base.hasResults,
      operation: base.operation,
      title: t(
        "removePassword.results.title",
        "PDFs without an opening password",
      ),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
RemovePassword.tool = () => useRemovePasswordOperation;

export default RemovePassword as ToolComponent;
