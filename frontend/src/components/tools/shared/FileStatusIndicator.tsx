import React from 'react';
import { Text } from '@mantine/core';

export interface FileStatusIndicatorProps {
  selectedFiles?: File[];
  isCompleted?: boolean;
  placeholder?: string;
  showFileName?: boolean;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  isCompleted = false,
  placeholder = "Select a PDF file in the main view to get started",
  showFileName = true
}: FileStatusIndicatorProps) => {
  if (selectedFiles.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {placeholder}
      </Text>
    );
  }

  if (isCompleted) {
    return (
      <Text size="sm" c="green">
        ✓ Selected: {showFileName ? selectedFiles[0]?.name : `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`}
      </Text>
    );
  }

  return (
    <Text size="sm" c="blue">
      Selected: {showFileName ? selectedFiles[0]?.name : `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`}
    </Text>
  );
}

export default FileStatusIndicator;