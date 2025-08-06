import React from 'react';
import { Box, Center, ActionIcon, Image } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { FileWithUrl } from '../../types/file';

interface FilePreviewProps {
  currentFile: FileWithUrl | null;
  thumbnail: string | null;
  hasMultipleFiles: boolean;
  isAnimating: boolean;
  modalHeight: string;
  onPrevious: () => void;
  onNext: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  currentFile,
  thumbnail,
  hasMultipleFiles,
  isAnimating,
  modalHeight,
  onPrevious,
  onNext
}) => {
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
          {hasMultipleFiles && (
            <>
              {/* Third document (furthest back) */}
              <Box
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'var(--mantine-color-gray-2)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  transform: 'translate(0.75rem, 0.75rem) rotate(2deg)',
                  zIndex: 1
                }}
              />
              
              {/* Second document */}
              <Box
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'var(--mantine-color-gray-1)',
                  boxShadow: '0 3px 10px rgba(0, 0, 0, 0.12)',
                  transform: 'translate(0.375rem, 0.375rem) rotate(1deg)',
                  zIndex: 2
                }}
              />
            </>
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
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
                borderRadius: '0.5rem',
                position: 'relative',
                zIndex: 3,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isAnimating ? 'scale(0.95) translateX(1.25rem)' : 'scale(1) translateX(0)',
                opacity: isAnimating ? 0.7 : 1
              }}
            />
          ) : currentFile ? (
            <Center style={{ 
              width: '80%', 
              height: '80%', 
              backgroundColor: 'var(--mantine-color-gray-1)', 
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
              position: 'relative',
              zIndex: 3,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isAnimating ? 'scale(0.95) translateX(1.25rem)' : 'scale(1) translateX(0)',
              opacity: isAnimating ? 0.7 : 1
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
  );
};

export default FilePreview;