import React, { useState, useEffect } from 'react';
import { Stack, Card, Box, Center, Text, Badge, Button, Image, Group, Divider, ActionIcon, ScrollArea } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTranslation } from 'react-i18next';
import { detectFileExtension, getFileSize } from '../../../utils/fileUtils';
import { useIndexedDBThumbnail } from '../../../hooks/useIndexedDBThumbnail';
import { FileWithUrl } from '../../../types/file';
import { FileDetailsProps } from './types';

const FileDetails: React.FC<FileDetailsProps & { compact?: boolean; modalHeight?: string }> = ({ selectedFiles, onOpenFiles, compact = false, modalHeight = '80vh' }) => {
  const { t } = useTranslation();
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [loadingFile, setLoadingFile] = useState<FileWithUrl | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Get the currently displayed file
  const currentFile = selectedFiles.length > 0 ? selectedFiles[currentFileIndex] : null;
  const hasSelection = selectedFiles.length > 0;
  const hasMultipleFiles = selectedFiles.length > 1;
  
  // Only load thumbnail for files not in cache
  const shouldLoadThumbnail = loadingFile && !thumbnailCache[loadingFile.id || loadingFile.name];
  const { thumbnail } = useIndexedDBThumbnail(shouldLoadThumbnail ? loadingFile : ({} as FileWithUrl));
  
  // Load thumbnails for all selected files
  useEffect(() => {
    // Start loading thumbnails for uncached files
    const uncachedFiles = selectedFiles.filter(file => !thumbnailCache[file.id || file.name]);
    if (uncachedFiles.length > 0 && !loadingFile) {
      setLoadingFile(uncachedFiles[0]);
    }
  }, [selectedFiles, thumbnailCache, loadingFile]);
  
  // Cache thumbnail when it loads and move to next uncached file
  useEffect(() => {
    if (loadingFile && thumbnail) {
      const fileId = loadingFile.id || loadingFile.name;
      setThumbnailCache(prev => ({
        ...prev,
        [fileId]: thumbnail
      }));
      
      // Find next uncached file to load
      const uncachedFiles = selectedFiles.filter(file => 
        !thumbnailCache[file.id || file.name] && 
        (file.id || file.name) !== fileId
      );
      
      if (uncachedFiles.length > 0) {
        setLoadingFile(uncachedFiles[0]);
      } else {
        setLoadingFile(null);
      }
    }
  }, [loadingFile, thumbnail, selectedFiles, thumbnailCache]);
  
  // Clear cache when selection changes completely
  useEffect(() => {
    const selectedFileIds = selectedFiles.map(f => f.id || f.name);
    setThumbnailCache(prev => {
      const newCache: Record<string, string> = {};
      selectedFileIds.forEach(id => {
        if (prev[id]) {
          newCache[id] = prev[id];
        }
      });
      return newCache;
    });
    setLoadingFile(null);
  }, [selectedFiles]);
  
  // Get thumbnail from cache only
  const getCurrentThumbnail = () => {
    if (!currentFile) return null;
    const fileId = currentFile.id || currentFile.name;
    return thumbnailCache[fileId];
  };
  
  const handlePrevious = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentFileIndex(prev => prev > 0 ? prev - 1 : selectedFiles.length - 1);
      setIsAnimating(false);
    }, 150);
  };
  
  const handleNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentFileIndex(prev => prev < selectedFiles.length - 1 ? prev + 1 : 0);
      setIsAnimating(false);
    }, 150);
  };
  
  // Reset index when selection changes
  React.useEffect(() => {
    if (currentFileIndex >= selectedFiles.length) {
      setCurrentFileIndex(0);
    }
  }, [selectedFiles.length, currentFileIndex]);
  
  if (compact) {
    return (
      <Stack gap="xs" style={{ height: '100%' }}>
        {/* Compact mobile layout */}
        <Box style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Small preview */}
          <Box style={{ width: '60px', height: '80px', flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {currentFile && getCurrentThumbnail() ? (
              <img 
                src={getCurrentThumbnail()} 
                alt={currentFile.name}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  objectFit: 'contain',
                  borderRadius: '4px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
              />
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
              {currentFile ? currentFile.name : 'No file selected'}
            </Text>
            <Text size="xs" c="dimmed">
              {currentFile ? getFileSize(currentFile) : ''}
              {selectedFiles.length > 1 && ` • ${selectedFiles.length} files`}
            </Text>
            {hasMultipleFiles && (
              <Text size="xs" c="blue">
                {currentFileIndex + 1} of {selectedFiles.length}
              </Text>
            )}
          </Box>
          
          {/* Navigation arrows for multiple files */}
          {hasMultipleFiles && (
            <Box style={{ display: 'flex', gap: '4px' }}>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handlePrevious}
                disabled={isAnimating}
              >
                <ChevronLeftIcon style={{ fontSize: 16 }} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleNext}
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
        >
          {selectedFiles.length > 1 
            ? t('fileManager.openFiles', `Open ${selectedFiles.length} Files`)
            : t('fileManager.openFile', 'Open File')
          }
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" h={`calc(${modalHeight} - 2rem)`}>
      {/* Section 1: Thumbnail Preview */}
      <Box p="xs" style={{ textAlign: 'center', flexShrink: 0 }}>
        <Box style={{ position: 'relative', width: "100%", height: `calc(${modalHeight} * 0.5 - 2rem)`, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Left Navigation Arrow */}
          {hasMultipleFiles && (
            <ActionIcon
              variant="light"
              size="sm"
              onClick={handlePrevious}
              color="blue"
              disabled={isAnimating}
              style={{
                position: 'absolute',
                left: '0',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10
              }}
            >
              <ChevronLeftIcon />
            </ActionIcon>
          )}
          
          {/* Document Stack Container */}
          <Box style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Background documents (stack effect) */}
            {hasMultipleFiles && selectedFiles.length > 1 && (
              <>
                {/* Third document (furthest back) */}
                {selectedFiles.length > 2 && (
                  <Box
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'var(--mantine-color-gray-2)',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      transform: 'translate(12px, 12px) rotate(2deg)',
                      zIndex: 1
                    }}
                  />
                )}
                
                {/* Second document */}
                <Box
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'var(--mantine-color-gray-1)',
                    borderRadius: '8px',
                    boxShadow: '0 3px 10px rgba(0, 0, 0, 0.12)',
                    transform: 'translate(6px, 6px) rotate(1deg)',
                    zIndex: 2
                  }}
                />
              </>
            )}
            
            {/* Main document */}
            {currentFile && getCurrentThumbnail() ? (
              <Image 
                src={getCurrentThumbnail()} 
                alt={currentFile.name} 
                fit="contain" 
                radius="md" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  width: 'auto', 
                  height: 'auto',
                  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  position: 'relative',
                  zIndex: 3,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isAnimating ? 'scale(0.95) translateX(20px)' : 'scale(1) translateX(0)',
                  opacity: isAnimating ? 0.7 : 1
                }}
              />
            ) : currentFile ? (
              <Center style={{ 
                width: '80%', 
                height: '80%', 
                backgroundColor: 'var(--mantine-color-gray-1)', 
                borderRadius: 8,
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
                position: 'relative',
                zIndex: 3,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isAnimating ? 'scale(0.95) translateX(20px)' : 'scale(1) translateX(0)',
                opacity: isAnimating ? 0.7 : 1
              }}>
                <PictureAsPdfIcon style={{ fontSize: 48, color: 'var(--mantine-color-gray-6)' }} />
              </Center>
            ) : null}
          </Box>
          
          {/* Right Navigation Arrow */}
          {hasMultipleFiles && (
            <ActionIcon
              variant="light"
              size="sm"
              onClick={handleNext}
              color="blue"
              disabled={isAnimating}
              style={{
                position: 'absolute',
                right: '0',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10
              }}
            >
              <ChevronRightIcon />
            </ActionIcon>
          )}
        </Box>
      </Box>
      
      {/* Section 2: File Details */}
      <Card withBorder p={0} h={`calc(${modalHeight} * 0.32 - 1rem)`} style={{ flex: 1, overflow: 'hidden' }}>
        <Box bg="blue.6" p="sm" style={{ borderTopLeftRadius: 'var(--mantine-radius-md)', borderTopRightRadius: 'var(--mantine-radius-md)' }}>
          <Text size="sm" fw={500} ta="center" c="white">
            {t('fileManager.details', 'File Details')}
          </Text>
        </Box>
        <ScrollArea style={{ flex: 1 }} p="md">
          <Stack gap={0}>
            <Group justify="space-between" py="xs">
              <Text size="sm" c="dimmed">{t('fileManager.fileName', 'Name')}</Text>
              <Text size="sm" fw={500} style={{ maxWidth: '60%', textAlign: 'right' }} truncate>
                {currentFile ? currentFile.name : ''}
              </Text>
            </Group>
            <Divider />
            
            <Group justify="space-between" py="xs">
              <Text size="sm" c="dimmed">{t('fileManager.fileFormat', 'Format')}</Text>
              {currentFile ? (
                <Badge size="sm" variant="light">
                  {detectFileExtension(currentFile.name).toUpperCase()}
                </Badge>
              ) : (
                <Text size="sm" fw={500}></Text>
              )}
            </Group>
            <Divider />
            
            <Group justify="space-between" py="xs">
              <Text size="sm" c="dimmed">{t('fileManager.fileSize', 'Size')}</Text>
              <Text size="sm" fw={500}>
                {currentFile ? getFileSize(currentFile) : ''}
              </Text>
            </Group>
            <Divider />
            
            <Group justify="space-between" py="xs">
              <Text size="sm" c="dimmed">{t('fileManager.fileVersion', 'Version')}</Text>
              <Text size="sm" fw={500}>
                {currentFile ? '1.0' : ''}
              </Text>
            </Group>
            
            {selectedFiles.length > 1 && (
              <>
                <Divider />
                <Group justify="space-between" py="xs">
                  <Text size="sm" c="dimmed">{t('fileManager.totalSelected', 'Selected')}</Text>
                  <Text size="sm" fw={500}>
                    {selectedFiles.length} files
                  </Text>
                </Group>
              </>
            )}
          </Stack>
        </ScrollArea>
      </Card>
      
      {/* Section 3: Action Button */}
      <Button 
        size="md" 
        onClick={onOpenFiles}
        disabled={!hasSelection}
        fullWidth
        style={{ flexShrink: 0 }}
      >
        {selectedFiles.length > 1 
          ? t('fileManager.openFiles', `Open ${selectedFiles.length} Files`)
          : t('fileManager.openFile', 'Open File')
        }
      </Button>
    </Stack>
  );
};

export default FileDetails;