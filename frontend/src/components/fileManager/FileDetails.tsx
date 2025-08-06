import React, { useState, useEffect } from 'react';
import { Stack, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useIndexedDBThumbnail } from '../../hooks/useIndexedDBThumbnail';
import { useFileManagerContext } from '../../contexts/FileManagerContext';
import FilePreview from './FilePreview';
import FileInfoCard from './FileInfoCard';
import CompactFileDetails from './CompactFileDetails';

interface FileDetailsProps {
  compact?: boolean;
}

const FileDetails: React.FC<FileDetailsProps> = ({ 
  compact = false
}) => {
  const { selectedFiles, onOpenFiles, modalHeight } = useFileManagerContext();
  const { t } = useTranslation();
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Get the currently displayed file
  const currentFile = selectedFiles.length > 0 ? selectedFiles[currentFileIndex] : null;
  const hasSelection = selectedFiles.length > 0;
  const hasMultipleFiles = selectedFiles.length > 1;

  // Use IndexedDB hook for the current file
  const { thumbnail: currentThumbnail } = useIndexedDBThumbnail(currentFile);
  
  // Get thumbnail for current file
  const getCurrentThumbnail = () => {
    return currentThumbnail;
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
      <CompactFileDetails
        currentFile={currentFile}
        thumbnail={getCurrentThumbnail()}
        selectedFiles={selectedFiles}
        currentFileIndex={currentFileIndex}
        numberOfFiles={selectedFiles.length}
        isAnimating={isAnimating}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onOpenFiles={onOpenFiles}
      />
    );
  }

  return (
    <Stack gap="lg" h={`calc(${modalHeight} - 2rem)`}>
      {/* Section 1: Thumbnail Preview */}
      <FilePreview
        currentFile={currentFile}
        thumbnail={getCurrentThumbnail()}
        numberOfFiles={selectedFiles.length}
        isAnimating={isAnimating}
        modalHeight={modalHeight}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />
      
      {/* Section 2: File Details */}
      <FileInfoCard
        currentFile={currentFile}
        modalHeight={modalHeight}
      />
      
      <Button 
        size="md" 
        mb="xl"
        onClick={onOpenFiles}
        disabled={!hasSelection}
        fullWidth
        style={{ 
          flexShrink: 0, 
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

export default FileDetails;