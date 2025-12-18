import { Modal, Text, Group, Button, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface RestartConfirmationModalProps {
  opened: boolean;
  onClose: () => void;
  onRestart: () => void;
}

export default function RestartConfirmationModal({
  opened,
  onClose,
  onRestart,
}: RestartConfirmationModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} size="lg">
          {t('admin.settings.restart.title', 'Restart Required')}
        </Text>
      }
      centered
      size="md"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      withinPortal
    >
      <Stack gap="lg">
        <Text size="sm">
          {t(
            'admin.settings.restart.message',
            'Settings have been saved successfully. A server restart is required for the changes to take effect.'
          )}
        </Text>

        <Text size="sm" c="dimmed">
          {t(
            'admin.settings.restart.question',
            'Would you like to restart the server now or later?'
          )}
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            leftSection={<LocalIcon icon="schedule-rounded" width={16} height={16} />}
            onClick={onClose}
          >
            {t('admin.settings.restart.later', 'Restart Later')}
          </Button>
          <Button
            color="blue"
            leftSection={<LocalIcon icon="refresh-rounded" width={16} height={16} />}
            onClick={onRestart}
          >
            {t('admin.settings.restart.now', 'Restart Now')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
