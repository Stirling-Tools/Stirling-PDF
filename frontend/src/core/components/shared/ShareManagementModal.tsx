import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Stack, Text, Button, Group, Alert, TextInput, Divider, Badge } from '@mantine/core';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import LinkIcon from '@mui/icons-material/Link';
import { useTranslation } from 'react-i18next';

import apiClient from '@app/services/apiClient';
import { absoluteWithBasePath } from '@app/constants/app';
import { alert } from '@app/components/toast';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import type { StirlingFileStub } from '@app/types/fileContext';
import { fileStorage } from '@app/services/fileStorage';
import { useFileActions } from '@app/contexts/FileContext';

interface ShareLinkResponse {
  token: string;
  publicLink?: boolean;
  createdAt?: string;
}

interface ShareLinkAccessResponse {
  username?: string | null;
  accessType?: string | null;
  accessedAt?: string | null;
}

interface StoredFileResponse {
  shareLinks?: ShareLinkResponse[];
  ownedByCurrentUser?: boolean;
}

interface ShareManagementModalProps {
  opened: boolean;
  onClose: () => void;
  file: StirlingFileStub;
}

const ShareManagementModal: React.FC<ShareManagementModalProps> = ({
  opened,
  onClose,
  file,
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { actions } = useFileActions();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLinkResponse[]>([]);
  const [activityMap, setActivityMap] = useState<Record<string, ShareLinkAccessResponse[]>>({});

  const shareBaseUrl = useMemo(() => {
    const frontendUrl = (config?.frontendUrl || '').trim();
    if (frontendUrl) {
      const normalized = frontendUrl.endsWith('/')
        ? frontendUrl.slice(0, -1)
        : frontendUrl;
      return `${normalized}/share/`;
    }
    return absoluteWithBasePath('/share/');
  }, [config?.frontendUrl]);

  const loadShareLinks = useCallback(async () => {
    if (!file.remoteStorageId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.get<StoredFileResponse>(
        `/api/v1/storage/files/${file.remoteStorageId}`,
        { suppressErrorToast: true } as any
      );
      const links = response.data?.shareLinks ?? [];
      setShareLinks(links);
    } catch (error) {
      console.error('Failed to load share links:', error);
      setErrorMessage(
        t('storageShare.manageLoadFailed', 'Unable to load share links.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [actions, file.remoteStorageId, t]);

  useEffect(() => {
    if (opened) {
      loadShareLinks();
      setActivityMap({});
    }
  }, [opened, loadShareLinks]);

  const createShareLink = useCallback(
    async (makePublic: boolean) => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await apiClient.post(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/links`,
          { publicLink: makePublic }
        );
        const token = response.data?.token as string | undefined;
        const publicLink = response.data?.publicLink as boolean | undefined;
        if (token) {
          setShareLinks((prev) => [
            ...prev,
            {
              token,
              publicLink,
              createdAt: new Date().toISOString(),
            },
          ]);
          actions.updateStirlingFileStub(file.id, { remoteHasShareLinks: true });
          await fileStorage.updateFileMetadata(file.id, { remoteHasShareLinks: true });
          alert({
            alertType: 'success',
            title: t('storageShare.generated', 'Share link generated'),
            expandable: false,
            durationMs: 2500,
          });
        }
      } catch (error: any) {
        const status = error?.response?.status as number | undefined;
        if (status === 400 && makePublic) {
          try {
            const response = await apiClient.post(
              `/api/v1/storage/files/${file.remoteStorageId}/shares/links`,
              { publicLink: false }
            );
            const token = response.data?.token as string | undefined;
            const publicLink = response.data?.publicLink as boolean | undefined;
            if (token) {
              setShareLinks((prev) => [
                ...prev,
                {
                  token,
                  publicLink,
                  createdAt: new Date().toISOString(),
                },
              ]);
              actions.updateStirlingFileStub(file.id, { remoteHasShareLinks: true });
              await fileStorage.updateFileMetadata(file.id, { remoteHasShareLinks: true });
              alert({
                alertType: 'success',
                title: t('storageShare.generated', 'Share link generated'),
                expandable: false,
                durationMs: 2500,
              });
            }
          } catch (fallbackError) {
            console.error('Failed to create login-required share link:', fallbackError);
            setErrorMessage(
              t('storageShare.failure', 'Unable to generate a share link. Please try again.')
            );
          }
          return;
        }
        console.error('Failed to create share link:', error);
        setErrorMessage(
          t('storageShare.failure', 'Unable to generate a share link. Please try again.')
        );
      } finally {
        setIsLoading(false);
      }
    },
    [file.remoteStorageId, t]
  );

  const handleCopyLink = useCallback(async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${shareBaseUrl}${token}`);
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
  }, [shareBaseUrl, t]);

  const handleRevokeLink = useCallback(async (token: string) => {
    if (!file.remoteStorageId) return;
    setIsLoading(true);
    try {
      await apiClient.delete(`/api/v1/storage/files/${file.remoteStorageId}/shares/links/${token}`);
      setShareLinks((prev) => prev.filter((link) => link.token !== token));
      setActivityMap((prev) => {
        const updated = { ...prev };
        delete updated[token];
        return updated;
      });
      const nextHasLinks =
        shareLinks.filter((link) => link.token !== token).length > 0;
      actions.updateStirlingFileStub(file.id, { remoteHasShareLinks: nextHasLinks });
      await fileStorage.updateFileMetadata(file.id, { remoteHasShareLinks: nextHasLinks });
      alert({
        alertType: 'success',
        title: t('storageShare.revoked', 'Share link removed'),
        expandable: false,
        durationMs: 2500,
      });
    } catch (error) {
      console.error('Failed to revoke share link:', error);
      setErrorMessage(t('storageShare.revokeFailed', 'Unable to remove the share link.'));
    } finally {
      setIsLoading(false);
    }
  }, [actions, file.remoteStorageId, shareLinks, t]);

  const handleLoadActivity = useCallback(async (token: string) => {
    if (!file.remoteStorageId) return;
    setIsLoading(true);
    try {
      const response = await apiClient.get<ShareLinkAccessResponse[]>(
        `/api/v1/storage/files/${file.remoteStorageId}/shares/links/${token}/accesses`,
        { suppressErrorToast: true } as any
      );
      setActivityMap((prev) => ({
        ...prev,
        [token]: response.data ?? [],
      }));
    } catch (error) {
      console.error('Failed to load share activity:', error);
      setErrorMessage(t('storageShare.accessFailed', 'Unable to load activity.'));
    } finally {
      setIsLoading(false);
    }
  }, [file.remoteStorageId, t]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t('storageShare.manageTitle', 'Manage Sharing')}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
    >
      <Stack gap="sm">
        <Text size="sm">
          {t(
            'storageShare.manageDescription',
            'Create and manage links to share this file.'
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t('storageShare.fileLabel', 'File')}: {file.name}
        </Text>

        {errorMessage && (
          <Alert color="red" title={t('storageShare.errorTitle', 'Sharing error')}>
            {errorMessage}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            leftSection={<LinkIcon style={{ fontSize: 18 }} />}
            onClick={() => createShareLink(true)}
            loading={isLoading}
          >
            {t('storageShare.generate', 'Generate Link')}
          </Button>
        </Group>

        {shareLinks.length > 0 && <Divider />}

        {shareLinks.length === 0 && !isLoading && (
          <Text size="sm" c="dimmed">
            {t('storageShare.noLinks', 'No active share links yet.')}
          </Text>
        )}

        {shareLinks.map((link) => {
          const activity = activityMap[link.token];
          return (
            <Stack key={link.token} gap="xs">
              <Group justify="space-between" align="center">
                <TextInput
                  readOnly
                  value={`${shareBaseUrl}${link.token}`}
                  label={t('storageShare.linkLabel', 'Share link')}
                  rightSection={
                    <Button
                      variant="subtle"
                      size="xs"
                      leftSection={<ContentCopyRoundedIcon style={{ fontSize: 16 }} />}
                      onClick={() => handleCopyLink(link.token)}
                    >
                      {t('storageShare.copy', 'Copy')}
                    </Button>
                  }
                />
              </Group>
              <Group gap="xs">
                {link.publicLink === false && (
                  <Badge size="xs" variant="light">
                    {t('storageShare.requiresLogin', 'Login required')}
                  </Badge>
                )}
                {link.createdAt && (
                  <Text size="xs" c="dimmed">
                    {t('storageShare.createdAt', 'Created')} {new Date(link.createdAt).toLocaleString()}
                  </Text>
                )}
              </Group>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<HistoryIcon style={{ fontSize: 16 }} />}
                  onClick={() => handleLoadActivity(link.token)}
                >
                  {t('storageShare.viewActivity', 'View activity')}
                </Button>
                <Button
                  variant="light"
                  size="xs"
                  color="red"
                  leftSection={<DeleteIcon style={{ fontSize: 16 }} />}
                  onClick={() => handleRevokeLink(link.token)}
                >
                  {t('storageShare.removeLink', 'Remove link')}
                </Button>
              </Group>
              {activity && (
                <Stack gap="xs" pl="sm">
                  {activity.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      {t('storageShare.noActivity', 'No activity yet.')}
                    </Text>
                  ) : (
                    activity.map((entry, index) => {
                      const accessLabel = entry.accessType === 'VIEW'
                        ? t('storageShare.viewed', 'Viewed')
                        : entry.accessType === 'DOWNLOAD'
                        ? t('storageShare.downloaded', 'Downloaded')
                        : t('storageShare.accessed', 'Accessed');
                      return (
                        <Text size="xs" key={`${link.token}-${index}`}>
                          {entry.username || t('storageShare.unknownUser', 'Unknown user')} •{' '}
                          {accessLabel} •{' '}
                          {entry.accessedAt ? new Date(entry.accessedAt).toLocaleString() : ''}
                        </Text>
                      );
                    })
                  )}
                </Stack>
              )}
              <Divider />
            </Stack>
          );
        })}
      </Stack>
    </Modal>
  );
};

export default ShareManagementModal;
