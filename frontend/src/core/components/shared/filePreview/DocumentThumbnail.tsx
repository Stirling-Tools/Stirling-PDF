import React from 'react';
import { Box, Center, Image } from '@mantine/core';
import { getFileTypeIcon } from '@app/components/shared/filePreview/getFileTypeIcon';
import { StirlingFileStub } from '@app/types/fileContext';
import { PrivateContent } from '@app/components/shared/PrivateContent';

export interface DocumentThumbnailProps {
  file: File | StirlingFileStub | null;
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
        <PrivateContent>
          <Image
            src={thumbnail}
            alt={`Preview of ${file.name}`}
            fit="contain"
            style={{ 
              maxWidth: '100%', 
              maxHeight: '100%',
              width: 'auto',
              height: 'auto'
            }}
          />
        </PrivateContent>
        {children}
      </Box>
    );
  }

  return (
    <Box style={containerStyle} onClick={onClick}>
      <Center style={{ width: '100%', height: '100%', backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: '0.25rem' }}>
        <PrivateContent>
          {getFileTypeIcon(file)}
        </PrivateContent>
      </Center>
      {children}
    </Box>
  );
};

export default DocumentThumbnail;
