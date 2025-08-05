import React from 'react';
import { Grid, Center, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FileWithUrl } from '../../../types/file';
import FileSourceButtons from './FileSourceButtons';
import FileDetails from './FileDetails';
import SearchInput from './SearchInput';
import FileListArea from './FileListArea';
import HiddenFileInput from './HiddenFileInput';
import { FileSource } from './types';

interface DesktopLayoutProps {
  activeSource: FileSource;
  onSourceChange: (source: FileSource) => void;
  onLocalFileClick: () => void;
  selectedFiles: FileWithUrl[];
  onOpenFiles: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  recentFiles: FileWithUrl[];
  filteredFiles: FileWithUrl[];
  selectedFileIds: string[];
  onFileSelect: (file: FileWithUrl) => void;
  onFileRemove: (index: number) => void;
  onFileDoubleClick: (file: FileWithUrl) => void;
  isFileSupported: (fileName: string) => boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  modalHeight: string;
}

const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  activeSource,
  onSourceChange,
  onLocalFileClick,
  selectedFiles,
  onOpenFiles,
  searchTerm,
  onSearchChange,
  recentFiles,
  filteredFiles,
  selectedFileIds,
  onFileSelect,
  onFileRemove,
  onFileDoubleClick,
  isFileSupported,
  fileInputRef,
  onFileInputChange,
  modalHeight,
}) => {
  const { t } = useTranslation();

  return (
    <Grid gutter="md" h="100%" grow={false} style={{ flexWrap: 'nowrap' }}>
      {/* Column 1: File Sources */}
      <Grid.Col span="content" style={{ 
        minWidth: '15.625rem', 
        width: '15.625rem', 
        flexShrink: 0, 
        height: '100%',
      }}>
        <FileSourceButtons
          activeSource={activeSource}
          onSourceChange={onSourceChange}
          onLocalFileClick={onLocalFileClick}
        />
      </Grid.Col>
      
      {/* Column 2: File List */}
      <Grid.Col span="auto" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {activeSource === 'recent' && (
          <SearchInput
            value={searchTerm}
            onChange={onSearchChange}
            style={{ marginBottom: '1rem', flexShrink: 0 }}
          />
        )}
        
        <div style={{ flex: 1, minHeight: 0 }}>
          <FileListArea
            activeSource={activeSource}
            recentFiles={recentFiles}
            filteredFiles={filteredFiles}
            selectedFileIds={selectedFileIds}
            onFileSelect={onFileSelect}
            onFileRemove={onFileRemove}
            onFileDoubleClick={onFileDoubleClick}
            isFileSupported={isFileSupported}
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
          <FileDetails
            selectedFiles={selectedFiles}
            onOpenFiles={onOpenFiles}
            modalHeight={modalHeight}
          />
        </div>
      </Grid.Col>
      
      {/* Hidden file input for local file selection */}
      <HiddenFileInput
        fileInputRef={fileInputRef}
        onFileInputChange={onFileInputChange}
      />
    </Grid>
  );
};

export default DesktopLayout;