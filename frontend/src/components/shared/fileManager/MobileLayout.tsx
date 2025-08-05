import React from 'react';
import { Stack, Box } from '@mantine/core';
import FileSourceButtons from './FileSourceButtons';
import FileDetails from './FileDetails';
import SearchInput from './SearchInput';
import FileListArea from './FileListArea';
import HiddenFileInput from './HiddenFileInput';
import { useFileManagerContext } from './FileManagerContext';

const MobileLayout: React.FC = () => {
  const {
    activeSource,
    selectedFiles,
    modalHeight,
  } = useFileManagerContext();

  return (
    <Stack h="100%" gap="sm" p="sm">
      {/* Section 1: File Sources - Fixed at top */}
      <Box style={{ flexShrink: 0 }}>
        <FileSourceButtons horizontal={true} />
      </Box>
      
      <Box style={{ flexShrink: 0 }}>
        <FileDetails compact={true} />
      </Box>
      
      {/* Section 3: Search Bar - Fixed above file list */}
      {activeSource === 'recent' && (
        <Box style={{ flexShrink: 0 }}>
          <SearchInput />
        </Box>
      )}
      
      {/* Section 4: File List - Fixed height scrollable area */}
      <Box style={{ flexShrink: 0 }}>
        <FileListArea
          scrollAreaHeight={`calc(${modalHeight} - ${selectedFiles.length > 0 ? '300px' : '200px'})`}
          scrollAreaStyle={{ maxHeight: '400px', minHeight: '150px' }}
        />
      </Box>
      
      {/* Hidden file input for local file selection */}
      <HiddenFileInput />
    </Stack>
  );
};

export default MobileLayout;