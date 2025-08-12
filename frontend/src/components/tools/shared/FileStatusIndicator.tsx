import React from 'react';
import { Text, Box, Flex, ActionIcon, Tooltip } from '@mantine/core';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { useFileContext } from '../../../contexts/FileContext';

export interface FileStatusIndicatorProps {
  selectedFiles?: File[];
  isCompleted?: boolean;
  placeholder?: string;
  showFileName?: boolean;
  showPinControls?: boolean;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  isCompleted = false,
  placeholder = "Select a PDF file in the main view to get started",
  showFileName = true,
  showPinControls = true
}: FileStatusIndicatorProps) => {
  const { pinFile, unpinFile, isFilePinned } = useFileContext();
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