import { useState } from "react";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { ProtectedPdfFileCard } from "@editor/components/shared/ProtectedPdfFileCard";
import { PdfPermissionFlag } from "@embedpdf/models";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { useFileActions } from "@editor/contexts/FileContext";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { useRightsManagedPdf } from "@editor/hooks/useRightsManagedPdf";
import type { StirlingFile } from "@editor/types/fileContext";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@editor/styles/zIndex";
import { hasPdfPermissionOverride } from "@editor/services/pdfPermissions";
import {
  ProtectionIndicator,
  type ProtectionRight,
  type ProtectionSummary,
} from "@editor/components/viewer/protection/ProtectionIndicator";

/** Persistent document settings; authentication is requested only when an action needs it. */
export function PdfProtectionStatus({ file }: { file: StirlingFile }) {
  const { t } = useTranslation();
  const access = usePdfAccess(file);
  const { actions: fileActions } = useFileActions();
  const { handleToolSelect } = useToolWorkflowActions();
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rightsManaged = useRightsManagedPdf(file);
  if (!access?.encrypted || rightsManaged.status === "opened") return null;
  const close = () => {
    setOpened(false);
    setError(null);
  };
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
  const unlocked = access.ownerAuthenticated;
  const overrideTooltip =
    access.honorOwnerPasswords === false && !access.ownerAuthenticated
      ? t(
          "encryptedPdfUnlock.ignoredByServer",
          "Permissions are ignored by this server's settings. The PDF's protection is unchanged.",
        )
      : t(
          "encryptedPdfUnlock.unlockedForSession",
          "Unlocked for this session using your permissions password.",
        );
  const rights: ProtectionRight[] = (
    [
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
    ] as const
  ).map(([name, flag]) => {
    const allowed = (access.permissions & flag) !== 0;
    const lowResolutionOnly =
      allowed &&
      flag === PdfPermissionFlag.Print &&
      access.encryptionRevision !== 2 &&
      !(access.permissions & PdfPermissionFlag.PrintHighQuality);
    const overridden =
      hasPdfPermissionOverride(access) && (!allowed || lowResolutionOnly);
    return {
      name,
      allowed,
      value: lowResolutionOnly
        ? t("encryptedPdfUnlock.lowResolutionOnly", "Low resolution only")
        : undefined,
      override: overridden
        ? {
            tooltip: overrideTooltip,
            label:
              access.honorOwnerPasswords === false && !access.ownerAuthenticated
                ? t(
                    "encryptedPdfUnlock.actionIgnored",
                    "{{action}} restriction ignored",
                    { action: name },
                  )
                : t(
                    "encryptedPdfUnlock.actionUnlocked",
                    "{{action}} unlocked for this session",
                    { action: name },
                  ),
          }
        : undefined,
    };
  });
  const restrictedCount = rights.filter(
    (right) => !right.allowed && !right.override,
  ).length;
  const summaryModel: ProtectionSummary = {
    fileName: file.name,
    icon: unlocked ? "lock-open" : "lock",
    iconColor: unlocked ? "var(--c-success)" : "var(--c-text-muted)",
    title: t("encryptedPdfUnlock.protectedPdf", "Protected PDF"),
    summary: unlocked
      ? t(
          "encryptedPdfUnlock.permissionsUnlocked",
          "Permissions unlocked for this session",
        )
      : restrictedCount === 0
        ? t("protection.fullAccess", "Full access")
        : restrictedCount === rights.length
          ? t("protection.viewOnly", "View only")
          : t("protection.limitedAccess", "Limited access"),
    source: t("protection.sourcePassword", "PDF password"),
    rights,
    facts: [
      {
        label: t("encryptedPdfUnlock.openingPassword", "Password to open"),
        value:
          access.requiresOpeningPassword === false
            ? t("encryptedPdfUnlock.notRequired", "Not required")
            : t("encryptedPdfUnlock.requiredStatus", "Required"),
      },
    ],
    actions: [
      ...(hasPdfPermissionOverride(access)
        ? []
        : [
            {
              label: t(
                "encryptedPdfUnlock.verifyPermissions",
                "Verify permissions for this session",
              ),
              onClick: () =>
                void fileActions.requestPdfOwnerAccess(
                  file.fileId,
                  t(
                    "encryptedPdfUnlock.restrictedActions",
                    "restricted actions",
                  ),
                ),
            },
          ]),
      {
        label: t("changePermissions.submit", "Change Permissions"),
        disabled: access.signed,
        onClick: () => handleToolSelect("changePermissions"),
      },
      {
        label: t("removePassword.title", "Remove Password"),
        disabled: access.signed,
        onClick: () => handleToolSelect("removePassword"),
      },
      {
        label: t(
          "encryptedPdfUnlock.removeProtection",
          "Create an unprotected copy",
        ),
        disabled: access.signed,
        onClick: () => {
          setOpened(true);
        },
      },
    ],
  };
  return (
    <>
      <ProtectionIndicator protection={summaryModel} />
      <Modal
        opened={opened}
        onClose={close}
        title={t(
          "encryptedPdfUnlock.removeProtection",
          "Create an unprotected copy",
        )}
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
            <Button variant="secondary" onClick={close}>
              {t("cancel", "Cancel")}
            </Button>
            <Button onClick={() => void createCopy()} loading={busy}>
              {t(
                "encryptedPdfUnlock.removeProtection",
                "Create an unprotected copy",
              )}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
