import React, { useState } from 'react';
import { Box, Text, Loader, Stack, Center, Flex } from '@mantine/core';
import FilePreview from '../../shared/FilePreview';
import FileMetadata from './FileMetadata';
import NavigationControls from './NavigationControls';

export interface ReviewFile {
  file: File;
  thumbnail?: string;
}

export interface ReviewPanelProps {
  files: ReviewFile[];
  isGeneratingThumbnails?: boolean;
  onFileClick?: (file: File) => void;
  title?: string;
  emptyMessage?: string;
  loadingMessage?: string;
}

const ReviewPanel = ({
  files,
  isGeneratingThumbnails = false,
  onFileClick,
  title,
  emptyMessage = "No files to preview",
  loadingMessage = "Generating previews..."
}: ReviewPanelProps) => {
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
          {currentFile.file.name}
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
        onIndexChange={setCurrentIndex}
      />
    </Box>
  );
};

export default ReviewPanel;
