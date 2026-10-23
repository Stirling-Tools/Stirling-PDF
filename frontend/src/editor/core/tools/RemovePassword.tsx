import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useRemovePasswordParameters } from "@editor/hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "@editor/hooks/tools/removePassword/useRemovePasswordOperation";
import { useRemovePasswordTips } from "@editor/components/tooltips/useRemovePasswordTips";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { PasswordInput, Stack, Text } from "@mantine/core";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import { useFileContext } from "@editor/contexts/FileContext";

const RemovePassword = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const removePasswordTips = useRemovePasswordTips();
  const { actions } = useFileContext();

  const base = useBaseTool(
    "removePassword",
    useRemovePasswordParameters,
    useRemovePasswordOperation,
    props,
  );
  usePdfAccess(base.selectedFiles[0]);
  const openingStates = base.selectedFiles.map((file) => {
    const access = getPdfAccess(file);
    return access?.encrypted === false
      ? false
      : access?.requiresOpeningPassword;
  });
  const openingSet = openingStates.some((set) => set !== false);
  const ownerSet = base.selectedFiles.some(
    (file) => getPdfAccess(file)?.encrypted !== false,
  );
  const passwordDescription = (states: (boolean | undefined)[]) => {
    if (!base.hasFiles) return undefined;
    if (states.some((set) => set === undefined)) return undefined;
    const count = states.filter(Boolean).length;
    if (count === 0) return t("removePassword.notSet", "Not set");
    if (count < base.selectedFiles.length)
      return t(
        "removePassword.appliesTo",
        "Set on {{count}} of {{total}} PDFs",
        {
          count,
          total: base.selectedFiles.length,
        },
      );
    return undefined;
  };
  const { password, ownerPassword } = base.params.parameters;
  const updateParameter = base.params.updateParameter;
  useEffect(() => {
    if (base.hasResults || base.operation.isLoading) return;
    if (!openingSet && password) updateParameter("password", "");
    if (!ownerSet && ownerPassword) updateParameter("ownerPassword", "");
  }, [
    openingSet,
    ownerSet,
    password,
    ownerPassword,
    updateParameter,
    base.hasResults,
    base.operation.isLoading,
  ]);

  const handleExecute = async () => {
    if (password && !ownerPassword) {
      for (const file of base.selectedFiles) {
        const access = getPdfAccess(file);
        if (
          access?.encrypted &&
          access.requiresOpeningPassword !== false &&
          !access.ownerAuthenticated
        ) {
          const verified = await actions.requestPdfOwnerAccess(
            file.fileId,
            t("removePassword.title", "Remove Password"),
            t(
              "encryptedPdfUnlock.retainOwnerVerification",
              "Verify the permissions password to keep it unchanged while removing the opening password. This will not remove it.",
            ),
          );
          if (!verified) return;
        }
      }
    }
    await base.handleExecute();
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removePassword.selectPasswords", "Passwords to remove"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
        tooltip: removePasswordTips,
        content: (
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              {t(
                "removePassword.keepBlank",
                "Leave a field blank to keep that password.",
              )}
            </Text>
            <PasswordInput
              size="xs"
              label={t(
                "encryptedPdfUnlock.openingPassword",
                "Password to open",
              )}
              description={passwordDescription(openingStates)}
              value={openingSet ? password : ""}
              onChange={(event) =>
                updateParameter("password", event.currentTarget.value)
              }
              disabled={!openingSet || base.operation.isLoading}
              autoComplete="off"
            />
            <PasswordInput
              size="xs"
              label={t(
                "encryptedPdfUnlock.ownerPassword",
                "Permissions password",
              )}
              description={
                base.hasFiles && !ownerSet
                  ? t("removePassword.notSet", "Not set")
                  : undefined
              }
              value={ownerSet ? (ownerPassword ?? "") : ""}
              onChange={(event) =>
                updateParameter("ownerPassword", event.currentTarget.value)
              }
              disabled={!ownerSet || base.operation.isLoading}
              autoComplete="off"
            />
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("removePassword.submit", "Remove Password"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: (openingSet && !!password) || (ownerSet && !!ownerPassword),
    },
    review: {
      protectionSummary: null,
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removePassword.results.title", "Updated PDFs"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

RemovePassword.tool = () => useRemovePasswordOperation;

export default RemovePassword as ToolComponent;
