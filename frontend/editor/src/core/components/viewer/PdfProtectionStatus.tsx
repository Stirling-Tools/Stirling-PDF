import { useState } from "react";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { PdfPermissionFlag } from "@embedpdf/models";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useFileActions } from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import type { StirlingFile } from "@app/types/fileContext";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

/** Persistent document settings; authentication is requested only when an action needs it. */
export function PdfProtectionStatus({ file }: { file: StirlingFile }) {
  const { t } = useTranslation();
  const access = usePdfAccess(file);
  const { actions: fileActions } = useFileActions();
  const { actions: navigation } = useNavigationActions();
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
        zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      >
        <Stack gap="md">
          <Text fw={500} size="sm" style={{ overflowWrap: "anywhere" }}>
            {file.name}
          </Text>
          {access.ownerAuthenticated && (
            <Text size="sm">
              {t(
                "encryptedPdfUnlock.verifiedPasswordInUse",
                "Using the permissions password verified for this session.",
              )}
            </Text>
          )}
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
              <Text size="sm" fw={500}>
                {t(
                  "encryptedPdfUnlock.recipientRestrictions",
                  "Restrictions for recipients",
                )}
              </Text>
              {permissions.map(([label, flag]) => (
                <Group key={label} justify="space-between">
                  <Text size="sm">{label}</Text>
                  <Text size="sm">
                    {access.permissions & flag
                      ? flag === PdfPermissionFlag.Print &&
                        access.encryptionRevision !== 2 &&
                        !(
                          access.permissions &
                          PdfPermissionFlag.PrintHighQuality
                        )
                        ? t(
                            "encryptedPdfUnlock.lowResolutionOnly",
                            "Low resolution only",
                          )
                        : t("encryptedPdfUnlock.allowed", "Allowed")
                      : t("encryptedPdfUnlock.restricted", "Restricted")}
                  </Text>
                </Group>
              ))}
              {access.signed && (
                <Text size="sm">
                  {t(
                    "encryptedPdfUnlock.signedReadOnly",
                    "This signed PDF can be viewed, but cannot be edited here.",
                  )}
                </Text>
              )}
              {!access.ownerAuthenticated && (
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
                  navigation.handleToolSelect("changePermissions");
                }}
              >
                {t("changePermissions.submit", "Change Permissions")}
              </Button>
              <Button
                variant="secondary"
                disabled={
                  access.signed || access.requiresOpeningPassword === false
                }
                onClick={() => {
                  close();
                  navigation.handleToolSelect("removePassword");
                }}
              >
                {t(
                  "encryptedPdfUnlock.removeOpening",
                  "Remove opening password",
                )}
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
