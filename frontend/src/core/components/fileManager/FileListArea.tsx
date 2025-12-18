import React from 'react';
import { Center, ScrollArea, Text, Stack } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useTranslation } from 'react-i18next';
import FileListItem from '@app/components/fileManager/FileListItem';
import FileHistoryGroup from '@app/components/fileManager/FileHistoryGroup';
import EmptyFilesState from '@app/components/fileManager/EmptyFilesState';
import { useFileManagerContext } from '@app/contexts/FileManagerContext';

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
    expandedFileIds,
    loadedHistoryFiles,
    onFileSelect,
    onFileRemove,
    onHistoryFileRemove,
    onFileDoubleClick,
    onDownloadSingle,
    isFileSupported,
    isLoading,
    activeFileIds,
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
          {recentFiles.length === 0 && !isLoading ? (
            <EmptyFilesState />
          ) : recentFiles.length === 0 && isLoading ? (
            <Center style={{ height: '12.5rem' }}>
              <Text c="dimmed" ta="center">{t('fileManager.loadingFiles', 'Loading files...')}</Text>
            </Center>
          ) : (
            filteredFiles.map((file, index) => {
              // All files in filteredFiles are now leaf files only
              const historyFiles = loadedHistoryFiles.get(file.id) || [];
              const isExpanded = expandedFileIds.has(file.id);
              const isActive = activeFileIds.includes(file.id);

              return (
                <React.Fragment key={file.id}>
                  <FileListItem
                    file={file}
                    isSelected={selectedFilesSet.has(file.id)}
                    isSupported={isFileSupported(file.name)}
                    onSelect={(shiftKey) => onFileSelect(file, index, shiftKey)}
                    onRemove={() => onFileRemove(index)}
                    onDownload={() => onDownloadSingle(file)}
                    onDoubleClick={() => onFileDoubleClick(file)}
                    isHistoryFile={false} // All files here are leaf files
                    isLatestVersion={true} // All files here are the latest versions
                    isActive={isActive}
                  />

                  <FileHistoryGroup
                    leafFile={file}
                    historyFiles={historyFiles}
                    isExpanded={isExpanded}
                    onDownloadSingle={onDownloadSingle}
                    onFileDoubleClick={onFileDoubleClick}
                    onHistoryFileRemove={onHistoryFileRemove}
                    isFileSupported={isFileSupported}
                  />
                </React.Fragment>
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
        <LocalIcon icon="cloud" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-5)' }} />
        <Text c="dimmed" ta="center">{t('fileManager.googleDriveNotAvailable', 'Google Drive integration coming soon')}</Text>
      </Stack>
    </Center>
  );
};

export default FileListArea;
