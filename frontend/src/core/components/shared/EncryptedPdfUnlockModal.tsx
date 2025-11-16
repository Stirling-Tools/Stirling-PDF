import { Modal, Stack, Text, Button, PasswordInput, Group } from '@mantine/core';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useTranslation } from 'react-i18next';
import { type KeyboardEventHandler } from 'react';

interface EncryptedPdfUnlockModalProps {
  opened: boolean;
  fileName?: string;
  password: string;
  errorMessage?: string | null;
  isProcessing: boolean;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onSkip: () => void;
}

const ICON_STYLE = {
  fontSize: 40,
  color: 'var(--mantine-color-blue-7)'
};

const EncryptedPdfUnlockModal = ({
  opened,
  fileName,
  password,
  errorMessage,
  isProcessing,
  onPasswordChange,
  onUnlock,
  onSkip,
}: EncryptedPdfUnlockModalProps) => {
  const { t } = useTranslation();

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter' && !isProcessing && password.trim().length > 0) {
      onUnlock();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onSkip}
      title={t('encryptedPdfUnlock.title', 'Remove password to continue?')}
      centered
      size="md"
      closeOnClickOutside={!isProcessing}
      closeOnEscape={!isProcessing}
    >
      <Stack gap="md">
        <Stack gap={4} ta="center">
          <LockResetIcon style={ICON_STYLE} />
          <Text fw={600}>{fileName}</Text>
          <Text c="dimmed">
            {t(
              'encryptedPdfUnlock.description',
              'This PDF is password protected. We can automatically run the Remove Password tool so you can continue using other tools.'
            )}
          </Text>
        </Stack>

        <Stack gap={4}>
          <PasswordInput
            label={t('removePassword.password.label', 'Current Password')}
            placeholder={t('removePassword.password.placeholder', 'Enter current password')}
            value={password}
            onChange={(event) => onPasswordChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            autoFocus
          />
          {errorMessage ? (
            <Text c="red" size="sm">
              {errorMessage}
            </Text>
          ) : null}
          <Text size="xs" c="dimmed">
            {t(
              'encryptedPdfUnlock.historyInfo',
              'The unlocked file will appear in your file history as if the Remove Password tool was run.'
            )}
          </Text>
        </Stack>

        <Group justify="space-between">
          <Button variant="light" color="var(--mantine-color-gray-8)" onClick={onSkip} disabled={isProcessing}>
            {t('encryptedPdfUnlock.skip', 'Skip for now')}
          </Button>
          <Button onClick={onUnlock} loading={isProcessing} disabled={password.trim().length === 0}>
            {t('encryptedPdfUnlock.unlock', 'Unlock & Continue')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default EncryptedPdfUnlockModal;
