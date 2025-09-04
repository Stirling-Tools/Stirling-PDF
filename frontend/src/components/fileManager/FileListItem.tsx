import React, { useState } from 'react';
import { Group, Box, Text, ActionIcon, Checkbox, Divider, Menu, Badge, Button, Loader } from '@mantine/core';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';
import { getFileSize, getFileDate } from '../../utils/fileUtils';
import { FileMetadata } from '../../types/file';
import { useFileManagerContext } from '../../contexts/FileManagerContext';
import ToolChain from '../shared/ToolChain';

interface FileListItemProps {
  file: FileMetadata;
  isSelected: boolean;
  isSupported: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onRemove: () => void;
  onDownload?: () => void;
  onDoubleClick?: () => void;
  isLast?: boolean;
  isHistoryFile?: boolean; // Whether this is a history file (indented)
  isLatestVersion?: boolean; // Whether this is the latest version (shows chevron)
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
  isLatestVersion = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { fileGroups, expandedFileIds, onToggleExpansion, onAddToRecents, isLoadingHistory, getHistoryError } = useFileManagerContext();

  // Keep item in hovered state if menu is open
  const shouldShowHovered = isHovered || isMenuOpen;

  // Get version information for this file
  const leafFileId = isLatestVersion ? file.id : (file.originalFileId || file.id);
  const lineagePath = fileGroups.get(leafFileId) || [];
  const hasVersionHistory = (file.versionNumber || 0) > 0; // Show history for any processed file (v1+)
  const currentVersion = file.versionNumber || 0; // Display original files as v0
  const isExpanded = expandedFileIds.has(leafFileId);
  
  // Get loading state for this file's history
  const isLoadingFileHistory = isLoadingHistory(file.id);
  const historyError = getHistoryError(file.id);

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
          msUserSelect: 'none',
          paddingLeft: isHistoryFile ? '2rem' : '0.75rem', // Indent history files
          borderLeft: isHistoryFile ? '3px solid var(--mantine-color-blue-4)' : 'none' // Visual indicator for history
        }}
        onClick={(e) => onSelect(e.shiftKey)}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Group gap="sm">
          <Box>
            {/* Checkbox for all files */}
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
              {isLoadingFileHistory && <Loader size={14} />}
                <Badge size="xs" variant="light" color={currentVersion > 0 ? "blue" : "gray"}>
                  v{currentVersion}
                </Badge>

            </Group>
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed">
                {getFileSize(file)} • {getFileDate(file)}
                {hasVersionHistory && (
                  <Text span c="dimmed"> • has history</Text>
                )}
              </Text>

              {/* Tool chain for processed files */}
              {file.historyInfo?.toolChain && file.historyInfo.toolChain.length > 0 && (
                <ToolChain
                  toolChain={file.historyInfo.toolChain}
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

              {/* Show/Hide History option for latest version files */}
              {isLatestVersion && hasVersionHistory && (
                <>
                  <Menu.Item
                    leftSection={
                      isLoadingFileHistory ? 
                        <Loader size={16} /> : 
                        <HistoryIcon style={{ fontSize: 16 }} />
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpansion(leafFileId);
                    }}
                    disabled={isLoadingFileHistory}
                  >
                    {isLoadingFileHistory ? 
                      t('fileManager.loadingHistory', 'Loading History...') :
                      (isExpanded ?
                        t('fileManager.hideHistory', 'Hide History') :
                        t('fileManager.showHistory', 'Show History')
                      )
                    }
                  </Menu.Item>
                  {historyError && (
                    <Menu.Item disabled c="red" style={{ fontSize: '12px' }}>
                      {t('fileManager.historyError', 'Error loading history')}
                    </Menu.Item>
                  )}
                  <Menu.Divider />
                </>
              )}

              {/* Add to Recents option for history files */}
              {isHistoryFile && (
                <>
                  <Menu.Item
                    leftSection={<AddIcon style={{ fontSize: 16 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToRecents(file);
                    }}
                  >
                    {t('fileManager.addToRecents', 'Add to Recents')}
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
    </>
  );
};

export default FileListItem;
