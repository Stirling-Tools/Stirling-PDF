import {
  Modal,
  Stack,
  Text,
  PasswordInput,
  Group,
  Tooltip,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { type KeyboardEventHandler } from "react";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

interface EncryptedPdfUnlockModalProps {
  opened: boolean;
  fileName?: string;
  password: string;
  errorMessage?: string | null;
  isProcessing: boolean;
  /** How many other locked files are queued behind this one. Omit where there is only ever one. */
  remainingCount?: number;
  /** Confirm wording, where the caller's own reads better than the default. */
  confirmLabel?: string;
  /** Session unlocking preserves the original; notification retries may instead remove protection. */
  sessionUnlock?: boolean;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  /** Only needed alongside a non-zero {@link EncryptedPdfUnlockModalProps.remainingCount}. */
  onUnlockAll?: () => void;
  onSkip: () => void;
}

const EncryptedPdfUnlockModal = ({
  opened,
  fileName,
  password,
  errorMessage,
  isProcessing,
  remainingCount = 0,
  confirmLabel,
  sessionUnlock = false,
  onPasswordChange,
  onUnlock,
  onUnlockAll,
  onSkip,
}: EncryptedPdfUnlockModalProps) => {
  const { t } = useTranslation();

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter" && !isProcessing && password.length > 0) {
      onUnlock();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!isProcessing) onSkip();
      }}
      title={
        sessionUnlock
          ? t("encryptedPdfUnlock.sessionTitle", "Unlock PDF")
          : t("encryptedPdfUnlock.title", "Remove password to continue")
      }
      centered
      size="md"
      closeOnClickOutside={!isProcessing}
      closeOnEscape={!isProcessing}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
    >
      <Stack gap="md">
        <Group
          gap="sm"
          wrap="nowrap"
          p="sm"
          style={{
            background: "var(--c-surface-raised)",
            borderRadius: "var(--mantine-radius-md)",
          }}
        >
          <Icon
            name="lock"
            size={20}
            style={{ color: "var(--c-text-muted)", flexShrink: 0 }}
          />
          <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
            {fileName}
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap" align="flex-start">
          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
            {sessionUnlock
              ? t(
                  "encryptedPdfUnlock.sessionDescription",
                  "Unlock for this session. The original stays protected.",
                )
              : t(
                  "encryptedPdfUnlock.description",
                  "Enter the password to continue working with this PDF.",
                )}
          </Text>
          {sessionUnlock && (
            <Tooltip
              label={t(
                "encryptedPdfUnlock.sessionDetails",
                "Access ends when you close the file or leave the session. Supported tools keep PDF results protected; merged PDFs use the first protected file's settings. Cancel keeps the saved copy in your library. Use Remove Password to create an unprotected copy.",
              )}
              multiline
              w={280}
              withArrow
              events={{ hover: true, focus: true, touch: true }}
              zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE + 1}
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

        <Stack gap={4}>
          <PasswordInput
            label={t("encryptedPdfUnlock.password.label", "PDF password")}
            placeholder={t(
              "encryptedPdfUnlock.password.placeholder",
              "Enter the PDF password",
            )}
            value={password}
            onChange={(event) => onPasswordChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            autoFocus
          />
          {errorMessage ? (
            <Text c="var(--color-red-dark)" size="sm" role="alert">
              {errorMessage}
            </Text>
          ) : null}
        </Stack>

        <Group justify="space-between">
          <Button
            variant="secondary"
            accent="neutral"
            onClick={onSkip}
            disabled={isProcessing}
          >
            {sessionUnlock
              ? t("encryptedPdfUnlock.cancelOpen", "Cancel opening")
              : t("encryptedPdfUnlock.skip", "Skip for now")}
          </Button>
          <Group gap="xs">
            {remainingCount > 0 && onUnlockAll && (
              <Button
                variant="secondary"
                onClick={onUnlockAll}
                loading={isProcessing}
                disabled={password.length === 0}
              >
                {t("encryptedPdfUnlock.unlockAll", "Use for all ({{count}})", {
                  count: remainingCount + 1,
                })}
              </Button>
            )}
            <Button
              onClick={onUnlock}
              loading={isProcessing}
              disabled={password.length === 0}
            >
              {confirmLabel ??
                t("encryptedPdfUnlock.unlock", "Unlock & Continue")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default EncryptedPdfUnlockModal;
