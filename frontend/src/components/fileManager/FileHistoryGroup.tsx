import React from 'react';
import { Box, Text, Collapse, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { StirlingFileStub } from '../../types/fileContext';
import FileListItem from './FileListItem';

interface FileHistoryGroupProps {
  leafFile: StirlingFileStub;
  historyFiles: StirlingFileStub[];
  isExpanded: boolean;
  onDownloadSingle: (file: StirlingFileStub) => void;
  onFileDoubleClick: (file: StirlingFileStub) => void;
  onFileRemove: (index: number) => void;
  isFileSupported: (fileName: string) => boolean;
}

const FileHistoryGroup: React.FC<FileHistoryGroupProps> = ({
  leafFile,
  historyFiles,
  isExpanded,
  onDownloadSingle,
  onFileDoubleClick,
  onFileRemove,
  isFileSupported,
}) => {
  const { t } = useTranslation();

  // Sort history files by version number (oldest first, excluding the current leaf file)
  const sortedHistory = historyFiles
    .filter(file => file.id !== leafFile.id) // Exclude the leaf file itself
    .sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));

  if (!isExpanded || sortedHistory.length === 0) {
    return null;
  }

  return (
    <Collapse in={isExpanded}>
      <Box ml="md" mt="xs" mb="sm">
        <Group align="center" mb="sm">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            {t('fileManager.fileHistory', 'File History')} ({sortedHistory.length})
          </Text>
        </Group>

        <Box ml="md">
          {sortedHistory.map((historyFile, index) => (
            <FileListItem
              key={`history-${historyFile.id}-${historyFile.versionNumber || 1}`}
              file={historyFile}
              isSelected={false} // History files are not selectable
              isSupported={isFileSupported(historyFile.name)}
              onSelect={() => {}} // No selection for history files
              onRemove={() => onFileRemove(index)} // Pass through remove handler
              onDownload={() => onDownloadSingle(historyFile)}
              onDoubleClick={() => onFileDoubleClick(historyFile)}
              isHistoryFile={true} // This enables "Add to Recents" in menu
              isLatestVersion={false} // History files are never latest
              // onAddToRecents is accessed from context by FileListItem
            />
          ))}
        </Box>
      </Box>
    </Collapse>
  );
};

export default FileHistoryGroup;
