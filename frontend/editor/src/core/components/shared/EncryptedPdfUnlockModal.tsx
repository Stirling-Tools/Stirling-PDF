import { Modal, Stack, Text, PasswordInput, Group } from "@mantine/core";
import { Tooltip } from "@app/components/shared/Tooltip";
import { ProtectedPdfFileCard } from "@app/components/shared/ProtectedPdfFileCard";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

interface EncryptedPdfUnlockModalProps {
  opened: boolean;
  fileName?: string;
  password: string;
  errorMessage?: string | null;
  isProcessing: boolean;
  remainingCount?: number;
  confirmLabel?: string;
  sessionUnlock?: boolean;
  ownerUnlock?: boolean;
  actionLabel?: string;
  preservationReason?: string;
  testIdPrefix?: string;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onUnlockAll?: () => void;
  onSkip: () => void;
}

/** Authentication only; changing a document's protection belongs in its protection settings. */
const EncryptedPdfUnlockModal = ({
  opened,
  fileName,
  password,
  errorMessage,
  isProcessing,
  remainingCount = 0,
  confirmLabel,
  sessionUnlock = false,
  ownerUnlock = false,
  actionLabel,
  preservationReason,
  testIdPrefix,
  onPasswordChange,
  onUnlock,
  onUnlockAll,
  onSkip,
}: EncryptedPdfUnlockModalProps) => {
  const { t } = useTranslation();
  const title = ownerUnlock
    ? t("encryptedPdfUnlock.ownerTitle", "Enter permissions password")
    : sessionUnlock
      ? t("encryptedPdfUnlock.sessionTitle", "Open PDF")
      : t("encryptedPdfUnlock.title", "Enter PDF password");
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!isProcessing) onSkip();
      }}
      title={
        <Group component="span" gap={6} wrap="nowrap">
          <span>{title}</span>
          {sessionUnlock && !ownerUnlock && (
            <Tooltip
              content={t(
                "encryptedPdfUnlock.sessionDetails",
                "Open for this session. The PDF stays protected.",
              )}
              position="top"
              maxWidth={280}
              arrow
              containerStyle={{ zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE + 1 }}
            >
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                aria-label={t(
                  "encryptedPdfUnlock.sessionDetailsLabel",
                  "About session unlocking",
                )}
              >
                <Icon name="info" size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      }
      centered
      size="sm"
      padding="md"
      radius="md"
      styles={{ body: { paddingTop: "var(--mantine-spacing-md)" } }}
      withCloseButton={!isProcessing}
      closeOnClickOutside={!isProcessing}
      closeOnEscape={!isProcessing}
      closeButtonProps={{ "aria-label": t("close", "Close") }}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      data-testid={testIdPrefix ? `${testIdPrefix}-modal` : undefined}
    >
      <Stack gap="md">
        <ProtectedPdfFileCard fileName={fileName} />
        {(preservationReason || actionLabel) && (
          <Text size="sm">
            {preservationReason ||
              t(
                "encryptedPdfUnlock.authoriseAction",
                "This PDF requires permission to use {{action}}.",
                { action: actionLabel },
              )}
          </Text>
        )}
        <PasswordInput
          label={
            ownerUnlock
              ? t("encryptedPdfUnlock.ownerPassword", "Permissions password")
              : sessionUnlock
                ? t("encryptedPdfUnlock.openingPassword", "Password to open")
                : t("encryptedPdfUnlock.password.label", "PDF password")
          }
          placeholder={
            !sessionUnlock
              ? t(
                  "encryptedPdfUnlock.password.placeholder",
                  "Enter the PDF password",
                )
              : undefined
          }
          value={password}
          onChange={(event) => onPasswordChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isProcessing && password.length > 0) {
              event.preventDefault();
              onUnlock();
            }
          }}
          disabled={isProcessing}
          size="md"
          radius="md"
          error={errorMessage || undefined}
          errorProps={{ role: "alert" }}
          autoFocus
          data-autofocus
          data-testid={testIdPrefix ? `${testIdPrefix}-input` : undefined}
        />
        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            accent="neutral"
            onClick={onSkip}
            disabled={isProcessing}
            data-testid={testIdPrefix ? `${testIdPrefix}-cancel` : undefined}
          >
            {t("cancel", "Cancel")}
          </Button>
          {remainingCount > 0 && onUnlockAll && (
            <Button
              variant="secondary"
              onClick={onUnlockAll}
              loading={isProcessing}
              disabled={!password}
            >
              {t("encryptedPdfUnlock.unlockAll", "Use for all ({{count}})", {
                count: remainingCount + 1,
              })}
            </Button>
          )}
          <Button
            onClick={onUnlock}
            loading={isProcessing}
            disabled={!password}
            data-testid={testIdPrefix ? `${testIdPrefix}-submit` : undefined}
          >
            {confirmLabel ??
              (ownerUnlock
                ? t("encryptedPdfUnlock.continue", "Continue")
                : t("encryptedPdfUnlock.openPdf", "Open PDF"))}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default EncryptedPdfUnlockModal;
