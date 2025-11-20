import { Modal, Stack, Text, Button, PasswordInput, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { type KeyboardEventHandler } from 'react';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';

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
      title={t('encryptedPdfUnlock.title', 'Remove password to continue')}
      centered
      size="md"
      closeOnClickOutside={!isProcessing}
      closeOnEscape={!isProcessing}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
    >
      <Stack gap="md">
        <Text fw={600} ta="center">{fileName}</Text>
        <Text c="dimmed" ta="center">
          {t(
            'encryptedPdfUnlock.description',
            'This PDF is password protected. Enter the password so you can continue working with it.'
          )}
        </Text>

        <Stack gap={4}>
          <PasswordInput
            label={t('encryptedPdfUnlock.password.label', 'PDF password')}
            placeholder={t('encryptedPdfUnlock.password.placeholder', 'Enter the PDF password')}
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
