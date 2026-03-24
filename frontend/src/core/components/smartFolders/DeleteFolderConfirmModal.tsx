import { Modal, Text, Button, Stack, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SmartFolder } from '@app/types/smartFolders';

interface DeleteFolderConfirmModalProps {
  opened: boolean;
  folder: SmartFolder | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteFolderConfirmModal({ opened, folder, onConfirm, onCancel }: DeleteFolderConfirmModalProps) {
  const { t } = useTranslation();

  if (!folder) return null;

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t('smartFolders.deleteConfirmTitle', 'Delete folder?')}
      centered
      size="sm"
    >
      <Stack gap="md">
        {folder.isDefault && (
          <Text size="sm" c="orange">
            {t('smartFolders.defaultFolderWarning', 'This is a default folder and will be recreated on next reload.')}
          </Text>
        )}
        <Text size="sm">
          {t('smartFolders.deleteConfirmBody', 'This will remove the folder and its run history. Files already downloaded are not affected.')}
        </Text>
        <Group gap="sm" justify="flex-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button color="red" size="sm" onClick={onConfirm}>
            {t('delete', 'Delete')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
