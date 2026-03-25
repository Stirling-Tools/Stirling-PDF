import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Stack, Text, Button, Group, Alert } from '@mantine/core';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useTranslation } from 'react-i18next';

import { alert } from '@app/components/toast';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import type { StirlingFileStub } from '@app/types/fileContext';
import { uploadHistoryChain } from '@app/services/serverStorageUpload';
import { fileStorage } from '@app/services/fileStorage';
import { useFileActions } from '@app/contexts/FileContext';
import type { FileId } from '@app/types/file';

interface UploadToServerModalProps {
  opened: boolean;
  onClose: () => void;
  file: StirlingFileStub;
  onUploaded?: () => Promise<void> | void;
}

const UploadToServerModal: React.FC<UploadToServerModalProps> = ({
  opened,
  onClose,
  file,
  onUploaded,
}) => {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setIsUploading(false);
      setErrorMessage(null);
    }
  }, [opened]);

  const handleUpload = useCallback(async () => {
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const originalFileId = (file.originalFileId || file.id) as FileId;
      const remoteId = file.remoteStorageId;
      const { remoteId: storedId, updatedAt, chain } = await uploadHistoryChain(
        originalFileId,
        remoteId
      );

      for (const stub of chain) {
        actions.updateStirlingFileStub(stub.id, {
          remoteStorageId: storedId,
          remoteStorageUpdatedAt: updatedAt,
          remoteOwnedByCurrentUser: true,
        });
        await fileStorage.updateFileMetadata(stub.id, {
          remoteStorageId: storedId,
          remoteStorageUpdatedAt: updatedAt,
          remoteOwnedByCurrentUser: true,
        });
      }

      alert({
        alertType: 'success',
        title: t('storageUpload.success', 'Uploaded to server'),
        expandable: false,
        durationMs: 3000,
      });
      if (onUploaded) {
        await onUploaded();
      }
      onClose();
    } catch (error) {
      console.error('Failed to upload file to server:', error);
      setErrorMessage(
        t('storageUpload.failure', 'Upload failed. Please check your login and storage settings.')
      );
    } finally {
      setIsUploading(false);
    }
  }, [actions, file, onClose, onUploaded, t]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t('storageUpload.title', 'Upload to Server')}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
    >
      <Stack gap="sm">
        <Text size="sm">
          {t(
            'storageUpload.description',
            'This uploads the current file to server storage for your own access.'
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t('storageUpload.fileLabel', 'File')}: {file.name}
        </Text>
        <Text size="xs" c="dimmed">
          {t(
            'storageUpload.hint',
            'Public links and access modes are controlled by your server settings.'
          )}
        </Text>

        {errorMessage && (
          <Alert color="red" title={t('storageUpload.errorTitle', 'Upload failed')}>
            {errorMessage}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={isUploading}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            leftSection={<CloudUploadIcon style={{ fontSize: 18 }} />}
            onClick={handleUpload}
            loading={isUploading}
          >
            {file.remoteStorageId
              ? t('storageUpload.updateButton', 'Update on Server')
              : t('storageUpload.uploadButton', 'Upload to Server')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default UploadToServerModal;
