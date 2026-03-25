import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Stack, Text, Button, Group, Alert } from '@mantine/core';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useTranslation } from 'react-i18next';

import { alert } from '@app/components/toast';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import type { StirlingFileStub } from '@app/types/fileContext';
import { uploadHistoryChains } from '@app/services/serverStorageUpload';
import { fileStorage } from '@app/services/fileStorage';
import { useFileActions } from '@app/contexts/FileContext';
import type { FileId } from '@app/types/file';

interface BulkUploadToServerModalProps {
  opened: boolean;
  onClose: () => void;
  files: StirlingFileStub[];
  onUploaded?: () => Promise<void> | void;
}

const BulkUploadToServerModal: React.FC<BulkUploadToServerModalProps> = ({
  opened,
  onClose,
  files,
  onUploaded,
}) => {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileNames = useMemo(() => files.map((file) => file.name), [files]);
  const displayNames = useMemo(() => fileNames.slice(0, 3), [fileNames]);

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
      const rootIds = Array.from(
        new Set(files.map((file) => (file.originalFileId || file.id) as FileId))
      );
      const remoteIds = Array.from(
        new Set(files.map((file) => file.remoteStorageId).filter(Boolean) as number[])
      );
      const existingRemoteId = remoteIds.length === 1 ? remoteIds[0] : undefined;

      const { remoteId, updatedAt, chain } = await uploadHistoryChains(
        rootIds,
        existingRemoteId
      );

      for (const stub of chain) {
        actions.updateStirlingFileStub(stub.id, {
          remoteStorageId: remoteId,
          remoteStorageUpdatedAt: updatedAt,
          remoteOwnedByCurrentUser: true,
          remoteSharedViaLink: false,
        });
        await fileStorage.updateFileMetadata(stub.id, {
          remoteStorageId: remoteId,
          remoteStorageUpdatedAt: updatedAt,
          remoteOwnedByCurrentUser: true,
          remoteSharedViaLink: false,
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
      console.error('Failed to upload files to server:', error);
      setErrorMessage(
        t('storageUpload.failure', 'Upload failed. Please check your login and storage settings.')
      );
    } finally {
      setIsUploading(false);
    }
  }, [actions, files, onClose, onUploaded, t]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t('storageUpload.bulkTitle', 'Upload selected files')}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
    >
      <Stack gap="sm">
        <Text size="sm">
          {t(
            'storageUpload.bulkDescription',
            'This uploads the selected files to your server storage.'
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t('storageUpload.fileCount', '{{count}} files selected', {
            count: files.length,
          })}
        </Text>
        {displayNames.length > 0 && (
          <Text size="xs" c="dimmed">
            {displayNames.join(', ')}
            {fileNames.length > displayNames.length
              ? t('storageUpload.more', ' +{{count}} more', {
                  count: fileNames.length - displayNames.length,
                })
              : ''}
          </Text>
        )}

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
            {t('storageUpload.uploadButton', 'Upload to Server')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default BulkUploadToServerModal;
