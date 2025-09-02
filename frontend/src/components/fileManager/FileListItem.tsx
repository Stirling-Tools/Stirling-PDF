import React, { useState } from 'react';
import { Group, Box, Text, ActionIcon, Checkbox, Divider, Menu, Badge } from '@mantine/core';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import { useTranslation } from 'react-i18next';
import { getFileSize, getFileDate } from '../../utils/fileUtils';
import { FileMetadata } from '../../types/file';
import { useFileManagerContext } from '../../contexts/FileManagerContext';

interface FileListItemProps {
  file: FileMetadata;
  isSelected: boolean;
  isSupported: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onRemove: () => void;
  onDownload?: () => void;
  onDoubleClick?: () => void;
  isLast?: boolean;
}

const FileListItem: React.FC<FileListItemProps> = ({
  file,
  isSelected,
  isSupported,
  onSelect,
  onRemove,
  onDownload,
  onDoubleClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { fileGroups, onRestoreVersion } = useFileManagerContext();

  // Keep item in hovered state if menu is open
  const shouldShowHovered = isHovered || isMenuOpen;

  // Get version information for this file
  const originalFileId = file.originalFileId || file.id;
  const fileVersions = fileGroups.get(originalFileId) || [];
  const hasVersionHistory = fileVersions.length > 1;
  const currentVersion = file.versionNumber || 0; // Display original files as v0

  return (
    <>
      <Box
        p="sm"
        style={{
          cursor: 'pointer',
          backgroundColor: isSelected ? 'var(--mantine-color-gray-1)' : (shouldShowHovered ? 'var(--mantine-color-gray-1)' : 'var(--bg-file-list)'),
          opacity: isSupported ? 1 : 0.5,
          transition: 'background-color 0.15s ease',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
        onClick={(e) => onSelect(e.shiftKey)}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Group gap="sm">
          <Box>
            <Checkbox
              checked={isSelected}
              onChange={() => {}} // Handled by parent onClick
              size="sm"
              pl="sm"
              pr="xs"
              styles={{
                input: {
                  cursor: 'pointer'
                }
              }}
            />
          </Box>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" align="center">
              <Text size="sm" fw={500} truncate style={{ flex: 1 }}>{file.name}</Text>
              {file.isDraft && (
                <Badge size="xs" variant="light" color="orange">
                  DRAFT
                </Badge>
              )}
              {hasVersionHistory && (
                <Badge size="xs" variant="light" color="blue">
                  v{currentVersion}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {getFileSize(file)} • {getFileDate(file)}
              {hasVersionHistory && (
                <Text span c="dimmed"> • {fileVersions.length} versions</Text>
              )}
            </Text>
          </Box>

          {/* Three dots menu - fades in/out on hover */}
          <Menu
            position="bottom-end"
            withinPortal
            onOpen={() => setIsMenuOpen(true)}
            onClose={() => setIsMenuOpen(false)}
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
              {onDownload && (
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
              
              {/* Version History Menu */}
              {hasVersionHistory && (
                <>
                  <Menu.Divider />
                  <Menu.Label>{t('fileManager.versions', 'Version History')}</Menu.Label>
                  {fileVersions.map((version, index) => (
                    <Menu.Item
                      key={version.id}
                      leftSection={
                        version.id === file.id ? 
                        <Badge size="xs" color="blue">Current</Badge> : 
                        <RestoreIcon style={{ fontSize: 16 }} />
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (version.id !== file.id) {
                          onRestoreVersion(version);
                        }
                      }}
                      disabled={version.id === file.id}
                    >
                      <Group gap="xs" style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text size="sm">
                          v{version.versionNumber || 0}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {new Date(version.lastModified).toLocaleDateString()}
                        </Text>
                      </Group>
                    </Menu.Item>
                  ))}
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
    </>
  );
};

export default FileListItem;
