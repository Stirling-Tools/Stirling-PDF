import React from 'react';
import { Box, Center } from '@mantine/core';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { StirlingFileStub } from '@app/types/fileContext';
import DocumentThumbnail from '@app/components/shared/filePreview/DocumentThumbnail';
import DocumentStack from '@app/components/shared/filePreview/DocumentStack';
import HoverOverlay from '@app/components/shared/filePreview/HoverOverlay';
import NavigationArrows from '@app/components/shared/filePreview/NavigationArrows';

export interface FilePreviewProps {
  // Core file data
  file: File | StirlingFileStub | null;
  thumbnail?: string | null;
  
  // Optional features
  showStacking?: boolean;
  showHoverOverlay?: boolean;
  showNavigation?: boolean;
  
  // State
  totalFiles?: number;
  isAnimating?: boolean;
  
  // Event handlers
  onFileClick?: (file: File | StirlingFileStub | null) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  thumbnail,
  showStacking = false,
  showHoverOverlay = false,
  showNavigation = false,
  totalFiles = 1,
  isAnimating = false,
  onFileClick,
  onPrevious,
  onNext
}) => {
  if (!file) {
    return (
      <Box style={{ width: '100%', height: '100%' }}>
        <Center style={{ width: '100%', height: '100%' }}>
          <InsertDriveFileIcon 
            style={{ 
              fontSize: '4rem', 
              color: 'var(--mantine-color-gray-4)',
              opacity: 0.6 
            }} 
          />
        </Center>
      </Box>
    );
  }
  
  const hasMultipleFiles = totalFiles > 1;
  
  // Animation styles
  const animationStyle = isAnimating ? {
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'scale(0.95) translateX(1.25rem)',
    opacity: 0.7
  } : {};

  // Build the component composition
  let content = (
    <DocumentThumbnail
      file={file}
      thumbnail={thumbnail}
      style={animationStyle}
      onClick={() => onFileClick?.(file)}
    />
  );

  // Wrap with hover overlay if needed
  if (showHoverOverlay && onFileClick) {
    content = <HoverOverlay>{content}</HoverOverlay>;
  }

  // Wrap with document stack if needed
  if (showStacking) {
    content = (
      <DocumentStack totalFiles={totalFiles}>
        {content}
      </DocumentStack>
    );
  }

  // Wrap with navigation if needed
  if (showNavigation && hasMultipleFiles && onPrevious && onNext) {
    content = (
      <NavigationArrows
        onPrevious={onPrevious}
        onNext={onNext}
        disabled={isAnimating}
      >
        {content}
      </NavigationArrows>
    );
  }

  return (
    <Box style={{ width: '100%', height: '100%' }}>
      {content}
    </Box>
  );
};

export default FilePreview;