import React from 'react';
import { Text } from '@mantine/core';

export interface FileStatusIndicatorProps {
  selectedFiles?: File[];
  placeholder?: string;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  placeholder = "Select a PDF file in the main view to get started"
}: FileStatusIndicatorProps) => {
  
  // Only show content when no files are selected
  if (selectedFiles.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {placeholder}
      </Text>
    );
  }

  // Return nothing when files are selected
  return null;
}

export default FileStatusIndicator;