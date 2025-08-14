import React, { useState, useCallback, useEffect } from 'react';
import { Modal } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { FileMetadata } from '../types/file';
import { useFileManager } from '../hooks/useFileManager';
import { useFilesModalContext } from '../contexts/FilesModalContext';
import { createFileId } from '../types/fileContext';
import { Tool } from '../types/tool';
import MobileLayout from './fileManager/MobileLayout';
import DesktopLayout from './fileManager/DesktopLayout';
import DragOverlay from './fileManager/DragOverlay';
import { FileManagerProvider } from '../contexts/FileManagerContext';

interface FileManagerProps {
  selectedTool?: Tool | null;
}

const FileManager: React.FC<FileManagerProps> = ({ selectedTool }) => {
  const { isFilesModalOpen, closeFilesModal, onFilesSelect } = useFilesModalContext();
  const [recentFiles, setRecentFiles] = useState<FileMetadata[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { loadRecentFiles, handleRemoveFile, storeFile, convertToFile } = useFileManager();

  // Wrapper for storeFile that generates UUID
  const storeFileWithId = useCallback(async (file: File) => {
    const fileId = createFileId(); // Generate UUID for storage
    return await storeFile(file, fileId);
  }, [storeFile]);

  // File management handlers
  const isFileSupported = useCallback((fileName: string) => {
    if (!selectedTool?.supportedFormats) return true;
    const extension = fileName.split('.').pop()?.toLowerCase();
    return selectedTool.supportedFormats.includes(extension || '');
  }, [selectedTool?.supportedFormats]);

  const refreshRecentFiles = useCallback(async () => {
    const files = await loadRecentFiles();
    setRecentFiles(files);
  }, [loadRecentFiles]);

  const handleFilesSelected = useCallback(async (files: FileMetadata[]) => {
    try {
      const fileObjects = await Promise.all(
        files.map(async (fileWithUrl) => {
          return await convertToFile(fileWithUrl);
        })
      );
      onFilesSelect(fileObjects);
    } catch (error) {
      console.error('Failed to process selected files:', error);
    }
  }, [convertToFile, onFilesSelect]);

  const handleNewFileUpload = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      try {
        // Files will get IDs assigned through onFilesSelect -> FileContext addFiles
        onFilesSelect(files);
        await refreshRecentFiles();
      } catch (error) {
        console.error('Failed to process dropped files:', error);
      }
    }
  }, [onFilesSelect, refreshRecentFiles]);

  const handleRemoveFileByIndex = useCallback(async (index: number) => {
    await handleRemoveFile(index, recentFiles, setRecentFiles);
  }, [handleRemoveFile, recentFiles]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1030);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isFilesModalOpen) {
      refreshRecentFiles();
    } else {
      // Reset state when modal is closed
      setIsDragging(false);
    }
  }, [isFilesModalOpen, refreshRecentFiles]);

  // Cleanup any blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // FileMetadata doesn't have blob URLs, so no cleanup needed
      // Blob URLs are managed by FileContext and tool operations
      console.log('FileManager unmounting - FileContext handles blob URL cleanup');
    };
  }, []);

  // Modal size constants for consistent scaling
  const modalHeight = '80vh';
  const modalWidth = isMobile ? '100%' : '80vw';
  const modalMaxWidth = isMobile ? '100%' : '1200px';
  const modalMaxHeight = '1200px';
  const modalMinWidth = isMobile ? '320px' : '800px';

  return (
    <Modal
      opened={isFilesModalOpen}
      onClose={closeFilesModal}
      size={isMobile ? "100%" : "auto"}
      centered
      radius={30}
      className="overflow-hidden p-0"
      withCloseButton={false}
      styles={{
        content: { 
          position: 'relative',
          margin: isMobile ? '1rem' : '2rem'
        },
        body: { padding: 0 },
        header: { display: 'none' }
      }}
    >
      <div style={{ 
        position: 'relative', 
        height: modalHeight, 
        width: modalWidth, 
        maxWidth: modalMaxWidth, 
        maxHeight: modalMaxHeight, 
        minWidth: modalMinWidth,
        margin: '0 auto',
        overflow: 'hidden'
      }}>
        <Dropzone
          onDrop={handleNewFileUpload}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          accept={["*/*"]}
          multiple={true}
          activateOnClick={false}
          style={{ 
            height: '100%', 
            width: '100%',
            border: 'none',
            borderRadius: '30px',
            backgroundColor: 'var(--bg-file-manager)'
          }}
          styles={{
            inner: { pointerEvents: 'all' }
          }}
        >
          <FileManagerProvider
            recentFiles={recentFiles}
            onFilesSelected={handleFilesSelected}
            onClose={closeFilesModal}
            isFileSupported={isFileSupported}
            isOpen={isFilesModalOpen}
            onFileRemove={handleRemoveFileByIndex}
            modalHeight={modalHeight}
            storeFile={storeFileWithId}
            refreshRecentFiles={refreshRecentFiles}
          >
            {isMobile ? <MobileLayout /> : <DesktopLayout />}
          </FileManagerProvider>
        </Dropzone>
        
        <DragOverlay isVisible={isDragging} />
      </div>
    </Modal>
  );
};

export default FileManager;