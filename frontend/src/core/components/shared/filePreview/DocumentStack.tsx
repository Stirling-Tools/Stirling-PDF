import React from 'react';
import { Box } from '@mantine/core';

export interface DocumentStackProps {
  totalFiles: number;
  children: React.ReactNode;
}

const DocumentStack: React.FC<DocumentStackProps> = ({
  totalFiles,
  children
}) => {
  const stackDocumentBaseStyle = {
    position: 'absolute' as const,
    width: '100%',
    height: '100%'
  };

  const stackDocumentShadows = {
    back: '0 2px 8px rgba(0, 0, 0, 0.1)',
    middle: '0 3px 10px rgba(0, 0, 0, 0.12)'
  };

  return (
    <Box style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Background documents (stack effect) */}
      {totalFiles >= 3 && (
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
      
      {totalFiles >= 2 && (
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

      {/* Main document container */}
      <Box style={{ 
        position: 'relative',
        width: '100%',
        height: '100%',
        zIndex: 3,
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)'
      }}>
        {children}
      </Box>
    </Box>
  );
};

export default DocumentStack;