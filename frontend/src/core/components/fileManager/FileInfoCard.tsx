import React, { useMemo, useState } from 'react';
import { Stack, Card, Box, Text, Badge, Group, Divider, ScrollArea, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { detectFileExtension, getFileSize } from '@app/utils/fileUtils';
import { StirlingFileStub } from '@app/types/fileContext';
import ToolChain from '@app/components/shared/ToolChain';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { useFileManagerContext } from '@app/contexts/FileManagerContext';
import ShareManagementModal from '@app/components/shared/ShareManagementModal';
import { useAppConfig } from '@app/contexts/AppConfigContext';

interface FileInfoCardProps {
  currentFile: StirlingFileStub | null;
  modalHeight: string;
}

const FileInfoCard: React.FC<FileInfoCardProps> = ({
  currentFile,
  modalHeight
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { onMakeCopy } = useFileManagerContext();
  const [showShareManageModal, setShowShareManageModal] = useState(false);
  const isSharedWithYou = useMemo(() => {
    if (!currentFile) return false;
    return currentFile.remoteOwnedByCurrentUser === false || currentFile.remoteSharedViaLink;
  }, [currentFile]);
  const isOwnedRemote = useMemo(() => {
    if (!currentFile) return false;
    return Boolean(currentFile.remoteStorageId) && currentFile.remoteOwnedByCurrentUser !== false;
  }, [currentFile]);
  const localUpdatedAt = currentFile?.createdAt ?? currentFile?.lastModified ?? 0;
  const remoteUpdatedAt = currentFile?.remoteStorageUpdatedAt ?? 0;
  const isUploaded = Boolean(currentFile?.remoteStorageId);
  const isUpToDate = isUploaded && remoteUpdatedAt >= localUpdatedAt;
  const isOutOfSync = isUploaded && !isUpToDate && isOwnedRemote;
  const isLocalOnly = !currentFile?.remoteStorageId && !currentFile?.remoteSharedViaLink;
  const isSharedByYou = useMemo(() => {
    if (!currentFile) return false;
    return isOwnedRemote && Boolean(currentFile.remoteHasShareLinks);
  }, [currentFile, isOwnedRemote]);
  const uploadEnabled = config?.storageEnabled === true;
  const sharingEnabled = uploadEnabled && config?.storageSharingEnabled === true;
  const ownerLabel = useMemo(() => {
    if (!currentFile) return '';
    if (currentFile.remoteOwnerUsername) {
      return currentFile.remoteOwnerUsername;
    }
    return t('fileManager.ownerUnknown', 'Unknown');
  }, [currentFile, t]);
  const lastSyncedLabel = useMemo(() => {
    if (!currentFile?.remoteStorageUpdatedAt) return '';
    return new Date(currentFile.remoteStorageUpdatedAt).toLocaleString();
  }, [currentFile?.remoteStorageUpdatedAt]);

  return (
    <Card withBorder p={0} mah={`calc(${modalHeight} * 0.45)`} style={{ overflow: 'hidden', flexShrink: 1, display: 'flex', flexDirection: 'column' }}>
      <Box bg="gray.4" p="sm" style={{ borderTopLeftRadius: 'var(--mantine-radius-md)', borderTopRightRadius: 'var(--mantine-radius-md)', flexShrink: 0 }}>
        <Text size="sm" fw={500} ta="center" c="white">
          {t('fileManager.details', 'File Details')}
        </Text>
      </Box>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} p="md">
        <Stack gap="sm">
          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">
              <PrivateContent>{t('fileManager.fileName', 'Name')}</PrivateContent>
            </Text>
            <Text size="sm" fw={500} style={{ maxWidth: '60%', textAlign: 'right' }} truncate>
              {currentFile ? currentFile.name : ''}
            </Text>
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileFormat', 'Format')}</Text>
            {currentFile ? (
              <Badge size="sm" variant="light">
                {detectFileExtension(currentFile.name).toUpperCase()}
              </Badge>
            ) : (
              <Text size="sm" fw={500}></Text>
            )}
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileSize', 'Size')}</Text>
            <Text size="sm" fw={500}>
              {currentFile ? getFileSize(currentFile) : ''}
            </Text>
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.lastModified', 'Last modified')}</Text>
            <Text size="sm" fw={500}>
              {currentFile ? new Date(currentFile.lastModified).toLocaleDateString() : ''}
            </Text>
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileVersion', 'Version')}</Text>
            {currentFile &&
              <Badge size="sm" variant="light" color={currentFile?.versionNumber ? 'blue' : 'gray'}>
                v{currentFile ? (currentFile.versionNumber || 1) : ''}
              </Badge>}

          </Group>
          {sharingEnabled && isSharedWithYou && (
            <>
              <Divider />
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.owner', 'Owner')}</Text>
                <Group gap="xs">
                  <Text size="sm" fw={500}>{ownerLabel}</Text>
                  <Badge size="xs" variant="light" color="grape">
                    {t('fileManager.sharedWithYou', 'Shared with you')}
                  </Badge>
                </Group>
              </Group>
            </>
          )}

          {/* Tool Chain Display */}
          {currentFile?.toolHistory && currentFile.toolHistory.length > 0 && (
            <>
              <Divider />
              <Box py="xs">
                <Text size="xs" c="dimmed" mb="xs">{t('fileManager.toolChain', 'Tools Applied')}</Text>
                <ToolChain
                  toolChain={currentFile.toolHistory}
                  displayStyle="badges"
                  size="xs"
                />
              </Box>
            </>
          )}

          {currentFile && isSharedWithYou && (
            <>
              <Divider />
              <Button
                size="sm"
                variant="light"
                onClick={() => onMakeCopy(currentFile)}
                fullWidth
              >
                {t('fileManager.makeCopy', 'Make a copy')}
              </Button>
            </>
          )}

          {currentFile && isOwnedRemote && (
            <>
              <Divider />
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.cloudFile', 'Cloud file')}</Text>
                {uploadEnabled && isOutOfSync ? (
                  <Badge size="xs" variant="light" color="yellow">
                    {t('fileManager.changesNotUploaded', 'Changes not uploaded')}
                  </Badge>
                ) : uploadEnabled ? (
                  <Badge size="xs" variant="light" color="teal">
                    {t('fileManager.synced', 'Synced')}
                  </Badge>
                ) : null}
              </Group>
              {lastSyncedLabel && (
                <Group justify="space-between" py="xs">
                  <Text size="sm" c="dimmed">{t('fileManager.lastSynced', 'Last synced')}</Text>
                  <Text size="sm" fw={500}>{lastSyncedLabel}</Text>
                </Group>
              )}
              {isSharedByYou && sharingEnabled && (
                <>
                  <Divider />
                  <Group justify="space-between" py="xs">
                    <Text size="sm" c="dimmed">{t('fileManager.sharing', 'Sharing')}</Text>
                    <Badge size="xs" variant="light" color="blue">
                      {t('fileManager.sharedByYou', 'Shared by you')}
                    </Badge>
                  </Group>
                  <Button
                    size="sm"
                    variant="light"
                    onClick={() => setShowShareManageModal(true)}
                    fullWidth
                  >
                    {t('storageShare.manage', 'Manage sharing')}
                  </Button>
                </>
              )}
            </>
          )}
          {currentFile && isLocalOnly && (
            <>
              <Divider />
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.storageState', 'Storage')}</Text>
                <Badge size="xs" variant="light" color="gray">
                  {t('fileManager.localOnly', 'Local only')}
                </Badge>
              </Group>
            </>
          )}
        </Stack>
      </ScrollArea>
      {currentFile && isOwnedRemote && isSharedByYou && sharingEnabled && (
        <ShareManagementModal
          opened={showShareManageModal}
          onClose={() => setShowShareManageModal(false)}
          file={currentFile}
        />
      )}
    </Card>
  );
};

export default FileInfoCard;
