import React from 'react';
import { Stack, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FileWithUrl } from '../../../types/file';
import FileSourceButtons from './FileSourceButtons';
import FileDetails from './FileDetails';
import SearchInput from './SearchInput';
import FileListArea from './FileListArea';
import HiddenFileInput from './HiddenFileInput';
import { FileSource } from './types';

interface MobileLayoutProps {
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
  modalHeight: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({
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
  modalHeight,
  fileInputRef,
  onFileInputChange,
}) => {
  const { t } = useTranslation();

  return (
    <Stack h="100%" gap="sm" p="sm">
      {/* Section 1: File Sources - Fixed at top */}
      <Box style={{ flexShrink: 0 }}>
        <FileSourceButtons
          activeSource={activeSource}
          onSourceChange={onSourceChange}
          onLocalFileClick={onLocalFileClick}
          horizontal={true}
        />
      </Box>
      
      <Box style={{ flexShrink: 0 }}>
        <FileDetails
          selectedFiles={selectedFiles}
          onOpenFiles={onOpenFiles}
          compact={true}
          modalHeight={modalHeight}
        />
      </Box>
      
      {/* Section 3: Search Bar - Fixed above file list */}
      {activeSource === 'recent' && (
        <Box style={{ flexShrink: 0 }}>
          <SearchInput
            value={searchTerm}
            onChange={onSearchChange}
          />
        </Box>
      )}
      
      {/* Section 4: File List - Fixed height scrollable area */}
      <Box style={{ flexShrink: 0 }}>
        <FileListArea
          activeSource={activeSource}
          recentFiles={recentFiles}
          filteredFiles={filteredFiles}
          selectedFileIds={selectedFileIds}
          onFileSelect={onFileSelect}
          onFileRemove={onFileRemove}
          onFileDoubleClick={onFileDoubleClick}
          isFileSupported={isFileSupported}
          scrollAreaHeight={`calc(${modalHeight} - ${selectedFiles.length > 0 ? '300px' : '200px'})`}
          scrollAreaStyle={{ maxHeight: '400px', minHeight: '150px' }}
        />
      </Box>
      
      {/* Hidden file input for local file selection */}
      <HiddenFileInput
        fileInputRef={fileInputRef}
        onFileInputChange={onFileInputChange}
      />
    </Stack>
  );
};

export default MobileLayout;