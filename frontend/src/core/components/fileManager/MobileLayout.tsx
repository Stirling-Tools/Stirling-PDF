import React from 'react';
import { Box } from '@mantine/core';
import FileSourceButtons from '@app/components/fileManager/FileSourceButtons';
import FileDetails from '@app/components/fileManager/FileDetails';
import SearchInput from '@app/components/fileManager/SearchInput';
import FileListArea from '@app/components/fileManager/FileListArea';
import FileActions from '@app/components/fileManager/FileActions';
import HiddenFileInput from '@app/components/fileManager/HiddenFileInput';
import { useFileManagerContext } from '@app/contexts/FileManagerContext';

const MobileLayout: React.FC = () => {
  const {
    activeSource,
    selectedFiles,
    modalHeight,
  } = useFileManagerContext();

  // Calculate the height more accurately based on actual content
  const calculateFileListHeight = () => {
    // Base modal height minus padding and gaps
    const baseHeight = `calc(${modalHeight} - 2rem)`; // Account for Stack padding

    // Estimate heights of fixed components
    const fileSourceHeight = '3rem'; // FileSourceButtons height
    const fileDetailsHeight = selectedFiles.length > 0 ? '10rem' : '8rem'; // FileDetails compact height
    const fileActionsHeight = activeSource === 'recent' ? '3rem' : '0rem'; // FileActions height (now at bottom)
    const searchHeight = activeSource === 'recent' ? '3rem' : '0rem'; // SearchInput height
    const gapHeight = activeSource === 'recent' ? '3.75rem' : '2rem'; // Stack gaps

    return `calc(${baseHeight} - ${fileSourceHeight} - ${fileDetailsHeight} - ${fileActionsHeight} - ${searchHeight} - ${gapHeight})`;
  };

  return (
    <Box h="100%" p="sm" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Section 1: File Sources - Fixed at top */}
      <Box style={{ flexShrink: 0 }}>
        <FileSourceButtons horizontal={true} />
      </Box>

      <Box style={{ flexShrink: 0 }}>
        <FileDetails compact={true} />
      </Box>

      {/* Section 3 & 4: Search Bar + File List - Unified background extending to modal edge */}
      <Box style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-file-list)',
        borderRadius: '0.5rem',
        border: '1px solid var(--mantine-color-gray-2)',
        overflow: 'hidden',
        minHeight: 0
      }}>
        {activeSource === 'recent' && (
          <>
            <Box style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--mantine-color-gray-2)'
            }}>
              <SearchInput />
            </Box>
            <Box style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--mantine-color-gray-2)'
            }}>
              <FileActions />
            </Box>
          </>
        )}

        <Box style={{ flex: 1, minHeight: 0 }}>
          <FileListArea
            scrollAreaHeight={calculateFileListHeight()}
            scrollAreaStyle={{
              height: calculateFileListHeight(),
              maxHeight: '60vh',
              minHeight: '9.375rem',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: 0
            }}
          />
        </Box>
      </Box>

      {/* Hidden file input for local file selection */}
      <HiddenFileInput />
    </Box>
  );
};

export default MobileLayout;
