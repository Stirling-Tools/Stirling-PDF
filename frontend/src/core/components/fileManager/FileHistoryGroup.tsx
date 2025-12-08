import React from 'react';
import { Box, Text, Collapse, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { StirlingFileStub } from '@app/types/fileContext';
import FileListItem from '@app/components/fileManager/FileListItem';

interface FileHistoryGroupProps {
  leafFile: StirlingFileStub;
  historyFiles: StirlingFileStub[];
  isExpanded: boolean;
  onDownloadSingle: (file: StirlingFileStub) => void;
  onFileDoubleClick: (file: StirlingFileStub) => void;
  onHistoryFileRemove: (file: StirlingFileStub) => void;
  isFileSupported: (fileName: string) => boolean;
}

const FileHistoryGroup: React.FC<FileHistoryGroupProps> = ({
  leafFile,
  historyFiles,
  isExpanded,
  onDownloadSingle,
  onFileDoubleClick,
  onHistoryFileRemove,
  isFileSupported,
}) => {
  const { t } = useTranslation();

  // Sort history files by version number (oldest first, excluding the current leaf file)
  const sortedHistory = historyFiles
    .filter(file => file.id !== leafFile.id) // Exclude the leaf file itself
    .sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1));

  if (!isExpanded || sortedHistory.length === 0) {
    return null;
  }

  return (
    <Collapse in={isExpanded}>
      <Box ml="md" mt="xs" mb="sm">
        <Group align="center" mb="sm">
          <Text size="xs" fw={600} c="dimmed">
            {t('fileManager.fileHistory', 'File History')} ({sortedHistory.length})
          </Text>
        </Group>

        <Box ml="md">
          {sortedHistory.map((historyFile) => (
            <FileListItem
              key={`history-${historyFile.id}-${historyFile.versionNumber || 1}`}
              file={historyFile}
              isSelected={false} // History files are not selectable
              isSupported={isFileSupported(historyFile.name)}
              onSelect={() => {}} // No selection for history files
              onRemove={() => onHistoryFileRemove(historyFile)} // Remove specific history file
              onDownload={() => onDownloadSingle(historyFile)}
              onDoubleClick={() => onFileDoubleClick(historyFile)}
              isHistoryFile={true} // This enables "Add to Recents" in menu
              isLatestVersion={false} // History files are never latest
            />
          ))}
        </Box>
      </Box>
    </Collapse>
  );
};

export default FileHistoryGroup;
