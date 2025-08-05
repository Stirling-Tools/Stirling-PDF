import React, { useState, useCallback, useEffect } from 'react';
import { Modal } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import { FileWithUrl } from '../../types/file';
import { useFileManager } from '../../hooks/useFileManager';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { Tool } from '../../types/tool';
import MobileLayout from './fileManager/MobileLayout';
import DesktopLayout from './fileManager/DesktopLayout';
import DragOverlay from './fileManager/DragOverlay';
import { FileManagerProvider } from './fileManager/FileManagerContext';

interface FileManagerProps {
  selectedTool?: Tool | null;
}

const FileManager: React.FC<FileManagerProps> = ({ selectedTool }) => {
  const { t } = useTranslation();
  const { isFilesModalOpen, closeFilesModal, onFileSelect, onFilesSelect } = useFilesModalContext();
  const [recentFiles, setRecentFiles] = useState<FileWithUrl[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { loadRecentFiles, handleRemoveFile, storeFile, convertToFile } = useFileManager();

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

  const handleFilesSelected = useCallback(async (files: FileWithUrl[]) => {
    try {
      const fileObjects = await Promise.all(
        files.map(async (fileWithUrl) => {
          if (fileWithUrl.file) {
            return fileWithUrl.file;
          }
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
        // Store files and refresh recent files
        await Promise.all(files.map(file => storeFile(file)));
        onFilesSelect(files);
        await refreshRecentFiles();
      } catch (error) {
        console.error('Failed to process dropped files:', error);
      }
    }
  }, [storeFile, onFilesSelect, refreshRecentFiles]);

  const handleRemoveFileByIndex = useCallback(async (index: number) => {
    await handleRemoveFile(index, recentFiles, setRecentFiles);
  }, [handleRemoveFile, recentFiles]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
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
      // Clean up blob URLs from recent files
      recentFiles.forEach(file => {
        if (file.url && file.url.startsWith('blob:')) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, [recentFiles]);

  // Modal size constants for consistent scaling
  const modalHeight = '80vh';
  const modalWidth = isMobile ? '100%' : '60vw';
  const modalMaxWidth = isMobile ? '100%' : '1200px';
  const modalMaxHeight = '1200px';
  const modalMinWidth = isMobile ? '320px' : '1030px';

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
            padding: '1rem', 
            height: '100%', 
            width: '100%',
            border: 'none',
            borderRadius: '30px',
            backgroundColor: 'transparent'
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