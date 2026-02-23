import React, { useCallback, useMemo, useState } from 'react';
import { Group, Box, Text, ActionIcon, Checkbox, Divider, Menu, Badge } from '@mantine/core';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import LinkIcon from '@mui/icons-material/Link';
import { useTranslation } from 'react-i18next';
import { getFileSize, getFileDate } from '@app/utils/fileUtils';
import { FileId, StirlingFileStub } from '@app/types/fileContext';
import { useFileManagerContext } from '@app/contexts/FileManagerContext';
import { zipFileService } from '@app/services/zipFileService';
import ToolChain from '@app/components/shared/ToolChain';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { useFileManagement } from '@app/contexts/FileContext';
import UploadToServerModal from '@app/components/shared/UploadToServerModal';
import ShareFileModal from '@app/components/shared/ShareFileModal';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import ShareManagementModal from '@app/components/shared/ShareManagementModal';
import apiClient from '@app/services/apiClient';
import { absoluteWithBasePath } from '@app/constants/app';
import { alert } from '@app/components/toast';

interface FileListItemProps {
  file: StirlingFileStub;
  isSelected: boolean;
  isSupported: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onRemove: () => void;
  onDownload?: () => void;
  onDoubleClick?: () => void;
  isLast?: boolean;
  isHistoryFile?: boolean; // Whether this is a history file (indented)
  isLatestVersion?: boolean; // Whether this is the latest version (shows chevron)
  isActive?: boolean; // Whether this file is currently loaded in FileContext
}

const FileListItem: React.FC<FileListItemProps> = ({
  file,
  isSelected,
  isSupported,
  onSelect,
  onRemove,
  onDownload,
  onDoubleClick,
  isHistoryFile = false,
  isLatestVersion = false,
  isActive = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShareManageModal, setShowShareManageModal] = useState(false);
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const {expandedFileIds, onToggleExpansion, onUnzipFile, refreshRecentFiles } = useFileManagerContext();
  const { removeFiles } = useFileManagement();

  // Check if this is a ZIP file
  const isZipFile = zipFileService.isZipFileStub(file);

  // Check file extension
  const extLower = (file.name?.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const isCBZ = extLower === 'cbz';
  const isCBR = extLower === 'cbr';

  // Keep item in hovered state if menu is open
  const shouldShowHovered = isHovered || isMenuOpen;

  // Get version information for this file
  const leafFileId = (isLatestVersion ? file.id : (file.originalFileId || file.id)) as FileId;
  const hasVersionHistory = (file.versionNumber || 1) > 1; // Show history for any processed file (v2+)
  const currentVersion = file.versionNumber || 1; // Display original files as v1
  const isExpanded = expandedFileIds.has(leafFileId);
  const uploadEnabled = config?.storageEnabled === true;
  const sharingEnabled = uploadEnabled && config?.storageSharingEnabled === true;
  const shareLinksEnabled = sharingEnabled && config?.storageShareLinksEnabled === true;
  const isOwnedOrLocal = file.remoteOwnedByCurrentUser !== false;
  const isSharedWithYou =
    sharingEnabled && (file.remoteOwnedByCurrentUser === false || file.remoteSharedViaLink);
  const localUpdatedAt = file.createdAt ?? file.lastModified ?? 0;
  const remoteUpdatedAt = file.remoteStorageUpdatedAt ?? 0;
  const isUploaded = Boolean(file.remoteStorageId);
  const isUpToDate = isUploaded && remoteUpdatedAt >= localUpdatedAt;
  const isOutOfSync = isUploaded && !isUpToDate && isOwnedOrLocal;
  const isLocalOnly = !file.remoteStorageId && !file.remoteSharedViaLink;
  const accessRole = (isOwnedOrLocal ? 'editor' : (file.remoteAccessRole ?? 'viewer')).toLowerCase();
  const hasReadAccess = isOwnedOrLocal || accessRole === 'editor' || accessRole === 'commenter' || accessRole === 'viewer';
  const canUpload = uploadEnabled && isOwnedOrLocal && isLatestVersion && (!isUploaded || !isUpToDate);
  const canShare = shareLinksEnabled && isOwnedOrLocal && isLatestVersion;
  const canManageShare = sharingEnabled && isOwnedOrLocal && Boolean(file.remoteStorageId);
  const canCopyShareLink =
    shareLinksEnabled && Boolean(file.remoteHasShareLinks) && Boolean(file.remoteStorageId);
  const canDownloadFile = Boolean(onDownload) && hasReadAccess;

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

  const handleCopyShareLink = useCallback(async () => {
    if (!file.remoteStorageId) return;
    try {
      const response = await apiClient.get<{ shareLinks?: Array<{ token?: string }> }>(
        `/api/v1/storage/files/${file.remoteStorageId}`,
        { suppressErrorToast: true } as any
      );
      const links = response.data?.shareLinks ?? [];
      const token = links[links.length - 1]?.token;
      if (!token) {
        alert({
          alertType: 'warning',
          title: t('storageShare.noLinks', 'No active share links yet.'),
          expandable: false,
          durationMs: 2500,
        });
        return;
      }
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
  }, [file.remoteStorageId, shareBaseUrl, t]);

  return (
    <>
      <Box
        p="sm"
        style={{
          cursor: isHistoryFile || isActive ? 'default' : 'pointer',
          backgroundColor: isActive
              ? 'var(--file-active-bg)'
              : isSelected
              ? 'var(--mantine-color-gray-1)'
              : (shouldShowHovered ? 'var(--mantine-color-gray-1)' : 'var(--bg-file-list)'),
          opacity: isSupported ? 1 : 0.5,
          transition: 'background-color 0.15s ease',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          paddingLeft: isHistoryFile ? '2rem' : '0.75rem', // Indent history files
          borderLeft: isHistoryFile ? '3px solid var(--mantine-color-blue-4)' : 'none' // Visual indicator for history
        }}
        onClick={isHistoryFile || isActive ? undefined : (e) => onSelect(e.shiftKey)}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Group gap="sm">
          {!isHistoryFile && (
            <Box>
              {/* Checkbox for regular files only */}
              <Checkbox
                checked={isActive || isSelected}
                onChange={() => {}} // Handled by parent onClick
                size="sm"
                pl="sm"
                pr="xs"
                disabled={isActive}
                color={isActive ? "green" : undefined}
                styles={{
                  input: {
                    cursor: isActive ? 'not-allowed' : 'pointer'
                  }
                }}
              />
            </Box>
          )}

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" align="center">
              <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
                <PrivateContent>{file.name}</PrivateContent>
              </Text>
              {isActive && (
                <Badge
                  size="xs"
                  variant="light"
                  style={{
                    backgroundColor: 'var(--file-active-badge-bg)',
                    color: 'var(--file-active-badge-fg)',
                    border: '1px solid var(--file-active-badge-border)'
                  }}
                >
                  {t('fileManager.active', 'Active')}
                </Badge>
              )}
              <Badge size="xs" variant="light" color={"blue"}>
                v{currentVersion}
              </Badge>
              {sharingEnabled && isSharedWithYou ? (
                <Badge size="xs" variant="light" color="grape">
                  {t('fileManager.sharedWithYou', 'Shared with you')}
                </Badge>
              ) : null}
              {sharingEnabled && isSharedWithYou && accessRole && accessRole !== 'editor' ? (
                <Badge size="xs" variant="light" color="gray">
                  {accessRole === 'commenter'
                    ? t('storageShare.roleCommenter', 'Commenter')
                    : t('storageShare.roleViewer', 'Viewer')}
                </Badge>
              ) : isLocalOnly ? (
                <Badge size="xs" variant="light" color="gray">
                  {t('fileManager.localOnly', 'Local only')}
                </Badge>
              ) : uploadEnabled && isOutOfSync ? (
                <Badge
                  size="xs"
                  variant="light"
                  color="yellow"
                  leftSection={<CloudUploadIcon style={{ fontSize: 12 }} />}
                >
                  {t('fileManager.changesNotUploaded', 'Changes not uploaded')}
                </Badge>
              ) : uploadEnabled && isUploaded ? (
                <Badge
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<CloudDoneIcon style={{ fontSize: 12 }} />}
                >
                  {t('fileManager.synced', 'Synced')}
                </Badge>
              ) : null}
              {sharingEnabled && file.remoteOwnedByCurrentUser !== false && file.remoteHasShareLinks && (
                <Badge size="xs" variant="light" color="blue">
                  {t('fileManager.sharedByYou', 'Shared by you')}
                </Badge>
              )}

            </Group>
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed">
                {getFileSize(file)} • {getFileDate(file)}
              </Text>

              {/* Tool chain for processed files */}
              {file.toolHistory && file.toolHistory.length > 0 && (
                <ToolChain
                  toolChain={file.toolHistory}
                  maxWidth={'150px'}
                  displayStyle="text"
                  size="xs"
                />
              )}
            </Group>
          </Box>

          {/* Three dots menu - fades in/out on hover */}
          <Menu
            position="bottom-end"
            withinPortal
            onOpen={() => setIsMenuOpen(true)}
            onClose={() => setIsMenuOpen(false)}
            zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
          >
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                c="dimmed"
                size="md"
                onClick={(e) => e.stopPropagation()}
                style={{
                  opacity: shouldShowHovered ? 1 : 0,
                  transform: shouldShowHovered ? 'scale(1)' : 'scale(0.8)',
                  transition: 'opacity 0.3s ease, transform 0.3s ease',
                  pointerEvents: shouldShowHovered ? 'auto' : 'none'
                }}
              >
                <MoreVertIcon style={{ fontSize: 20 }} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              {/* Close file option for active files */}
              {isActive && (
                <>
                  <Menu.Item
                    leftSection={<CloseIcon style={{ fontSize: 16 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFiles([file.id]);
                    }}
                  >
                    {t('fileManager.closeFile', 'Close File')}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}

              {canDownloadFile && (
                <Menu.Item
                  leftSection={<DownloadIcon style={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  {t('fileManager.download', 'Download')}
                </Menu.Item>
              )}

              {canUpload && (
                <Menu.Item
                  leftSection={<CloudUploadIcon style={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUploadModal(true);
                  }}
                >
                  {isUploaded
                    ? t('fileManager.updateOnServer', 'Update on Server')
                    : t('fileManager.uploadToServer', 'Upload to Server')}
                </Menu.Item>
              )}

              {canShare && (
                <Menu.Item
                  leftSection={<LinkIcon style={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowShareModal(true);
                  }}
                >
                  {t('fileManager.share', 'Share')}
                </Menu.Item>
              )}

              {canCopyShareLink && (
                <Menu.Item
                  leftSection={<LinkIcon style={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopyShareLink();
                  }}
                >
                  {t('storageShare.copyLink', 'Copy share link')}
                </Menu.Item>
              )}

              {canManageShare && (
                <Menu.Item
                  leftSection={<LinkIcon style={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowShareManageModal(true);
                  }}
                >
                  {t('storageShare.manage', 'Manage sharing')}
                </Menu.Item>
              )}

              {/* Show/Hide History option for latest version files */}
              {isLatestVersion && hasVersionHistory && (
                <>
                  <Menu.Item
                    leftSection={
                        <HistoryIcon style={{ fontSize: 16 }} />
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpansion(leafFileId);
                    }}
                  >
                    {
                      (isExpanded ?
                        t('fileManager.hideHistory', 'Hide History') :
                        t('fileManager.showHistory', 'Show History')
                      )
                    }
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}

              {/* Restore option for history files */}
              {isHistoryFile && (
                <>
                  <Menu.Item
                    leftSection={<RestoreIcon style={{ fontSize: 16 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {t('fileManager.restore', 'Restore')}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}

              {/* Unzip option for ZIP files */}
              {isZipFile && !isHistoryFile && !isCBZ && !isCBR && (
                <>
                  <Menu.Item
                    leftSection={<UnarchiveIcon style={{ fontSize: 16 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnzipFile(file);
                    }}
                  >
                    {t('fileManager.unzip', 'Unzip')}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}

              <Menu.Item
                leftSection={<DeleteIcon style={{ fontSize: 16 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                {t('fileManager.delete', 'Delete')}
              </Menu.Item>

            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>
      { <Divider color="var(--mantine-color-gray-3)" />}
      {canUpload && (
        <UploadToServerModal
          opened={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          file={file}
          onUploaded={refreshRecentFiles}
        />
      )}
      {canShare && (
        <ShareFileModal
          opened={showShareModal}
          onClose={() => setShowShareModal(false)}
          file={file}
          onUploaded={refreshRecentFiles}
        />
      )}
      {canManageShare && (
        <ShareManagementModal
          opened={showShareManageModal}
          onClose={() => setShowShareManageModal(false)}
          file={file}
        />
      )}
    </>
  );
};

export default FileListItem;
