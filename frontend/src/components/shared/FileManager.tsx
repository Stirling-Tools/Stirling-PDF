import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { FileSource } from './fileManager/types';

interface FileManagerProps {
  selectedTool?: Tool | null;
}

const FileManager: React.FC<FileManagerProps> = ({ selectedTool }) => {
  const { t } = useTranslation();
  const { isFilesModalOpen, closeFilesModal, onFileSelect, onFilesSelect } = useFilesModalContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSource, setActiveSource] = useState<FileSource>('recent');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
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

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      try {
        // Store files in IndexedDB and get FileWithUrl objects
        const storedFiles = await Promise.all(
          files.map(async (file) => {
            await storeFile(file);
            return file;
          })
        );
        
        onFilesSelect(storedFiles);
        await refreshRecentFiles();
      } catch (error) {
        console.error('Failed to process uploaded files:', error);
      }
    }
    // Clear the input
    event.target.value = '';
  }, [storeFile, onFilesSelect, refreshRecentFiles]);

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

  const handleRecentFileSelection = useCallback(async (file: FileWithUrl) => {
    try {
      const fileObj = await convertToFile(file);
      if (onFileSelect) {
        onFileSelect(fileObj);
      } else {
        onFilesSelect([fileObj]);
      }
    } catch (error) {
      console.error('Failed to select recent file:', error);
    }
  }, [onFileSelect, onFilesSelect, convertToFile]);

  // Selection handlers
  const selectionHandlers = {
    toggleSelection: (fileId: string) => {
      setSelectedFileIds(prev => 
        prev.includes(fileId) 
          ? prev.filter(id => id !== fileId)
          : [...prev, fileId]
      );
    },
    clearSelection: () => setSelectedFileIds([])
  };
  
  const selectedFiles = recentFiles.filter(file => 
    selectedFileIds.includes(file.id || file.name)
  );
  
  const filteredFiles = recentFiles.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const handleOpenFiles = useCallback(() => {
    if (selectedFiles.length > 0) {
      const filesAsFileObjects = selectedFiles.map(fileWithUrl => {
        const file = new File([], fileWithUrl.name, { type: fileWithUrl.type });
        Object.defineProperty(file, 'size', { value: fileWithUrl.size || 0 });
        Object.defineProperty(file, 'lastModified', { value: fileWithUrl.lastModified || Date.now() });
        return file;
      });
      onFilesSelect(filesAsFileObjects);
      selectionHandlers.clearSelection();
    }
  }, [selectedFiles, onFilesSelect, selectionHandlers]);
  
  const handleFileSelect = useCallback((file: FileWithUrl) => {
    selectionHandlers.toggleSelection(file.id || file.name);
  }, [selectionHandlers]);
  
  const handleFileDoubleClick = useCallback(async (file: FileWithUrl) => {
    try {
      const fileObj = await convertToFile(file);
      onFilesSelect([fileObj]);
    } catch (error) {
      console.error('Failed to load file on double-click:', error);
    }
  }, [convertToFile, onFilesSelect]);

  const handleRemoveFileByIndex = useCallback(async (index: number) => {
    await handleRemoveFile(index, recentFiles, setRecentFiles);
    const file = recentFiles[index];
    setSelectedFileIds(prev => prev.filter(id => id !== (file.id || file.name)));
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
      setActiveSource('recent');
      setSearchTerm('');
      setSelectedFileIds([]);
      setIsDragging(false);
    }
  }, [isFilesModalOpen, refreshRecentFiles]);

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
          {isMobile ? (
            <MobileLayout
              activeSource={activeSource}
              onSourceChange={setActiveSource}
              onLocalFileClick={openFileDialog}
              selectedFiles={selectedFiles}
              onOpenFiles={handleOpenFiles}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              recentFiles={recentFiles}
              filteredFiles={filteredFiles}
              selectedFileIds={selectedFileIds}
              onFileSelect={handleFileSelect}
              onFileRemove={handleRemoveFileByIndex}
              onFileDoubleClick={handleFileDoubleClick}
              isFileSupported={isFileSupported}
              modalHeight={modalHeight}
              fileInputRef={fileInputRef}
              onFileInputChange={handleFileInputChange}
            />
          ) : (
            <DesktopLayout
              activeSource={activeSource}
              onSourceChange={setActiveSource}
              onLocalFileClick={openFileDialog}
              selectedFiles={selectedFiles}
              onOpenFiles={handleOpenFiles}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              recentFiles={recentFiles}
              filteredFiles={filteredFiles}
              selectedFileIds={selectedFileIds}
              onFileSelect={handleFileSelect}
              onFileRemove={handleRemoveFileByIndex}
              onFileDoubleClick={handleFileDoubleClick}
              isFileSupported={isFileSupported}
              fileInputRef={fileInputRef}
              onFileInputChange={handleFileInputChange}
              modalHeight={modalHeight}
            />
          )}
        </Dropzone>
        
        <DragOverlay isVisible={isDragging} />
      </div>
    </Modal>
  );
};

export default FileManager;