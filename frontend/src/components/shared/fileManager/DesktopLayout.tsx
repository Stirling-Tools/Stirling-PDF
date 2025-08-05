import React from 'react';
import { Grid } from '@mantine/core';
import FileSourceButtons from './FileSourceButtons';
import FileDetails from './FileDetails';
import SearchInput from './SearchInput';
import FileListArea from './FileListArea';
import HiddenFileInput from './HiddenFileInput';
import { useFileManagerContext } from './FileManagerContext';

const DesktopLayout: React.FC = () => {
  const {
    activeSource,
    recentFiles,
    modalHeight,
  } = useFileManagerContext();

  return (
    <Grid gutter="md" h="100%" grow={false} style={{ flexWrap: 'nowrap' }}>
      {/* Column 1: File Sources */}
      <Grid.Col span="content" style={{ 
        minWidth: '15.625rem', 
        width: '15.625rem', 
        flexShrink: 0, 
        height: '100%',
      }}>
        <FileSourceButtons />
      </Grid.Col>
      
      {/* Column 2: File List */}
      <Grid.Col span="auto" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {activeSource === 'recent' && (
          <SearchInput style={{ marginBottom: '1rem', flexShrink: 0 }} />
        )}
        
        <div style={{ flex: 1, minHeight: 0 }}>
          <FileListArea
            scrollAreaHeight={`calc(${modalHeight} - 6rem)`}
            scrollAreaStyle={{ 
              height: activeSource === 'recent' && recentFiles.length > 0 ? `calc(${modalHeight} - 6rem)` : '100%'
            }}
          />
        </div>
      </Grid.Col>
      
      {/* Column 3: File Details */}
      <Grid.Col span="content" style={{ minWidth: '20rem', width: '20rem', flexShrink: 0, height: '100%' }}>
        <div style={{ height: '100%' }}>
          <FileDetails />
        </div>
      </Grid.Col>
      
      {/* Hidden file input for local file selection */}
      <HiddenFileInput />
    </Grid>
  );
};

export default DesktopLayout;