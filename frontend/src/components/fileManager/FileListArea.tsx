import React from 'react';
import { Center, ScrollArea, Text, Stack } from '@mantine/core';
import CloudIcon from '@mui/icons-material/Cloud';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';
import FileListItem from './FileListItem';
import { useFileManagerContext } from '../../contexts/FileManagerContext';

interface FileListAreaProps {
  scrollAreaHeight: string;
  scrollAreaStyle?: React.CSSProperties;
}

const FileListArea: React.FC<FileListAreaProps> = ({
  scrollAreaHeight,
  scrollAreaStyle = {},
}) => {
  const {
    activeSource,
    recentFiles,
    filteredFiles,
    selectedFilesSet,
    fileGroups,
    expandedFileIds,
    onFileSelect,
    onFileRemove,
    onFileDoubleClick,
    onDownloadSingle,
    isFileSupported,
  } = useFileManagerContext();
  const { t } = useTranslation();

  if (activeSource === 'recent') {
    return (
      <ScrollArea
        h={scrollAreaHeight}
        style={{
          ...scrollAreaStyle
        }}
        type="always"
        scrollbarSize={8}
      >
        <Stack gap={0}>
          {recentFiles.length === 0 ? (
            <Center style={{ height: '12.5rem' }}>
              <Stack align="center" gap="sm">
                <HistoryIcon style={{ fontSize: '3rem', color: 'var(--mantine-color-gray-5)' }} />
                <Text c="dimmed" ta="center">{t('fileManager.noRecentFiles', 'No recent files')}</Text>
                <Text size="xs" c="dimmed" ta="center" style={{ opacity: 0.7 }}>
                  {t('fileManager.dropFilesHint', 'Drop files anywhere to upload')}
                </Text>
              </Stack>
            </Center>
          ) : (
            filteredFiles.map((file, index) => {
              // Determine if this is a history file based on whether it's in the recent files or loaded as history
              const isLeafFile = recentFiles.some(rf => rf.id === file.id);
              const isHistoryFile = !isLeafFile; // If not in recent files, it's a loaded history file
              const isLatestVersion = isLeafFile; // Only leaf files (from recent files) are latest versions

              return (
                <FileListItem
                  key={file.id}
                  file={file}
                  isSelected={selectedFilesSet.has(file.id)}
                  isSupported={isFileSupported(file.name)}
                  onSelect={(shiftKey) => onFileSelect(file, index, shiftKey)}
                  onRemove={() => onFileRemove(index)}
                  onDownload={() => onDownloadSingle(file)}
                  onDoubleClick={() => onFileDoubleClick(file)}
                  isHistoryFile={isHistoryFile}
                  isLatestVersion={isLatestVersion}
                />
              );
            })
          )}
        </Stack>
      </ScrollArea>
    );
  }

  // Google Drive placeholder
  return (
    <Center style={{ height: '12.5rem' }}>
      <Stack align="center" gap="sm">
        <CloudIcon style={{ fontSize: '3rem', color: 'var(--mantine-color-gray-5)' }} />
        <Text c="dimmed" ta="center">{t('fileManager.googleDriveNotAvailable', 'Google Drive integration coming soon')}</Text>
      </Stack>
    </Center>
  );
};

export default FileListArea;
