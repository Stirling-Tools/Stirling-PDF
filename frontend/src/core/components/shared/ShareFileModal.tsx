import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Stack, Text, Button, Group, Alert, TextInput, Paper, Select } from '@mantine/core';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { useTranslation } from 'react-i18next';

import apiClient from '@app/services/apiClient';
import { absoluteWithBasePath } from '@app/constants/app';
import { alert } from '@app/components/toast';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import type { StirlingFileStub } from '@app/types/fileContext';
import { uploadHistoryChain } from '@app/services/serverStorageUpload';
import { fileStorage } from '@app/services/fileStorage';
import { useFileActions } from '@app/contexts/FileContext';
import type { FileId } from '@app/types/file';

interface ShareFileModalProps {
  opened: boolean;
  onClose: () => void;
  file: StirlingFileStub;
  onUploaded?: () => Promise<void> | void;
}

const ShareFileModal: React.FC<ShareFileModalProps> = ({
  opened,
  onClose,
  file,
  onUploaded,
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { actions } = useFileActions();
  const shareLinksEnabled = config?.storageShareLinksEnabled === true;
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareRole, setShareRole] = useState<'editor' | 'commenter' | 'viewer'>('editor');

  useEffect(() => {
    if (!opened) {
      setIsWorking(false);
      setErrorMessage(null);
      setShareToken(null);
    }
  }, [opened]);

  useEffect(() => {
    if (opened) {
      setShareRole('editor');
    }
  }, [opened]);

  const shareUrl = useMemo(() => {
    if (!shareToken) return '';
    const frontendUrl = (config?.frontendUrl || '').trim();
    if (frontendUrl) {
      const normalized = frontendUrl.endsWith('/')
        ? frontendUrl.slice(0, -1)
        : frontendUrl;
      return `${normalized}/share/${shareToken}`;
    }
    return absoluteWithBasePath(`/share/${shareToken}`);
  }, [config?.frontendUrl, shareToken]);

  const createShareLink = useCallback(async (storedFileId: number) => {
    const response = await apiClient.post(`/api/v1/storage/files/${storedFileId}/shares/links`, {
      accessRole: shareRole,
    });
    return response.data as { token?: string };
  }, [shareRole]);

  const handleGenerateLink = useCallback(async () => {
    if (!shareLinksEnabled) {
      alert({
        alertType: 'warning',
        title: t('storageShare.linksDisabled', 'Share links are disabled.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    setIsWorking(true);
    setErrorMessage(null);
    setShareToken(null);

    try {
      const localUpdatedAt = file.createdAt ?? file.lastModified ?? 0;
      const isUpToDate =
        Boolean(file.remoteStorageId) &&
        Boolean(file.remoteStorageUpdatedAt) &&
        (file.remoteStorageUpdatedAt as number) >= localUpdatedAt;

      let storedId = file.remoteStorageId;

      if (!isUpToDate) {
        const originalFileId = (file.originalFileId || file.id) as FileId;
        const remoteId = file.remoteStorageId;
        const { remoteId: newStoredId, updatedAt, chain } = await uploadHistoryChain(
          originalFileId,
          remoteId
        );
        storedId = newStoredId;

        for (const stub of chain) {
          actions.updateStirlingFileStub(stub.id, {
            remoteStorageId: newStoredId,
            remoteStorageUpdatedAt: updatedAt,
            remoteOwnedByCurrentUser: true,
            remoteHasShareLinks: true,
          });
          await fileStorage.updateFileMetadata(stub.id, {
            remoteStorageId: newStoredId,
            remoteStorageUpdatedAt: updatedAt,
            remoteOwnedByCurrentUser: true,
            remoteHasShareLinks: true,
          });
        }
      }

      if (!storedId) {
        throw new Error('Missing stored file ID for sharing.');
      }
      const shareResponse = await createShareLink(storedId);
      setShareToken(shareResponse.token ?? null);

      alert({
        alertType: 'success',
        title: t('storageShare.generated', 'Share link generated'),
        expandable: false,
        durationMs: 3000,
      });
      if (storedId) {
        actions.updateStirlingFileStub(file.id, { remoteHasShareLinks: true });
        await fileStorage.updateFileMetadata(file.id, { remoteHasShareLinks: true });
      }
      if (onUploaded) {
        await onUploaded();
      }
    } catch (error: any) {
      console.error('Failed to generate share link:', error);
      setErrorMessage(
        t('storageShare.failure', 'Unable to generate a share link. Please try again.')
      );
    } finally {
      setIsWorking(false);
    }
  }, [actions, createShareLink, file, onUploaded, shareLinksEnabled, t]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert({
        alertType: 'success',
        title: t('storageShare.copied', 'Link copied to clipboard'),
        expandable: false,
        durationMs: 2000,
      });
    } catch (error) {
      console.error('Failed to copy share link:', error);
      alert({
        alertType: 'warning',
        title: t('storageShare.copyFailed', 'Copy failed'),
        expandable: false,
        durationMs: 2500,
      });
    }
  }, [shareUrl, t]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t('storageShare.title', 'Share File')}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      size="lg"
      overlayProps={{ blur: 6 }}
    >
      <Stack gap="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap={4}>
            <Text size="sm">
              {t(
                'storageShare.description',
                'Create a share link for this file. Signed-in users with the link can access it.'
              )}
            </Text>
            <Text size="sm" c="dimmed">
              {t('storageShare.fileLabel', 'File')}: {file.name}
            </Text>
          </Stack>
        </Paper>

        {errorMessage && (
          <Alert color="red" title={t('storageShare.errorTitle', 'Share failed')}>
            {errorMessage}
          </Alert>
        )}
        {!shareLinksEnabled && (
          <Alert color="yellow" title={t('storageShare.linksDisabled', 'Share links are disabled.')}>
            {t('storageShare.linksDisabledBody', 'Share links are disabled by your server settings.')}
          </Alert>
        )}

        {shareUrl && (
          <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
              <TextInput
                readOnly
                value={shareUrl}
                label={t('storageShare.linkLabel', 'Share link')}
                rightSection={
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<ContentCopyRoundedIcon style={{ fontSize: 16 }} />}
                    onClick={handleCopyLink}
                  >
                    {t('storageShare.copy', 'Copy')}
                  </Button>
                }
              />
            </Stack>
          </Paper>
        )}

        <Paper withBorder radius="md" p="md">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('storageShare.linkAccessTitle', 'Share link access')}
            </Text>
            <Select
              label={t('storageShare.roleLabel', 'Role')}
              value={shareRole}
              onChange={(value) => setShareRole((value as typeof shareRole) || 'editor')}
              comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_FILE_MANAGER_MODAL + 10 }}
              data={[
                { value: 'editor', label: t('storageShare.roleEditor', 'Editor') },
                { value: 'commenter', label: t('storageShare.roleCommenter', 'Commenter') },
                { value: 'viewer', label: t('storageShare.roleViewer', 'Viewer') },
              ]}
            />
            {shareRole === 'commenter' && (
              <Text size="xs" c="dimmed">
                {t('storageShare.commenterHint', 'Commenting is coming soon.')}
              </Text>
            )}
          </Stack>
        </Paper>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={isWorking}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            leftSection={<LinkIcon style={{ fontSize: 18 }} />}
            onClick={handleGenerateLink}
            loading={isWorking}
            disabled={!shareLinksEnabled}
          >
            {t('storageShare.generate', 'Generate Link')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ShareFileModal;
