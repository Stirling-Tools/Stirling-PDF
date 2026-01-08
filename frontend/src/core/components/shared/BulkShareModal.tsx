import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Stack, Text, Button, Group, Alert, TextInput } from '@mantine/core';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { useTranslation } from 'react-i18next';

import apiClient from '@app/services/apiClient';
import { absoluteWithBasePath } from '@app/constants/app';
import { alert } from '@app/components/toast';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import type { StirlingFileStub } from '@app/types/fileContext';
import { uploadHistoryChains } from '@app/services/serverStorageUpload';
import { fileStorage } from '@app/services/fileStorage';
import { useFileActions } from '@app/contexts/FileContext';
import type { FileId } from '@app/types/file';

interface BulkShareModalProps {
  opened: boolean;
  onClose: () => void;
  files: StirlingFileStub[];
  onShared?: () => Promise<void> | void;
}

const BulkShareModal: React.FC<BulkShareModalProps> = ({
  opened,
  onClose,
  files,
  onShared,
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { actions } = useFileActions();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [publicLink, setPublicLink] = useState<boolean | null>(null);

  useEffect(() => {
    if (!opened) {
      setIsWorking(false);
      setErrorMessage(null);
      setShareToken(null);
      setPublicLink(null);
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

  const createShareLink = useCallback(async (storedFileId: number, makePublic: boolean) => {
    const response = await apiClient.post(`/api/v1/storage/files/${storedFileId}/shares/links`, {
      publicLink: makePublic,
    });
    return response.data as { token?: string; publicLink?: boolean };
  }, []);

  const handleGenerateLink = useCallback(async () => {
    setIsWorking(true);
    setErrorMessage(null);
    setShareToken(null);
    setPublicLink(null);

    try {
      const rootIds = Array.from(
        new Set(files.map((file) => (file.originalFileId || file.id) as FileId))
      );
      const remoteIds = Array.from(
        new Set(files.map((file) => file.remoteStorageId).filter(Boolean) as number[])
      );
      const existingRemoteId =
        rootIds.length === 1 && remoteIds.length === 1 ? remoteIds[0] : undefined;

      const { remoteId: storedId, updatedAt, chain } = await uploadHistoryChains(
        rootIds,
        existingRemoteId
      );

      try {
        const shareResponse = await createShareLink(storedId, true);
        setShareToken(shareResponse.token ?? null);
        setPublicLink(Boolean(shareResponse.publicLink));
      } catch (error: any) {
        const status = error?.response?.status as number | undefined;
        if (status === 400) {
          const shareResponse = await createShareLink(storedId, false);
          setShareToken(shareResponse.token ?? null);
          setPublicLink(Boolean(shareResponse.publicLink));
        } else {
          throw error;
        }
      }

      for (const stub of chain) {
        actions.updateStirlingFileStub(stub.id, {
          remoteStorageId: storedId,
          remoteStorageUpdatedAt: updatedAt,
          remoteOwnedByCurrentUser: true,
          remoteSharedViaLink: false,
          remoteHasShareLinks: true,
        });
        await fileStorage.updateFileMetadata(stub.id, {
          remoteStorageId: storedId,
          remoteStorageUpdatedAt: updatedAt,
          remoteOwnedByCurrentUser: true,
          remoteSharedViaLink: false,
          remoteHasShareLinks: true,
        });
      }

      alert({
        alertType: 'success',
        title: t('storageShare.generated', 'Share link generated'),
        expandable: false,
        durationMs: 3000,
      });
      if (onShared) {
        await onShared();
      }
    } catch (error) {
      console.error('Failed to generate share link:', error);
      setErrorMessage(
        t('storageShare.failure', 'Unable to generate a share link. Please try again.')
      );
    } finally {
      setIsWorking(false);
    }
  }, [actions, createShareLink, files, onShared, t]);

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
      title={t('storageShare.bulkTitle', 'Share selected files')}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
    >
      <Stack gap="sm">
        <Text size="sm">
          {t(
            'storageShare.bulkDescription',
            'Create one link to share all selected files.'
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t('storageShare.fileCount', '{{count}} files selected', {
            count: files.length,
          })}
        </Text>

        {errorMessage && (
          <Alert color="red" title={t('storageShare.errorTitle', 'Share failed')}>
            {errorMessage}
          </Alert>
        )}

        {shareUrl && (
          <>
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
            {publicLink === false && (
              <Text size="xs" c="dimmed">
                {t('storageShare.requiresLogin', 'This link requires login to access.')}
              </Text>
            )}
          </>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={isWorking}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            leftSection={<LinkIcon style={{ fontSize: 18 }} />}
            onClick={handleGenerateLink}
            loading={isWorking}
          >
            {t('storageShare.generate', 'Generate Link')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default BulkShareModal;
