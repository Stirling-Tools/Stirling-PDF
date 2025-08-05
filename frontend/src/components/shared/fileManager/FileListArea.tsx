import React from 'react';
import { Center, ScrollArea, Text, Stack } from '@mantine/core';
import CloudIcon from '@mui/icons-material/Cloud';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';
import FileListItem from './FileListItem';
import { useFileManagerContext } from './FileManagerContext';

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
    selectedFileIds,
    onFileSelect,
    onFileRemove,
    onFileDoubleClick,
    isFileSupported,
  } = useFileManagerContext();
  const { t } = useTranslation();

  if (activeSource === 'recent') {
    if (recentFiles.length === 0) {
      return (
        <Center style={{ height: '200px' }}>
          <Stack align="center" gap="sm">
            <HistoryIcon style={{ fontSize: 48, color: 'var(--mantine-color-gray-5)' }} />
            <Text c="dimmed" ta="center">{t('fileManager.noRecentFiles', 'No recent files')}</Text>
            <Text size="xs" c="dimmed" ta="center" style={{ opacity: 0.7 }}>
              {t('fileManager.dropFilesHint', 'Drop files anywhere to upload')}
            </Text>
          </Stack>
        </Center>
      );
    }

    return (
      <ScrollArea 
        h={scrollAreaHeight}
        style={{ ...scrollAreaStyle }}
        type="always" 
        scrollbarSize={8}
      >
        <Stack gap="xs" p="xs">
          {filteredFiles.map((file, index) => (
            <FileListItem
              key={file.id || file.name}
              file={file}
              isSelected={selectedFileIds.includes(file.id || file.name)}
              isSupported={isFileSupported(file.name)}
              onSelect={() => onFileSelect(file)}
              onRemove={() => onFileRemove(index)}
              onDoubleClick={() => onFileDoubleClick(file)}
            />
          ))}
        </Stack>
      </ScrollArea>
    );
  }

  // Google Drive placeholder
  return (
    <Center style={{ height: '200px' }}>
      <Stack align="center" gap="sm">
        <CloudIcon style={{ fontSize: 48, color: 'var(--mantine-color-gray-5)' }} />
        <Text c="dimmed" ta="center">{t('fileManager.googleDriveNotAvailable', 'Google Drive integration coming soon')}</Text>
      </Stack>
    </Center>
  );
};

export default FileListArea;