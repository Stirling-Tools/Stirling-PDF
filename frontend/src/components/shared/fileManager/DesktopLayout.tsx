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
    <Grid gutter="xs" h="100%" grow={false} style={{ flexWrap: 'nowrap', minWidth: 0 }}>
      {/* Column 1: File Sources */}
      <Grid.Col span="content" p="lg" style={{ 
        minWidth: '13.625rem', 
        width: '13.625rem', 
        flexShrink: 0, 
        height: '100%',
      }}>
        <FileSourceButtons />
      </Grid.Col>
      
      {/* Column 2: File List */}
      <Grid.Col span="auto" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        minHeight: 0,
        minWidth: 0,
        flex: '1 1 0px'
      }}>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          backgroundColor: 'var(--bg-file-list)',
          border: '1px solid var(--mantine-color-gray-2)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          {activeSource === 'recent' && (
            <div style={{ 
              flexShrink: 0,
              borderBottom: '1px solid var(--mantine-color-gray-3)'
            }}>
              <SearchInput />
            </div>
          )}
          
          <div style={{ flex: 1, minHeight: 0 }}>
            <FileListArea
              scrollAreaHeight={`calc(${modalHeight} )`}
              scrollAreaStyle={{ 
                height: activeSource === 'recent' && recentFiles.length > 0 ? modalHeight : '100%',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: 0
              }}
            />
          </div>
        </div>
      </Grid.Col>
      
      {/* Column 3: File Details */}
      <Grid.Col p="xl" span="content" style={{ 
        minWidth: '25rem', 
        width: '25rem', 
        flexShrink: 0, 
        height: '100%',
        maxWidth: '18rem'
      }}>
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <FileDetails />
        </div>
      </Grid.Col>
      
      {/* Hidden file input for local file selection */}
      <HiddenFileInput />
    </Grid>
  );
};

export default DesktopLayout;