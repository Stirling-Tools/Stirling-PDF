import React from 'react';
import { Box, Center, Image } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { StoredFileMetadata } from '../../../services/fileStorage';

export interface DocumentThumbnailProps {
  file: File | StoredFileMetadata | null;
  thumbnail?: string | null;
  style?: React.CSSProperties;
  onClick?: () => void;
  children?: React.ReactNode;
}

const DocumentThumbnail: React.FC<DocumentThumbnailProps> = ({
  file,
  thumbnail,
  style = {},
  onClick,
  children
}) => {
  if (!file) return null;
  
  const containerStyle = {
    position: 'relative' as const,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'opacity 0.2s ease',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style
  };

  if (thumbnail) {
    return (
      <Box style={containerStyle} onClick={onClick}>
        <Image
          src={thumbnail}
          alt={`Preview of ${file.name}`}
          fit="contain"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />
        {children}
      </Box>
    );
  }

  return (
    <Box style={containerStyle} onClick={onClick}>
      <Center style={{ width: '100%', height: '100%', backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: '0.25rem' }}>
        <PictureAsPdfIcon 
          style={{ 
            fontSize: '2rem', 
            color: 'var(--mantine-color-gray-6)' 
          }} 
        />
      </Center>
      {children}
    </Box>
  );
};

export default DocumentThumbnail;