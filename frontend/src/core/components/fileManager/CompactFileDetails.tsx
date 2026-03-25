import React from 'react';
import { Stack, Box, Text, Button, ActionIcon, Center } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTranslation } from 'react-i18next';
import { getFileSize } from '@app/utils/fileUtils';
import { StirlingFileStub } from '@app/types/fileContext';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface CompactFileDetailsProps {
  currentFile: StirlingFileStub | null;
  thumbnail: string | null;
  selectedFiles: StirlingFileStub[];
  currentFileIndex: number;
  numberOfFiles: number;
  isAnimating: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onOpenFiles: () => void;
}

const CompactFileDetails: React.FC<CompactFileDetailsProps> = ({
  currentFile,
  thumbnail,
  selectedFiles,
  currentFileIndex,
  numberOfFiles,
  isAnimating,
  onPrevious,
  onNext,
  onOpenFiles
}) => {
  const { t } = useTranslation();
  const hasSelection = selectedFiles.length > 0;
  const hasMultipleFiles = numberOfFiles > 1;
  const showOwner = Boolean(
    currentFile &&
      (currentFile.remoteOwnedByCurrentUser === false || currentFile.remoteSharedViaLink)
  );
  const ownerLabel = currentFile
    ? currentFile.remoteOwnerUsername || t('fileManager.ownerUnknown', 'Unknown')
    : '';

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      {/* Compact mobile layout */}
      <Box style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        {/* Small preview */}
        <Box style={{ width: '7.5rem', height: '9.375rem', flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {currentFile && thumbnail ? (
            <PrivateContent>
              <img
                src={thumbnail}
                alt={currentFile.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '0.25rem',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
              />
            </PrivateContent>
          ) : currentFile ? (
            <Center style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'var(--mantine-color-gray-1)',
              borderRadius: 4
            }}>
              <PictureAsPdfIcon style={{ fontSize: 20, color: 'var(--mantine-color-gray-6)' }} />
            </Center>
          ) : null}
        </Box>

        {/* File info */}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            <PrivateContent>{currentFile ? currentFile.name : 'No file selected'}</PrivateContent>
          </Text>
          <Text size="xs" c="dimmed">
            {currentFile ? getFileSize(currentFile) : ''}
            {selectedFiles.length > 1 && ` • ${selectedFiles.length} files`}
            {currentFile && ` • v${currentFile.versionNumber || 1}`}
          </Text>
          {hasMultipleFiles && (
            <Text size="xs" c="blue">
              {currentFileIndex + 1} of {selectedFiles.length}
            </Text>
          )}
          {/* Compact tool chain for mobile */}
          {currentFile?.toolHistory && currentFile.toolHistory.length > 0 && (
            <Text size="xs" c="dimmed">
              {currentFile.toolHistory.map((tool) => t(`home.${tool.toolId}.title`, tool.toolId)).join(' → ')}
            </Text>
          )}
          {currentFile && showOwner && (
            <Text size="xs" c="dimmed">
              {t('fileManager.owner', 'Owner')}: {ownerLabel}
            </Text>
          )}
        </Box>

        {/* Navigation arrows for multiple files */}
        {hasMultipleFiles && (
          <Box style={{ display: 'flex', gap: '0.25rem' }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={onPrevious}
              disabled={isAnimating}
            >
              <ChevronLeftIcon style={{ fontSize: 16 }} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={onNext}
              disabled={isAnimating}
            >
              <ChevronRightIcon style={{ fontSize: 16 }} />
            </ActionIcon>
          </Box>
        )}
      </Box>

      {/* Action Button */}
      <Button
        size="sm"
        onClick={onOpenFiles}
        disabled={!hasSelection}
        fullWidth
        style={{
          backgroundColor: hasSelection ? 'var(--btn-open-file)' : 'var(--mantine-color-gray-4)',
          color: 'white'
        }}
      >
        {selectedFiles.length > 1
          ? t('fileManager.openFiles', `Open ${selectedFiles.length} Files`)
          : t('fileManager.openFile', 'Open File')
        }
      </Button>
    </Stack>
  );
};

export default CompactFileDetails;
