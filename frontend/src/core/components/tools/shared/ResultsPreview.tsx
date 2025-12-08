import { useState } from 'react';
import { Box, Text, Loader, Stack, Center, Flex } from '@mantine/core';
import FilePreview from '@app/components/shared/FilePreview';
import FileMetadata from '@app/components/tools/shared/FileMetadata';
import NavigationControls from '@app/components/tools/shared/NavigationControls';
import { PrivateContent } from '@app/components/shared/PrivateContent';

export interface ReviewFile {
  file: File;
  thumbnail?: string;
}

export interface ResultsPreviewProps {
  files: ReviewFile[];
  isGeneratingThumbnails?: boolean;
  onFileClick?: (file: File) => void;
  emptyMessage?: string;
  loadingMessage?: string;
}

const ResultsPreview = ({
  files,
  isGeneratingThumbnails = false,
  onFileClick,
  emptyMessage = "No files to preview",
  loadingMessage = "Generating previews..."
}: ResultsPreviewProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? files.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === files.length - 1 ? 0 : prev + 1));
  };

  if (files.length === 0 && !isGeneratingThumbnails) {
    return (
      <Text size="sm" c="dimmed">
        {emptyMessage}
      </Text>
    );
  }

  if (isGeneratingThumbnails) {
    return (
      <Center p="lg" data-testid="review-panel-loading">
        <Stack align="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">{loadingMessage}</Text>
        </Stack>
      </Center>
    );
  }

  const currentFile = files[currentIndex];
  if (!currentFile) return null;

  return (
    <Box p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: '0.5rem', maxWidth: '100%' }} data-testid="review-panel-container">

      {/* File name at the top */}
      <Box mb="sm" style={{ minHeight: '3rem', display: 'flex', alignItems: 'flex-start' }}>
        <Text
          size="sm"
          fw={500}
          style={{
            wordBreak: 'break-word',
            lineHeight: 1.4
          }}
          title={currentFile.file.name}
        >
          <PrivateContent>{currentFile.file.name}</PrivateContent>
        </Text>
      </Box>

      <Flex gap="md" align="flex-start" style={{ minHeight: '7.5rem', maxWidth: '100%' }} data-testid={`review-panel-item-${currentIndex}`}>
        <Box style={{ width: '6.25rem', height: '7.5rem', flexShrink: 0 }}>
          <FilePreview
            file={currentFile.file}
            thumbnail={currentFile.thumbnail}
            showHoverOverlay={true}
            onFileClick={onFileClick ? (file) => file && onFileClick(file as File) : undefined}
          />
        </Box>
        <FileMetadata file={currentFile.file} />
      </Flex>

      {/* Navigation controls */}
      <NavigationControls
        currentIndex={currentIndex}
        totalFiles={files.length}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />
    </Box>
  );
};

export default ResultsPreview;
