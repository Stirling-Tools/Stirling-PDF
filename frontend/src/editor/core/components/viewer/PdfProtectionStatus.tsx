import { useState } from "react";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ProtectedPdfFileCard } from "@editor/components/shared/ProtectedPdfFileCard";
import { PdfPermissionFlag } from "@embedpdf/models";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { useFileActions } from "@editor/contexts/FileContext";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import type { StirlingFile } from "@editor/types/fileContext";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@editor/styles/zIndex";
import { hasPdfPermissionOverride } from "@editor/services/pdfPermissions";

/** Persistent document settings; authentication is requested only when an action needs it. */
export function PdfProtectionStatus({ file }: { file: StirlingFile }) {
  const { t } = useTranslation();
  const access = usePdfAccess(file);
  const { actions: fileActions } = useFileActions();
  const { handleToolSelect } = useToolWorkflowActions();
  const [opened, setOpened] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!access?.encrypted) return null;
  const close = () => {
    setOpened(false);
    setConfirmCopy(false);
    setError(null);
  };
  const permissions = [
    [t("encryptedPdfUnlock.printing", "Printing"), PdfPermissionFlag.Print],
    [
      t("encryptedPdfUnlock.copying", "Copying content"),
      PdfPermissionFlag.CopyContents,
    ],
    [
      t("encryptedPdfUnlock.editing", "Editing"),
      PdfPermissionFlag.ModifyContents,
    ],
    [
      t("encryptedPdfUnlock.annotations", "Annotations"),
      PdfPermissionFlag.ModifyAnnotations,
    ],
  ] as const;
  const createCopy = async () => {
    setOpened(false);
    if (
      !(await fileActions.requestPdfOwnerAccess(
        file.fileId,
        t("encryptedPdfUnlock.removeProtection", "Create an unprotected copy"),
      ))
    ) {
      setOpened(true);
      return;
    }
    setBusy(true);
    try {
      await fileActions.createUnprotectedCopy(file.fileId);
      close();
    } catch {
      setError(
        t(
          "encryptedPdfUnlock.copyFailed",
          "Unable to create the copy. Your PDF is unchanged.",
        ),
      );
      setOpened(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Group justify="space-between" gap="xs" px="sm" py={4}>
        <Group gap={6} role="status">
          <Icon name="lock" size={14} />
          <Text size="xs">
            {access.ownerAuthenticated
              ? t(
                  "encryptedPdfUnlock.permissionsUnlocked",
                  "Permissions unlocked for this session",
                )
              : t("encryptedPdfUnlock.protectedPdf", "Protected PDF")}
          </Text>
        </Group>
        <Button
          size="sm"
          variant="quiet"
          accent="neutral"
          onClick={() => setOpened(true)}
        >
          {t("encryptedPdfUnlock.manageProtection", "Manage protection")}
        </Button>
      </Group>
      <Modal
        opened={opened}
        onClose={close}
        title={t("encryptedPdfUnlock.manageProtection", "Manage protection")}
        centered
        size="sm"
        padding="md"
        radius="md"
        styles={{ body: { paddingTop: "var(--mantine-spacing-md)" } }}
        closeButtonProps={{ "aria-label": t("close", "Close") }}
        zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      >
        <Stack gap="md">
          <ProtectedPdfFileCard fileName={file.name} />
          {confirmCopy ? (
            <>
              <Text size="sm">
                {t(
                  "encryptedPdfUnlock.unprotectedCopyConsequence",
                  "The copy will have no passwords or restrictions. The original stays protected.",
                )}
              </Text>
              {error && (
                <Text role="alert" c="var(--c-danger)" size="sm">
                  {error}
                </Text>
              )}
              <Group justify="flex-end">
                <Button
                  variant="secondary"
                  onClick={() => setConfirmCopy(false)}
                >
                  {t("back", "Back")}
                </Button>
                <Button onClick={() => void createCopy()} loading={busy}>
                  {t(
                    "encryptedPdfUnlock.removeProtection",
                    "Create an unprotected copy",
                  )}
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Group justify="space-between">
                <Text size="sm">
                  {t("encryptedPdfUnlock.openingPassword", "Password to open")}
                </Text>
                <Text size="sm">
                  {access.requiresOpeningPassword === false
                    ? t("encryptedPdfUnlock.notRequired", "Not required")
                    : t("encryptedPdfUnlock.requiredStatus", "Required")}
                </Text>
              </Group>
              {permissions.map(([label, flag]) => {
                const allowed = (access.permissions & flag) !== 0;
                const lowResolutionOnly =
                  allowed &&
                  flag === PdfPermissionFlag.Print &&
                  access.encryptionRevision !== 2 &&
                  !(access.permissions & PdfPermissionFlag.PrintHighQuality);
                return (
                  <Group key={label} justify="space-between">
                    <Text size="sm">{label}</Text>
                    <Group gap={6}>
                      {hasPdfPermissionOverride(access) &&
                        (!allowed || lowResolutionOnly) && (
                          <Tooltip
                            content={
                              access.honorOwnerPasswords === false &&
                              !access.ownerAuthenticated
                                ? t(
                                    "encryptedPdfUnlock.ignoredByServer",
                                    "Permissions are ignored by this server's settings. The PDF's protection is unchanged.",
                                  )
                                : t(
                                    "encryptedPdfUnlock.unlockedForSession",
                                    "Unlocked for this session using your permissions password.",
                                  )
                            }
                            position="top"
                            maxWidth={240}
                            arrow
                            containerStyle={{
                              zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE + 1,
                            }}
                          >
                            <ActionIcon
                              size="sm"
                              variant="quiet"
                              accent="neutral"
                              aria-label={
                                access.honorOwnerPasswords === false &&
                                !access.ownerAuthenticated
                                  ? t(
                                      "encryptedPdfUnlock.actionIgnored",
                                      "{{action}} restriction ignored",
                                      { action: label },
                                    )
                                  : t(
                                      "encryptedPdfUnlock.actionUnlocked",
                                      "{{action}} unlocked for this session",
                                      { action: label },
                                    )
                              }
                            >
                              <Icon name="lock-open" size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      <Text size="sm">
                        {lowResolutionOnly
                          ? t(
                              "encryptedPdfUnlock.lowResolutionOnly",
                              "Low resolution only",
                            )
                          : allowed
                            ? t("encryptedPdfUnlock.allowed", "Allowed")
                            : t("encryptedPdfUnlock.restricted", "Restricted")}
                      </Text>
                    </Group>
                  </Group>
                );
              })}
              {access.signed && (
                <Text size="sm">
                  {t(
                    "encryptedPdfUnlock.signedReadOnly",
                    "This signed PDF can be viewed, but cannot be edited here.",
                  )}
                </Text>
              )}
              {!hasPdfPermissionOverride(access) && (
                <Button
                  onClick={async () => {
                    close();
                    await fileActions.requestPdfOwnerAccess(
                      file.fileId,
                      t(
                        "encryptedPdfUnlock.restrictedActions",
                        "restricted actions",
                      ),
                    );
                  }}
                >
                  {t(
                    "encryptedPdfUnlock.verifyPermissions",
                    "Verify permissions for this session",
                  )}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={access.signed}
                onClick={() => {
                  close();
                  handleToolSelect("changePermissions");
                }}
              >
                {t("changePermissions.submit", "Change Permissions")}
              </Button>
              <Button
                variant="secondary"
                disabled={access.signed}
                onClick={() => {
                  close();
                  handleToolSelect("removePassword");
                }}
              >
                {t("removePassword.title", "Remove Password")}
              </Button>
              <Button
                variant="quiet"
                disabled={access.signed}
                onClick={() => setConfirmCopy(true)}
              >
                {t(
                  "encryptedPdfUnlock.removeProtection",
                  "Create an unprotected copy",
                )}
              </Button>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
