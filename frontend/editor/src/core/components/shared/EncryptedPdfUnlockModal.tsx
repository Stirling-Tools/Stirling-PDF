import {
  Modal,
  Stack,
  Text,
  PasswordInput,
  Group,
  Tooltip,
  Menu,
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
  testIdPrefix?: string;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  /** Creates an unprotected copy using the entered password, without changing the original. */
  onRemovePassword?: () => void;
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
  testIdPrefix,
  onPasswordChange,
  onUnlock,
  onRemovePassword,
  onUnlockAll,
  onSkip,
}: EncryptedPdfUnlockModalProps) => {
  const { t } = useTranslation();

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter" && !isProcessing && password.length > 0) {
      event.preventDefault();
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
        <Group component="span" gap={6} wrap="nowrap">
          <span>
            {sessionUnlock
              ? t("encryptedPdfUnlock.sessionTitle", "Unlock PDF")
              : t("encryptedPdfUnlock.title", "Remove password to continue")}
          </span>
          {sessionUnlock && (
            <Tooltip
              label={t(
                "encryptedPdfUnlock.sessionDetails",
                "Access ends when you close the file or leave the session. Supported tools keep PDF results protected; merged PDFs use the first protected file's settings. Closing this dialog keeps the saved copy in your library. Use Remove Password to create an unprotected copy.",
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
      }
      centered
      size="sm"
      padding="md"
      radius="md"
      styles={{ body: { paddingTop: "var(--mantine-spacing-md)" } }}
      withCloseButton={!isProcessing}
      closeButtonProps={{
        "aria-label": t("close", "Close"),
      }}
      data-testid={testIdPrefix ? `${testIdPrefix}-modal` : undefined}
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
          <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
            {fileName}
          </Text>
        </Group>
        {!sessionUnlock && (
          <Text size="sm" c="dimmed">
            {t(
              "encryptedPdfUnlock.passwordHint",
              "Enter the PDF password to continue.",
            )}
          </Text>
        )}

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
          size="md"
          radius="md"
          error={errorMessage || undefined}
          errorProps={{ role: "alert" }}
          autoFocus
          data-autofocus
          data-testid={testIdPrefix ? `${testIdPrefix}-input` : undefined}
        />

        <Group justify="flex-end" gap="sm">
          {!sessionUnlock && (
            <Button
              variant="secondary"
              accent="neutral"
              onClick={onSkip}
              disabled={isProcessing}
              data-testid={testIdPrefix ? `${testIdPrefix}-cancel` : undefined}
            >
              {t("encryptedPdfUnlock.skip", "Skip for now")}
            </Button>
          )}
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
            <Button.Group>
              <Button
                onClick={onUnlock}
                loading={isProcessing}
                disabled={password.length === 0}
                data-testid={
                  testIdPrefix ? `${testIdPrefix}-submit` : undefined
                }
              >
                {confirmLabel ?? t("encryptedPdfUnlock.unlock", "Unlock")}
              </Button>
              {sessionUnlock && onRemovePassword && (
                <Menu
                  position="bottom-end"
                  withinPortal
                  zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE + 1}
                >
                  <Menu.Target>
                    <Button
                      disabled={isProcessing}
                      px="xs"
                      aria-label={t(
                        "encryptedPdfUnlock.moreOptions",
                        "More options",
                      )}
                      style={{ borderInlineStartColor: "var(--c-border)" }}
                    >
                      <Icon name="chevron-down" size={16} />
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<Icon name="lock-open" size={16} />}
                      disabled={isProcessing || password.length === 0}
                      onClick={onRemovePassword}
                    >
                      <Text size="sm">
                        {t("removePassword.submit", "Remove Password")}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t(
                          "encryptedPdfUnlock.createCopy",
                          "Create an unprotected copy",
                        )}
                      </Text>
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </Button.Group>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default EncryptedPdfUnlockModal;
