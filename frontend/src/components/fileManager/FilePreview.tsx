import React from 'react';
import { Box, Center, ActionIcon, Image } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { FileWithUrl } from '../../types/file';

interface FilePreviewProps {
  currentFile: FileWithUrl | null;
  thumbnail: string | null;
  numberOfFiles: number;
  isAnimating: boolean;
  modalHeight: string;
  onPrevious: () => void;
  onNext: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  currentFile,
  thumbnail,
  numberOfFiles,
  isAnimating,
  modalHeight,
  onPrevious,
  onNext
}) => {
  const hasMultipleFiles = numberOfFiles > 1;
  // Common style objects
  const navigationArrowStyle = {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 10
  };

  const stackDocumentBaseStyle = {
    position: 'absolute' as const,
    width: '100%',
    height: '100%'
  };

  const animationStyle = {
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: isAnimating ? 'scale(0.95) translateX(1.25rem)' : 'scale(1) translateX(0)',
    opacity: isAnimating ? 0.7 : 1
  };

  const mainDocumentShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
  const stackDocumentShadows = {
    back: '0 2px 8px rgba(0, 0, 0, 0.1)',
    middle: '0 3px 10px rgba(0, 0, 0, 0.12)'
  };

  return (
    <Box p="xs" style={{ textAlign: 'center', flexShrink: 0 }}>
      <Box style={{ position: 'relative', width: "100%", height: `calc(${modalHeight} * 0.5 - 2rem)`, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Left Navigation Arrow */}
        {hasMultipleFiles && (
          <ActionIcon
            variant="light"
            size="sm"
            onClick={onPrevious}
            color="blue"
            disabled={isAnimating}
            style={{
              ...navigationArrowStyle,
              left: '0'
            }}
          >
            <ChevronLeftIcon />
          </ActionIcon>
        )}
        
        {/* Document Stack Container */}
        <Box style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Background documents (stack effect) */}
          {/* Show 2 shadow pages for 3+ files */}
          {numberOfFiles >= 3 && (
            <Box
              style={{
                ...stackDocumentBaseStyle,
                backgroundColor: 'var(--mantine-color-gray-3)',
                boxShadow: stackDocumentShadows.back,
                transform: 'translate(0.75rem, 0.75rem) rotate(2deg)',
                zIndex: 1
              }}
            />
          )}
          
          {/* Show 1 shadow page for 2+ files */}
          {numberOfFiles >= 2 && (
            <Box
              style={{
                ...stackDocumentBaseStyle,
                backgroundColor: 'var(--mantine-color-gray-2)',
                boxShadow: stackDocumentShadows.middle,
                transform: 'translate(0.375rem, 0.375rem) rotate(1deg)',
                zIndex: 2
              }}
            />
          )}
          
          {/* Main document */}
          {currentFile && thumbnail ? (
            <Image 
              src={thumbnail} 
              alt={currentFile.name} 
              fit="contain" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%', 
                width: 'auto', 
                height: 'auto',
                boxShadow: mainDocumentShadow,
                position: 'relative',
                zIndex: 3,
                ...animationStyle
              }}
            />
          ) : currentFile ? (
            <Center style={{ 
              width: '80%', 
              height: '80%', 
              backgroundColor: 'var(--mantine-color-gray-1)', 
              boxShadow: mainDocumentShadow,
              position: 'relative',
              zIndex: 3,
              ...animationStyle
            }}>
              <PictureAsPdfIcon style={{ fontSize: '3rem', color: 'var(--mantine-color-gray-6)' }} />
            </Center>
          ) : null}
        </Box>
        
        {/* Right Navigation Arrow */}
        {hasMultipleFiles && (
          <ActionIcon
            variant="light"
            size="sm"
            onClick={onNext}
            color="blue"
            disabled={isAnimating}
            style={{
              ...navigationArrowStyle,
              right: '0'
            }}
          >
            <ChevronRightIcon />
          </ActionIcon>
        )}
      </Box>
    </Box>
  );
};

export default FilePreview;