import React, { useState } from 'react';
import { Paper, Box, Image, Text, Loader, Stack, Center, Group, ActionIcon, Flex } from '@mantine/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import VisibilityIcon from '@mui/icons-material/Visibility';

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

  const formatSize = (size: number) => {
    if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

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
    <Box p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: 8, maxWidth: '100%' }} data-testid="review-panel-container">

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

      <Flex gap="md" align="flex-start" style={{ minHeight: '120px', maxWidth: '100%' }} data-testid={`review-panel-item-${currentIndex}`}>
        {/* Preview on the left */}
        <Box style={{
          flex: '0 0 100px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '120px',
          position: 'relative'
        }}>
          <Box
            style={{
              position: 'relative',
              cursor: onFileClick ? 'pointer' : 'default',
              transition: 'opacity 0.2s ease',
            }}
            onClick={() => onFileClick?.(currentFile.file)}
            onMouseEnter={(e) => {
              if (onFileClick) {
                const overlay = e.currentTarget.querySelector('.hover-overlay');
                if (overlay) overlay.style.opacity = '1';
              }
            }}
            onMouseLeave={(e) => {
              const overlay = e.currentTarget.querySelector('.hover-overlay');
              if (overlay) overlay.style.opacity = '0';
            }}
          >
            {currentFile.thumbnail ? (
              <Image
                src={currentFile.thumbnail}
                alt={`Preview of ${currentFile.file.name}`}
                style={{
                  maxWidth: '100px',
                  maxHeight: '120px',
                  objectFit: 'contain'
                }}
              />
            ) : (
              <Box
                style={{
                  width: '100px',
                  height: '120px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--mantine-color-gray-1)',
                  borderRadius: 4
                }}
              >
                <Text size="xs" c="dimmed">No preview</Text>
              </Box>
            )}

            {/* Hover overlay with eye icon */}
            {onFileClick && (
              <Box
                className="hover-overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: 4,
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                  pointerEvents: 'none'
                }}
              >
                <VisibilityIcon style={{ color: 'white', fontSize: '1.5rem' }} />
              </Box>
            )}
          </Box>
        </Box>

        {/* Metadata on the right */}
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Stack gap="2px">
            <Text size="xs" c="dimmed">
              {formatSize(currentFile.file.size)}
            </Text>
            <Text size="xs" c="dimmed">
              {currentFile.file.type || 'Unknown'}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDate(new Date(currentFile.file.lastModified))}
            </Text>
          </Stack>
        </Stack>
      </Flex>

      {/* Navigation controls */}
      {files.length > 1 && (
        <Stack align="center" gap="xs" mt="xs">
          <Group justify="center" gap="xs">
            <ActionIcon
              variant="light"
              size="sm"
              onClick={handlePrevious}
              disabled={files.length <= 1}
              data-testid="review-panel-prev"
            >
              <ChevronLeftIcon style={{ fontSize: '1rem' }} />
            </ActionIcon>

            <Group gap="xs">
              {files.map((_, index) => (
                <Box
                  key={index}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: index === currentIndex
                      ? 'var(--mantine-color-blue-6)'
                      : 'var(--mantine-color-gray-4)',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}
                  onClick={() => setCurrentIndex(index)}
                  data-testid={`review-panel-dot-${index}`}
                />
              ))}
            </Group>

            <ActionIcon
              variant="light"
              size="sm"
              onClick={handleNext}
              disabled={files.length <= 1}
              data-testid="review-panel-next"
            >
              <ChevronRightIcon style={{ fontSize: '1rem' }} />
            </ActionIcon>
          </Group>
          
          <Text size="xs" c="dimmed">
            {currentIndex + 1} of {files.length}
          </Text>
        </Stack>
      )}
    </Box>
  );
};

export default ReviewPanel;
