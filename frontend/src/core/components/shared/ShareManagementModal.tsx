import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  Alert,
  TextInput,
  Badge,
  Paper,
  SimpleGrid,
  ScrollArea,
  Select,
} from '@mantine/core';
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
  accessRole?: string | null;
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
  sharedWithUsers?: string[];
  sharedUsers?: Array<{ username: string; accessRole?: string | null }>;
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
  const sharingEnabled = config?.storageSharingEnabled === true;
  const shareLinksEnabled = config?.storageShareLinksEnabled === true;
  const emailSharingEnabled = config?.storageShareEmailEnabled !== false;
  const { actions } = useFileActions();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLinkResponse[]>([]);
  const [activityMap, setActivityMap] = useState<Record<string, ShareLinkAccessResponse[]>>({});
  const [sharedUsers, setSharedUsers] = useState<Array<{ username: string; accessRole?: string | null }>>([]);
  const [shareUsername, setShareUsername] = useState('');
  const [shareRole, setShareRole] = useState<'editor' | 'commenter' | 'viewer'>('editor');
  const [showEmailWarning, setShowEmailWarning] = useState(false);
  const [selectedActivityToken, setSelectedActivityToken] = useState<string | null>(null);

  const normalizedShareUsername = shareUsername.trim();
  const lowerShareUsername = normalizedShareUsername.toLowerCase();
  const isEmailInput = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedShareUsername);
  const isSimpleUsername = /^[A-Za-z0-9@._+-]{3,50}$/.test(normalizedShareUsername);
  const isReservedUsername =
    lowerShareUsername === 'all_users' || lowerShareUsername === 'anonymoususer';
  const isValidShareUsername =
    normalizedShareUsername.length > 0 && !isReservedUsername && (isEmailInput || isSimpleUsername);
  const shareUsernameError =
    normalizedShareUsername.length > 0 && !isValidShareUsername
      ? t(
          'storageShare.invalidUsername',
          'Enter a valid username or email address.'
        )
      : isEmailInput && !emailSharingEnabled
        ? t('storageShare.emailShareDisabled', 'Sharing via email is disabled by your server settings.')
        : null;

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
      const users =
        response.data?.sharedUsers ??
        (response.data?.sharedWithUsers ?? []).map((username) => ({
          username,
          accessRole: 'editor',
        }));
      setShareLinks(links);
      setSharedUsers(users);
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
      setShareRole('editor');
      setSelectedActivityToken(null);
    }
  }, [opened, loadShareLinks]);

  useEffect(() => {
    if (!opened) {
      setSelectedActivityToken(null);
      return;
    }
    if (shareLinks.length === 0) {
      setSelectedActivityToken(null);
      return;
    }
    if (!selectedActivityToken || !shareLinks.some((link) => link.token === selectedActivityToken)) {
      setSelectedActivityToken(shareLinks[0].token);
    }
  }, [opened, selectedActivityToken, shareLinks]);

  const createShareLink = useCallback(
    async () => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await apiClient.post(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/links`,
          { accessRole: shareRole }
        );
        const token = response.data?.token as string | undefined;
        if (token) {
          setShareLinks((prev) => [
            ...prev,
            {
              token,
              accessRole: shareRole,
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
        console.error('Failed to create share link:', error);
        setErrorMessage(
          t('storageShare.failure', 'Unable to generate a share link. Please try again.')
        );
      } finally {
        setIsLoading(false);
      }
    },
    [file.remoteStorageId, shareRole, t]
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
      setSelectedActivityToken((prev) => (prev === token ? null : prev));
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

  useEffect(() => {
    if (!selectedActivityToken) return;
    if (activityMap[selectedActivityToken] === undefined) {
      void handleLoadActivity(selectedActivityToken);
    }
  }, [activityMap, handleLoadActivity, selectedActivityToken]);

  const handleAddUser = useCallback(async (forceEmailConfirm = false) => {
    if (!file.remoteStorageId) return;
    const trimmed = shareUsername.trim();
    if (!trimmed) return;
    if (!isValidShareUsername) {
      return;
    }
    if (isEmailInput && !forceEmailConfirm) {
      setShowEmailWarning(true);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await apiClient.post(`/api/v1/storage/files/${file.remoteStorageId}/shares/users`, {
        username: trimmed,
        accessRole: shareRole,
      });
      setSharedUsers((prev) => {
        if (prev.some((user) => user.username === trimmed)) {
          return prev.map((user) =>
            user.username === trimmed ? { ...user, accessRole: shareRole } : user
          );
        }
        return [...prev, { username: trimmed, accessRole: shareRole }].sort((a, b) =>
          a.username.localeCompare(b.username)
        );
      });
      setShareUsername('');
      setShowEmailWarning(false);
      alert({
        alertType: 'success',
        title: t('storageShare.userAdded', 'User added to shared list.'),
        expandable: false,
        durationMs: 2500,
      });
    } catch (error) {
      console.error('Failed to share with user:', error);
      setErrorMessage(
        t('storageShare.userAddFailed', 'Unable to share with that user.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [file.remoteStorageId, isEmailInput, isValidShareUsername, shareRole, shareUsername, t]);

  const handleUpdateUserRole = useCallback(
    async (username: string, nextRole: 'editor' | 'commenter' | 'viewer') => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        await apiClient.post(`/api/v1/storage/files/${file.remoteStorageId}/shares/users`, {
          username,
          accessRole: nextRole,
        });
        setSharedUsers((prev) =>
          prev.map((user) =>
            user.username === username ? { ...user, accessRole: nextRole } : user
          )
        );
        alert({
          alertType: 'success',
          title: t('storageShare.userAdded', 'User added to shared list.'),
          expandable: false,
          durationMs: 2500,
        });
      } catch (error) {
        console.error('Failed to update shared user role:', error);
        setErrorMessage(
          t('storageShare.userAddFailed', 'Unable to share with that user.')
        );
      } finally {
        setIsLoading(false);
      }
    },
    [file.remoteStorageId, t]
  );

  const handleRemoveUser = useCallback(async (username: string) => {
    if (!file.remoteStorageId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await apiClient.delete(
        `/api/v1/storage/files/${file.remoteStorageId}/shares/users/${encodeURIComponent(
          username
        )}`
      );
      setSharedUsers((prev) => prev.filter((user) => user.username !== username));
      alert({
        alertType: 'success',
        title: t('storageShare.userRemoved', 'User removed from shared list.'),
        expandable: false,
        durationMs: 2500,
      });
    } catch (error) {
      console.error('Failed to remove shared user:', error);
      setErrorMessage(
        t('storageShare.userRemoveFailed', 'Unable to remove that user.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [file.remoteStorageId, t]);

  const selectedActivity = selectedActivityToken
    ? activityMap[selectedActivityToken]
    : undefined;
  const selectedLink = selectedActivityToken
    ? shareLinks.find((link) => link.token === selectedActivityToken)
    : undefined;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t('storageShare.manageTitle', 'Manage Sharing')}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      size="xl"
      overlayProps={{ blur: 8 }}
    >
      <Stack gap="lg">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {t('storageShare.manageDescription', 'Create and manage links to share this file.')}
          </Text>
          <Text size="sm">
            {t('storageShare.fileLabel', 'File')}: <Text span fw={600}>{file.name}</Text>
          </Text>
        </Stack>

        {errorMessage && (
          <Alert color="red" title={t('storageShare.errorTitle', 'Sharing error')}>
            {errorMessage}
          </Alert>
        )}
        {!sharingEnabled && (
          <Alert color="yellow" title={t('storageShare.sharingDisabled', 'Sharing is disabled.')}>
            {t('storageShare.sharingDisabledBody', 'Sharing has been disabled by your server settings.')}
          </Alert>
        )}

        <SimpleGrid cols={2} spacing="lg" breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
          <Stack gap="lg">
            {shareLinksEnabled && (
              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      {t('storageShare.linkAccessTitle', 'Share link access')}
                    </Text>
                  </Group>
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
                  <Group justify="flex-end" gap="sm">
                    <Button
                      leftSection={<LinkIcon style={{ fontSize: 18 }} />}
                      onClick={() => createShareLink()}
                      loading={isLoading}
                    >
                      {t('storageShare.generate', 'Generate Link')}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}

            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  {t('storageShare.sharedUsersTitle', 'Shared users')}
                </Text>
                <Group align="flex-end" gap="sm">
                  <TextInput
                    label={t('storageShare.usernameLabel', 'Username or email')}
                    placeholder={t('storageShare.usernamePlaceholder', 'Enter a username or email')}
                    value={shareUsername}
                    onChange={(event) => {
                      setShareUsername(event.currentTarget.value);
                      setShowEmailWarning(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleAddUser();
                      }
                    }}
                    disabled={!sharingEnabled || isLoading}
                    error={shareUsernameError}
                  />
                  <Button
                    onClick={() => handleAddUser()}
                    disabled={!sharingEnabled || isLoading || !normalizedShareUsername || !!shareUsernameError}
                  >
                    {t('storageShare.addUser', 'Add')}
                  </Button>
                </Group>
                {showEmailWarning && (
                  <Alert color="yellow" title={t('storageShare.emailWarningTitle', 'Email address')} variant="light">
                    <Stack gap="xs">
                      <Text size="sm">
                        {t(
                          'storageShare.emailWarningBody',
                          'This looks like an email address. If this person is not already a Stirling PDF user, they will not be able to access the file.'
                        )}
                      </Text>
                      <Group justify="flex-end" gap="sm">
                        <Button
                          variant="default"
                          onClick={() => setShowEmailWarning(false)}
                          disabled={isLoading}
                        >
                          {t('cancel', 'Cancel')}
                        </Button>
                        <Button
                          onClick={() => handleAddUser(true)}
                          loading={isLoading}
                        >
                          {t('storageShare.emailWarningConfirm', 'Share anyway')}
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                )}
                {sharedUsers.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('storageShare.noSharedUsers', 'No users have access yet.')}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {sharedUsers.map((user) => (
                      <Group key={user.username} justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text size="sm">{user.username}</Text>
                          {user.accessRole === 'commenter' && (
                            <Text size="xs" c="dimmed">
                              {t('storageShare.commenterHint', 'Commenting is coming soon.')}
                            </Text>
                          )}
                        </Stack>
                        <Group gap="xs" align="center">
                          <Select
                            value={user.accessRole ?? 'editor'}
                            onChange={(value) => {
                              const nextRole = (value as 'editor' | 'commenter' | 'viewer') || 'editor';
                              void handleUpdateUserRole(user.username, nextRole);
                            }}
                            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_FILE_MANAGER_MODAL + 10 }}
                            data={[
                              { value: 'editor', label: t('storageShare.roleEditor', 'Editor') },
                              { value: 'commenter', label: t('storageShare.roleCommenter', 'Commenter') },
                              { value: 'viewer', label: t('storageShare.roleViewer', 'Viewer') },
                            ]}
                            size="xs"
                          />
                          <Button
                            variant="light"
                            size="xs"
                            color="red"
                            leftSection={<DeleteIcon style={{ fontSize: 16 }} />}
                            onClick={() => handleRemoveUser(user.username)}
                          >
                            {t('storageShare.removeUser', 'Remove')}
                          </Button>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Paper>

            {shareLinksEnabled && (
              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      {t('storageShare.linkLabel', 'Share link')}
                    </Text>
                    {shareLinks.length > 0 && (
                      <Badge variant="light" color="blue">
                        {shareLinks.length}
                      </Badge>
                    )}
                  </Group>

                  {shareLinks.length === 0 && !isLoading && (
                    <Text size="sm" c="dimmed">
                      {t('storageShare.noLinks', 'No active share links yet.')}
                    </Text>
                  )}

                  {shareLinks.map((link) => {
                    const activity = activityMap[link.token];
                    const viewCount = activity?.filter((entry) => entry.accessType === 'VIEW').length ?? 0;
                    const downloadCount = activity?.filter((entry) => entry.accessType === 'DOWNLOAD').length ?? 0;
                    const lastAccessedAt = activity?.[0]?.accessedAt;
                    const isSelected = selectedActivityToken === link.token;
                    return (
                      <Paper key={link.token} withBorder radius="md" p="sm">
                        <Stack gap="xs">
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
                          <Group justify="space-between" align="center">
                            <Stack gap={4}>
                              <Group gap="xs">
                                {link.accessRole && (
                                  <Badge variant="light" color="gray">
                                    {link.accessRole === 'editor'
                                      ? t('storageShare.roleEditor', 'Editor')
                                      : link.accessRole === 'commenter'
                                        ? t('storageShare.roleCommenter', 'Commenter')
                                        : t('storageShare.roleViewer', 'Viewer')}
                                  </Badge>
                                )}
                              </Group>
                              <Group gap="sm" align="center">
                                <Text size="xs" c="dimmed">
                                  {t('storageShare.viewsCount', 'Views: {{count}}', { count: viewCount })}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {t('storageShare.downloadsCount', 'Downloads: {{count}}', { count: downloadCount })}
                                </Text>
                                {lastAccessedAt && (
                                  <Text size="xs" c="dimmed">
                                    {t('storageShare.lastAccessed', 'Last accessed')}: {new Date(lastAccessedAt).toLocaleString()}
                                  </Text>
                                )}
                              </Group>
                            </Stack>
                            <Group gap="xs">
                              <Button
                                variant={isSelected ? 'filled' : 'light'}
                                size="xs"
                                leftSection={<HistoryIcon style={{ fontSize: 16 }} />}
                                onClick={() =>
                                  setSelectedActivityToken((prev) => (prev === link.token ? null : link.token))
                                }
                              >
                                {isSelected
                                  ? t('storageShare.hideActivity', 'Hide activity')
                                  : t('storageShare.viewActivity', 'View activity')}
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
                          </Group>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            )}
          </Stack>

          {shareLinksEnabled && (
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    {t('storageShare.viewActivity', 'View activity')}
                  </Text>
                  {selectedLink && selectedLink.accessRole && (
                    <Badge variant="light" color="gray">
                      {selectedLink.accessRole === 'editor'
                        ? t('storageShare.roleEditor', 'Editor')
                        : selectedLink.accessRole === 'commenter'
                          ? t('storageShare.roleCommenter', 'Commenter')
                          : t('storageShare.roleViewer', 'Viewer')}
                    </Badge>
                  )}
                </Group>
                {!selectedActivityToken && (
                  <Text size="sm" c="dimmed">
                    {t('storageShare.noActivity', 'No activity yet.')}
                  </Text>
                )}
                {selectedActivityToken && (
                  <ScrollArea h={360} offsetScrollbars>
                    <Stack gap="xs">
                      {(selectedActivity ?? []).length > 0 ? (
                        selectedActivity?.map((entry, index) => (
                          <Paper key={`${selectedActivityToken}-${index}`} radius="md" p="xs" withBorder>
                            <Group justify="space-between">
                              <Stack gap={2}>
                                <Text size="xs" c="dimmed">
                                  {entry.accessedAt
                                    ? new Date(entry.accessedAt).toLocaleString()
                                    : t('unknown', 'Unknown')}
                                </Text>
                                <Text size="sm">
                                  {entry.username || t('storageShare.unknownUser', 'Unknown user')}
                                </Text>
                              </Stack>
                              <Badge size="sm" variant="light">
                                {entry.accessType === 'VIEW'
                                  ? t('storageShare.viewed', 'Viewed')
                                  : entry.accessType === 'DOWNLOAD'
                                    ? t('storageShare.downloaded', 'Downloaded')
                                    : t('storageShare.accessed', 'Accessed')}
                              </Badge>
                            </Group>
                          </Paper>
                        ))
                      ) : (
                        <Text size="sm" c="dimmed">
                          {t('storageShare.noActivity', 'No activity yet.')}
                        </Text>
                      )}
                    </Stack>
                  </ScrollArea>
                )}
              </Stack>
            </Paper>
          )}
        </SimpleGrid>
      </Stack>
    </Modal>
  );
};

export default ShareManagementModal;
